import {
  ALL_EVIDENCES,
  BEHAVIOR_BY_ID,
  EvidenceState,
  EvidenceType,
  GhostProfile,
  GHOSTS,
} from '../data/ghosts';

export interface HuntRecord {
  huntNumber: number;
  startedAtSanity: number | null;
  firstMps: number;
  minMps: number;
  maxMps: number;
  avgMps: number;
  durationSec: number;
  losAccelerated: boolean;
}

export interface SolverInput {
  evidenceStates: Record<EvidenceType, EvidenceState>;
  evidenceConfidence: Partial<Record<EvidenceType, number>>;
  evidenceCountSetting: number; // 0, 1, 2, or 3
  observedSpeedMps: number | null;
  currentSanity: number;
  huntStartedAtSanity: number | null;
  activeBehaviors: string[];
  manualExcludedGhosts: string[];
  huntHistory?: HuntRecord[];
}

export interface EvaluatedGhost {
  ghost: GhostProfile;
  eliminated: boolean;
  reasons: string[];
  matchScore: number; // 0..100 raw match score
  posteriorPct?: number; // 1..99 normalized Bayesian posterior probability among remaining
  mimicWarning?: boolean;
}

export interface AdvisorRecommendation {
  headline: string;
  detail: string;
  badge: string;
}

export function evaluateGhosts(input: SolverInput): {
  candidates: EvaluatedGhost[];
  eliminated: EvaluatedGhost[];
  advisor: AdvisorRecommendation;
} {
  const confirmedEv = ALL_EVIDENCES.filter(
    (e) => input.evidenceStates[e] === 'confirmed'
  );
  const suspectedEv = ALL_EVIDENCES.filter(
    (e) => input.evidenceStates[e] === 'suspected'
  );
  const ruledOutEv = ALL_EVIDENCES.filter(
    (e) => input.evidenceStates[e] === 'ruled_out'
  );
  const hunts = input.huntHistory ?? [];

  const allEvaluated: EvaluatedGhost[] = GHOSTS.map((ghost) => {
    const reasons: string[] = [];
    let eliminated = false;
    let score = 60;
    let mimicWarning = false;

    if (input.manualExcludedGhosts.includes(ghost.name)) {
      eliminated = true;
      reasons.push('Manually crossed out');
    }

    const effectiveEvidences: EvidenceType[] = ghost.fakeEvidence
      ? [...ghost.evidences, ghost.fakeEvidence]
      : ghost.evidences;

    // 1. Check Confirmed Evidence
    for (const cEv of confirmedEv) {
      if (!effectiveEvidences.includes(cEv)) {
        eliminated = true;
        reasons.push(`Does not have ${cEv}`);
      } else {
        score += 14;
      }
    }

    // 2. Check Evidence Count Cap vs Fake Orb (The Mimic)
    const realConfirmedCount = confirmedEv.filter(
      (e) => e !== ghost.fakeEvidence
    ).length;
    if (realConfirmedCount > input.evidenceCountSetting) {
      eliminated = true;
      reasons.push(
        `Exceeds ${input.evidenceCountSetting}-evidence limit for difficulty`
      );
    }

    if (
      ghost.name === 'The Mimic' &&
      confirmedEv.includes('Ghost Orb') &&
      confirmedEv.length > input.evidenceCountSetting
    ) {
      score += 25;
      mimicWarning = true;
    }

    // 3. Check Ruled-Out Evidence (Valid on 3-evidence or for Forced/Fake evidence)
    for (const rEv of ruledOutEv) {
      if (input.evidenceCountSetting === 3 && ghost.evidences.includes(rEv)) {
        eliminated = true;
        reasons.push(`Missing required ${rEv}`);
      } else if (ghost.forcedEvidence === rEv) {
        eliminated = true;
        reasons.push(`Missing forced evidence: ${rEv}`);
      } else if (ghost.fakeEvidence === rEv) {
        eliminated = true;
        reasons.push(`Missing guaranteed fake ${rEv}`);
      }
    }

    // 4. Forced Evidence Check on Nightmare (2) or Insanity (1)
    if (
      ghost.forcedEvidence &&
      input.evidenceCountSetting > 0 &&
      input.evidenceCountSetting < 3
    ) {
      const nonFakeConfirmed = confirmedEv.filter(
        (e) => e !== ghost.fakeEvidence
      );
      if (
        nonFakeConfirmed.length >= input.evidenceCountSetting &&
        !nonFakeConfirmed.includes(ghost.forcedEvidence)
      ) {
        eliminated = true;
        reasons.push(
          `Found ${nonFakeConfirmed.length} evidence without forced ${ghost.forcedEvidence}`
        );
      }
    }

    // 5. Suspected Evidence Boost
    for (const sEv of suspectedEv) {
      if (effectiveEvidences.includes(sEv)) {
        const conf = input.evidenceConfidence[sEv] ?? 0.65;
        score += Math.round(conf * 12);
      }
    }

    // 6. Behavioral Confirmations & Eliminations (rules derived from BEHAVIOR_TAGS)
    for (const bId of input.activeBehaviors) {
      if (ghost.ruleOutBehaviors.includes(bId)) {
        eliminated = true;
        const label = BEHAVIOR_BY_ID[bId]?.label ?? bId;
        reasons.push(`Ruled out by observed behavior: ${label}`);
      }
      if (ghost.confirmBehaviors.includes(bId)) {
        score += 30;
      }
    }

    // 6b. Line-of-Sight speed-up heard during a chase.
    // Thaye is hard-eliminated via the tag's `excludes`. Other no-LoS ghosts
    // (Revenant, Hantu, Deogen) CAN change speed for other reasons, so only soft-penalize them.
    if (input.activeBehaviors.includes('los_speedup') && ghost.name !== 'The Mimic') {
      score += ghost.losAccelerates ? 6 : -12;
    }

    // 7. Observed Footstep Speed (m/s) Filtering & Scoring
    if (input.observedSpeedMps !== null && input.observedSpeedMps > 0.2) {
      const spd = input.observedSpeedMps;
      const closestDiff = Math.min(
        ...ghost.altSpeedsMps.map((target) => Math.abs(target - spd))
      );

      // Account for LoS acceleration up to 1.65x base speed for LoS ghosts
      const maxLosSpeed = ghost.losAccelerates
        ? Math.max(...ghost.altSpeedsMps) * 1.65
        : Math.max(...ghost.altSpeedsMps);
      const minPossible = Math.min(...ghost.altSpeedsMps);

      if (closestDiff <= 0.22) {
        score += 22;
      } else if (
        ghost.losAccelerates &&
        spd >= minPossible - 0.18 &&
        spd <= maxLosSpeed + 0.2
      ) {
        score += 8;
      } else {
        score -= 28;
        if (closestDiff > 0.48 && ghost.name !== 'The Mimic') {
          eliminated = true;
          reasons.push(
            `Footstep speed ${spd.toFixed(2)} m/s incompatible with ${ghost.speedSummary}`
          );
        }
      }
    }

    // 8. Sanity Hunt Threshold Boost
    // `huntStartedAtSanity` is only recorded from a FRESH truck reading (see App.tsx), so it is trustworthy here.
    const sanityRef = input.huntStartedAtSanity ?? null;
    if (sanityRef !== null) {
      const maxHuntSanity =
        ghost.name === 'Onryo' && input.activeBehaviors.includes('onryo_three_flames')
          ? 100 // Onryo can hunt at any sanity only after its 3rd-flame trigger
          : ghost.maxHuntSanity ?? ghost.huntSanity;

      if (sanityRef > maxHuntSanity + 5) {
        score -= 22;
      } else if (sanityRef > 52 && maxHuntSanity >= sanityRef) {
        score += 18;
      }

      // 8b. Binary-Exact Moroi Sanity-Speed Coupling (RVA 0x214B9C0) & Thaye Age-Sanity-Speed Coupling (RVA 0x214BBD0)
      if (input.observedSpeedMps !== null && input.observedSpeedMps > 0.2) {
        const obsSpd = input.observedSpeedMps;
        if (ghost.name === 'Moroi') {
          const stepIdx = Math.min(
            9,
            Math.max(0, Math.floor((45 - sanityRef) / 5) + (sanityRef < 45 ? 1 : 0))
          );
          const moroiBase = Math.max(1.5, Math.min(2.25, 1.5 + stepIdx * 0.0833));
          const moroiMaxLos = moroiBase * 1.65;
          if (obsSpd >= moroiBase - 0.18 && obsSpd <= moroiMaxLos + 0.18) {
            score += 14;
          } else {
            score -= 18;
          }
        }
        if (ghost.name === 'Thaye' && sanityRef > 50) {
          const maxAge = Math.max(0, Math.floor((75 - sanityRef) / 6));
          const minThayeSpd = 2.75 - maxAge * 0.175;
          if (obsSpd < minThayeSpd - 0.25) {
            score -= 25;
          }
        }
      }
    }

    // 9. Multi-Hunt History Analysis (cross-hunt & intra-hunt speed signatures)
    if (hunts.length > 0) {
      if (
        ghost.name === 'The Twins' &&
        hunts.some((h) => h.avgMps >= 1.38 && h.avgMps <= 1.62) &&
        hunts.some((h) => h.avgMps >= 1.78 && h.avgMps <= 2.02)
      ) {
        score += 28;
      }
      if (
        ghost.name === 'Thaye' &&
        hunts.length >= 2 &&
        hunts[0].avgMps - hunts[hunts.length - 1].avgMps >= 0.25 &&
        !hunts.some((h) => h.losAccelerated)
      ) {
        score += 26;
      }
      if (
        ghost.name === 'Gallu' &&
        hunts.some((h) => h.avgMps >= 1.84 && h.avgMps <= 2.10) &&
        hunts.some((h) => h.avgMps >= 1.22 && h.avgMps <= 1.46)
      ) {
        score += 24;
      }
      if (hunts.some((h) => h.maxMps - h.minMps >= 0.45)) {
        if (
          (ghost.name === 'Revenant' || ghost.name === 'Deogen') &&
          hunts.some((h) => h.minMps <= 1.15 && h.maxMps >= 2.60)
        ) {
          score += 20;
        }
        if (
          ghost.name === 'Obambo' &&
          hunts.some(
            (h) =>
              !h.losAccelerated &&
              h.minMps >= 1.35 &&
              h.minMps <= 1.55 &&
              h.maxMps >= 1.85 &&
              h.maxMps <= 2.10
          )
        ) {
          score += 18;
        }
      }
    }

    return {
      ghost,
      eliminated,
      reasons,
      matchScore: Math.max(5, Math.min(99, score)),
      mimicWarning,
    };
  });

  const candidates = allEvaluated
    .filter((g) => !g.eliminated)
    .sort((a, b) => b.matchScore - a.matchScore);
  const eliminated = allEvaluated.filter((g) => g.eliminated);

  // Normalized Bayesian posterior likelihood across remaining candidates
  const weights = candidates.map((c) => Math.exp((c.matchScore - 60) / 16));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const probs = weights.map((w) => w / totalWeight);
  candidates.forEach((c, i) => {
    c.posteriorPct = Math.max(1, Math.min(99, Math.round(probs[i] * 100)));
  });

  const advisor = buildAdvisorRecommendation(
    candidates,
    probs,
    confirmedEv,
    suspectedEv,
    ruledOutEv,
    input
  );

  return { candidates, eliminated, advisor };
}

function buildAdvisorRecommendation(
  candidates: EvaluatedGhost[],
  probs: number[],
  confirmedEv: EvidenceType[],
  suspectedEv: EvidenceType[],
  ruledOutEv: EvidenceType[],
  input: SolverInput
): AdvisorRecommendation {
  if (candidates.length === 0) {
    return {
      badge: 'CONFLICT',
      headline: 'No ghosts match current filters',
      detail: 'Press Alt+Z to undo the last auto-detection or check if The Mimic faked Ghost Orbs.',
    };
  }

  if (candidates.length === 1) {
    const winner = candidates[0].ghost;
    const mimicPossible = candidates.some((c) => c.ghost.name === 'The Mimic');
    return {
      badge: 'SOLVED',
      headline: `Identified: ${winner.name}`,
      detail:
        winner.evidences.includes('Spirit Box') &&
        winner.evidences.includes('Ultraviolet') &&
        winner.evidences.includes('Freezing Temperatures') &&
        !mimicPossible
          ? `Confirmed ${winner.name}! Double-check for fake Ghost Orbs just in case of The Mimic.`
          : winner.zeroEvidenceTests[0],
    };
  }

  if (suspectedEv.length > 0) {
    const topSus = suspectedEv[0];
    return {
      badge: 'VERIFY CUE',
      headline: `Verify suspected ${topSus}`,
      detail: `CV/Audio detected a pending ${topSus} cue. Re-scan with your tool or confirm it in the overlay.`,
    };
  }

  // If we still can collect more evidence on this difficulty, pick the evidence maximizing expected information gain (Shannon entropy)
  if (confirmedEv.length < input.evidenceCountSetting) {
    const untested = ALL_EVIDENCES.filter(
      (e) => !confirmedEv.includes(e) && !ruledOutEv.includes(e)
    );
    let bestEv: EvidenceType | null = null;
    let bestInfoGain = -1;

    for (const ev of untested) {
      const hasMask = candidates.map(
        (c) => c.ghost.evidences.includes(ev) || c.ghost.fakeEvidence === ev
      );
      const hasCount = hasMask.filter(Boolean).length;
      // Only consider tests that actually split the candidates (some have it, some don't)
      if (hasCount === 0 || hasCount === candidates.length) {
        continue;
      }

      let pHas = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (hasMask[i]) pHas += probs[i];
      }
      const pClamped = Math.max(1e-6, Math.min(1 - 1e-6, pHas));
      const entropy =
        -(pClamped * Math.log2(pClamped) + (1 - pClamped) * Math.log2(1 - pClamped));
      const forcedBonus =
        candidates.some((c) => c.ghost.forcedEvidence === ev) &&
        input.evidenceCountSetting < 3
          ? 1.15
          : 1.0;
      const gain = entropy * forcedBonus;

      if (gain > bestInfoGain) {
        bestInfoGain = gain;
        bestEv = ev;
      }
    }

    if (bestEv) {
      const matchingNames = candidates
        .filter(
          (c) =>
            c.ghost.evidences.includes(bestEv!) ||
            c.ghost.fakeEvidence === bestEv
        )
        .map((c) => c.ghost.name)
        .slice(0, 4)
        .join(', ');
      return {
        badge: 'NEXT TEST',
        headline: `Test for ${bestEv}`,
        detail: `Highest info gain across ${candidates.length} remaining ghosts (${matchingNames}${candidates.length > 4 ? '...' : ''}).`,
      };
    }
  }

  // Otherwise recommend a 0-evidence / behavioral test between the top 2 candidates
  const top1 = candidates[0];
  const top2 = candidates[1];
  const p1 = top1.posteriorPct ?? top1.matchScore;
  const p2 = top2.posteriorPct ?? top2.matchScore;
  return {
    badge: 'BEHAVIOR TEST',
    headline: `${top1.ghost.name} (${p1}%) vs ${top2.ghost.name} (${p2}%) — ${candidates.length} left`,
    detail: top1.ghost.zeroEvidenceTests[0] || top2.ghost.zeroEvidenceTests[0],
  };
}
