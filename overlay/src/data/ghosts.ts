export type EvidenceType =
  | 'EMF Level 5'
  | 'Ultraviolet'
  | 'Ghost Writing'
  | 'Freezing Temperatures'
  | 'D.O.T.S Projector'
  | 'Ghost Orb'
  | 'Spirit Box';

export type EvidenceState = 'unknown' | 'confirmed' | 'ruled_out' | 'suspected';

export interface BehaviorRule {
  id: string;
  label: string;
  category: 'speed' | 'sanity' | 'ability' | 'blink' | 'smudge' | 'hunt';
  description: string;
  confirms?: string[];
  excludes?: string[];
  exclusive?: boolean;
}

export interface GhostProfile {
  name: string;
  evidences: EvidenceType[];
  forcedEvidence?: EvidenceType;
  fakeEvidence?: EvidenceType;
  huntSanity: number;
  specialSanityNote?: string;
  baseSpeedMps: number;
  altSpeedsMps: number[];
  losAccelerates: boolean;
  speedSummary: string;
  blinkStyle: 'normal' | 'invisible_long' | 'visible_long' | 'shapeshift';
  smudgeLockoutSec: number;
  huntCooldownSec: number;
  zeroEvidenceTests: string[];
  /** Highest average sanity this ghost can hunt at via its own ability (defaults to huntSanity). */
  maxHuntSanity?: number;
  confirmBehaviors: string[];
  ruleOutBehaviors: string[];
}

type GhostData = Omit<GhostProfile, 'confirmBehaviors' | 'ruleOutBehaviors'>;

export const ALL_EVIDENCES: EvidenceType[] = [
  'EMF Level 5',
  'Ultraviolet',
  'Ghost Writing',
  'Freezing Temperatures',
  'D.O.T.S Projector',
  'Ghost Orb',
  'Spirit Box',
];

/**
 * Behavior rules are the single source of truth for behavioral confirmations / eliminations.
 *  - `confirms`:  ghosts that get a score boost when this behavior is observed.
 *  - `excludes`:  ghosts that can NEVER do this (eliminated when observed).
 *  - `exclusive`: ONLY the `confirms` ghosts can do this -> every other ghost is eliminated.
 * The Mimic copies other ghosts' abilities, so it is never eliminated by behaviors.
 */
export const BEHAVIOR_TAGS: BehaviorRule[] = [
  // --- Unique ghost abilities (exclusive: only one ghost can do these) ---
  { id: 'banshee_scream', label: 'Parabolic Banshee Wail', category: 'ability', description: 'Unique high-pitched scream heard on the Parabolic Microphone.', confirms: ['Banshee'], exclusive: true },
  { id: 'deogen_breath', label: 'Heavy Spirit Box Breathing', category: 'ability', description: 'Heavy bull-like breathing heard within 1m of the ghost using Spirit Box.', confirms: ['Deogen'], exclusive: true },
  { id: 'obake_six_finger', label: '6-Finger UV / Shapeshift Blink', category: 'ability', description: 'Leaves a 6-finger handprint or briefly shapeshifts model during a hunt blink.', confirms: ['Obake'], exclusive: true },
  { id: 'phantom_photo', label: 'Vanished in Ghost Photo', category: 'ability', description: 'Ghost disappears in the photo without static when photographed outside a hunt.', confirms: ['Phantom'], exclusive: true },
  { id: 'hantu_breath', label: 'Visible Cold Breath on Ghost (Breaker Off)', category: 'ability', description: 'Ghost emits freezing breath from its mouth during a hunt while the fuse box is OFF.', confirms: ['Hantu'], exclusive: true },

  // --- Strong tells (boost a ghost but don't eliminate others) ---
  { id: 'mare_light_off', label: 'Instant Light Switch Off', category: 'ability', description: 'Ghost immediately switches off a light within 1s of you turning it on.', confirms: ['Mare'] },
  { id: 'yurei_door_slam', label: 'Full Door Slam Outside Event', category: 'ability', description: 'Fully closes an open door with a delayed click + drains 15% sanity.', confirms: ['Yurei'] },
  { id: 'polter_bomb', label: 'Multi-Item Poltergeist Throw', category: 'ability', description: 'Throws multiple items simultaneously with high velocity.', confirms: ['Poltergeist'] },
  { id: 'onryo_three_flames', label: 'Hunted After 3rd Flame Blowout', category: 'ability', description: 'Triggers a hunt immediately after extinguishing every 3rd firelight.', confirms: ['Onryo'] },
  { id: 'twins_double', label: 'Two Interactions in Different Rooms at Once', category: 'ability', description: 'Two interactions far apart within ~0.5s of each other (The Twins).', confirms: ['The Twins'] },
  { id: 'moroi_pill_slow', label: 'Ghost Slowed After Sanity Pills', category: 'speed', description: 'Hunt speed noticeably dropped after the team took Sanity Medication (Moroi).', confirms: ['Moroi'] },
  { id: 'raiju_electronics_boost', label: 'Sped Up Near Active Electronics', category: 'speed', description: 'Ghost surged to ~2.5 m/s when passing near turned-on equipment (Raiju).', confirms: ['Raiju'] },

  // --- Things certain ghosts can NEVER do ---
  { id: 'oni_airball', label: 'Ghost Mist / Airball Event', category: 'ability', description: 'White mist ball flies at a player with a hiss (Oni can NEVER do this).', excludes: ['Oni'] },
  { id: 'ghost_light_on', label: 'Turned a Light ON', category: 'ability', description: 'Ghost turned a room light or lamp ON (Mare can NEVER do this).', excludes: ['Mare'] },
  { id: 'jinn_breaker_off', label: 'Turned Fuse Box OFF Directly', category: 'ability', description: 'Ghost turned off the breaker without tripping it from too many lights (Jinn cannot do this).', excludes: ['Jinn'] },
  { id: 'salt_stepped', label: 'Ghost Stepped in Salt', category: 'ability', description: 'Salt pile was disturbed / UV footprints left in salt (Wraith can NEVER step in salt).', excludes: ['Wraith'] },
  { id: 'dots_naked_eye', label: 'D.O.T.S Seen Without a Camera', category: 'ability', description: 'D.O.T.S silhouette seen with your own eyes (Goryo only shows on camera with nobody in the room).', excludes: ['Goryo'] },
  { id: 'ghost_room_changed', label: 'Ghost Changed Favorite Room', category: 'ability', description: 'The ghost room moved during the investigation (Goryo never changes its room).', excludes: ['Goryo'] },
  { id: 'male_model', label: 'Male Ghost Model Seen', category: 'ability', description: 'Ghost appeared as a male model (Dayan is always female).', excludes: ['Dayan'] },
  { id: 'steps_before_flicker', label: 'Footsteps Heard Before Electronics Flicker', category: 'ability', description: 'Hunt footsteps were audible before your equipment started flickering (Myling footsteps are quieter).', excludes: ['Myling'] },
  { id: 'heard_far_in_hunt', label: 'Ghost Heard Voice/Electronics > 2.5m Away', category: 'ability', description: 'During a hunt the ghost reacted to talking or electronics well beyond 2.5m (Yokai is nearly deaf).', excludes: ['Yokai'] },

  // --- Hunt blink patterns ---
  { id: 'blink_phantom', label: 'Long Invisible Blinks (1–2s)', category: 'blink', description: 'Stays invisible much longer than visible during hunts (Phantom).', confirms: ['Phantom'], excludes: ['Oni', 'Deogen'] },
  { id: 'blink_oni', label: 'Mostly Visible During Hunt', category: 'blink', description: 'Stays visible much longer than invisible during hunts (Oni / Deogen).', confirms: ['Oni'], excludes: ['Phantom'] },

  // --- Hunt speed / timing (auto-detected from audio + timers when possible) ---
  { id: 'los_speedup', label: 'Sped Up While Chasing (LoS)', category: 'speed', description: 'Footsteps gradually sped up during a chase. Thaye keeps a constant speed within a hunt. (Auto-detected from footstep audio.)', excludes: ['Thaye'] },
  { id: 'hunt_cooldown_short', label: 'Hunted 20–25s After Previous Hunt', category: 'hunt', description: 'Only a Demon can start a new hunt less than 25s after the last one ended. (Auto-detected from hunt footsteps.)', confirms: ['Demon'] },

  // --- Smudge timing (auto-detected when the Smudge Timer is running) ---
  { id: 'smudge_early_hunt', label: 'Hunted < 90s After Smudge', category: 'smudge', description: 'Hunted between 60s and 89s after being smudged (Demon). (Auto-detected from Smudge Timer.)', confirms: ['Demon'], exclusive: true },
  { id: 'smudge_hunt_before_180', label: 'Hunted 90–180s After Smudge', category: 'smudge', description: 'Hunted before the 3-minute Spirit smudge lockout ended, so it is not a Spirit. (Auto-detected from Smudge Timer.)', excludes: ['Spirit'] },
  { id: 'smudge_late_spirit', label: 'No Hunt for > 180s After Smudge', category: 'smudge', description: 'Prevented from hunting for a full 3 minutes after smudge (Spirit).', confirms: ['Spirit'], excludes: ['Demon'] },
];

export const BEHAVIOR_BY_ID: Record<string, BehaviorRule> = Object.fromEntries(
  BEHAVIOR_TAGS.map((b) => [b.id, b])
);

/** Derives each ghost's confirm / rule-out behavior lists from BEHAVIOR_TAGS (single source of truth). */
function withBehaviorRules(ghost: GhostData): GhostProfile {
  const confirmBehaviors = BEHAVIOR_TAGS.filter((b) => b.confirms?.includes(ghost.name)).map((b) => b.id);
  const ruleOutBehaviors =
    ghost.name === 'The Mimic'
      ? []
      : BEHAVIOR_TAGS.filter(
          (b) =>
            b.excludes?.includes(ghost.name) ||
            (b.exclusive && !b.confirms?.includes(ghost.name))
        ).map((b) => b.id);
  return { ...ghost, confirmBehaviors, ruleOutBehaviors };
}

const GHOST_DATA: GhostData[] = [
  {
    name: 'Spirit',
    evidences: ['EMF Level 5', 'Spirit Box', 'Ghost Writing'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS to 2.81 m/s)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 180,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Smudge Test: Incense prevents a Spirit from hunting for 180 seconds (3 minutes) instead of 90s.',
      'Standard 1.7 m/s footstep speed with normal blink.',
    ],
  },
  {
    name: 'Wraith',
    evidences: ['EMF Level 5', 'Spirit Box', 'D.O.T.S Projector'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Salt Immunity: Never steps in or disturbs Salt piles under any circumstance.',
      'Teleport Ability: Can teleport directly to a random player, leaving EMF 2 (or 25% chance EMF 5) away from the ghost room.',
    ],
  },
  {
    name: 'Phantom',
    evidences: ['Spirit Box', 'Ultraviolet', 'D.O.T.S Projector'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'invisible_long',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Hunt Blink: Barely visible during hunts (invisible for 1–2 seconds between brief flashes).',
      'Camera Test: Taking a photo of the Phantom makes it vanish completely with zero static on the photo.',
      'Roams toward a random player and drains 0.5%/sec sanity while in LoS within 10m.',
    ],
  },
  {
    name: 'Poltergeist',
    evidences: ['Spirit Box', 'Ultraviolet', 'Ghost Writing'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'During a hunt, throws an item every 0.5 seconds (100% chance vs 50% for other ghosts).',
      'Polter-Bomb: Build a pile of items; Poltergeist can explode the pile all at once and drain 2% sanity per item.',
    ],
  },
  {
    name: 'Banshee',
    evidences: ['Ultraviolet', 'Ghost Orb', 'D.O.T.S Projector'],
    huntSanity: 50,
    specialSanityNote: 'Checks TARGET player sanity (50%), not average team sanity!',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Parabolic Mic: 33% chance to emit a unique high-pitched Banshee wail.',
      'Target Obsession: Only stalks and hunts its chosen target (ignores non-targets during hunts if the target is inside).',
      'Prefers singing ghost events.',
    ],
  },
  {
    name: 'Jinn',
    evidences: ['EMF Level 5', 'Ultraviolet', 'Freezing Temperatures'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7, 2.5],
    losAccelerates: true,
    speedSummary: '1.70 m/s normal | 2.50 m/s instant boost in far LoS (>3m) when Breaker is ON',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Breaker Rule: Can NEVER turn the Fuse Box OFF directly.',
      'Hunt Speed: When Fuse Box is ON and player is in LoS > 3m away, speeds up immediately to 2.5 m/s, then drops to 1.7 m/s within 3m.',
      'Ability drains 25% sanity from nearby players and leaves EMF 2/5 at the Fuse Box.',
    ],
  },
  {
    name: 'Mare',
    evidences: ['Spirit Box', 'Ghost Orb', 'Ghost Writing'],
    huntSanity: 60,
    specialSanityNote: '60% in the dark | 40% when room lights are ON',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Light Switch Test: Can immediately turn off a light switch within 1s of you turning it on.',
      'Can NEVER turn a light ON.',
      'Hunts at 60% sanity in an unlit room vs 40% in a lit room.',
    ],
  },
  {
    name: 'Revenant',
    evidences: ['Ghost Orb', 'Ghost Writing', 'Freezing Temperatures'],
    huntSanity: 50,
    baseSpeedMps: 1.0,
    altSpeedsMps: [1.0, 3.0],
    losAccelerates: false,
    speedSummary: '1.00 m/s hidden (68 BPM) | 3.00 m/s when player detected (203 BPM)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Unmistakable Footsteps: Crawls at a sluggish 1.0 m/s when no player is detected, then rockets to 3.0 m/s the instant it sees, hears, or senses equipment.',
    ],
  },
  {
    name: 'Shade',
    evidences: ['EMF Level 5', 'Ghost Writing', 'Freezing Temperatures'],
    huntSanity: 35,
    specialSanityNote: '35% sanity — cannot hunt or do events while a player is in the same room!',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Shyness Rule: Cannot start a hunt or perform ghostwriting/EMF 3 throw while a player is in the same room.',
      'Very low hunt threshold (35% sanity) and prefers shadow/mist ghost events.',
    ],
  },
  {
    name: 'Demon',
    evidences: ['Ultraviolet', 'Ghost Writing', 'Freezing Temperatures'],
    huntSanity: 70,
    maxHuntSanity: 100,
    specialSanityNote: '70% base | Can hunt at 100% sanity using its Doom Slayed ability!',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 60,
    huntCooldownSec: 20,
    zeroEvidenceTests: [
      'Smudge Timer: Can hunt just 60 seconds after being smudged (vs 90s for others).',
      'Hunt Cooldown: Minimum 20 seconds between hunts (vs 25s for others).',
      'Crucifix radius is 50% larger for a Demon.',
    ],
  },
  {
    name: 'Yurei',
    evidences: ['Ghost Orb', 'Freezing Temperatures', 'D.O.T.S Projector'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Double Door Touch: Can fully slam an open door outside a ghost event (double EMF sound) and drain 15% sanity.',
      'Only ghost that can move the front exit door outside a hunt or event.',
      'Smudging traps the Yurei in its room for 90 seconds.',
    ],
  },
  {
    name: 'Oni',
    evidences: ['EMF Level 5', 'Freezing Temperatures', 'D.O.T.S Projector'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'visible_long',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Hunt Blink: Remains visible almost continuously during hunts with very short invisible flickers.',
      'Airball Rule: Can NEVER perform the white mist/airball hiss ghost event.',
      'Ghost event collisions drain 20% sanity (double normal 10%).',
    ],
  },
  {
    name: 'Yokai',
    evidences: ['Spirit Box', 'Ghost Orb', 'D.O.T.S Projector'],
    huntSanity: 50,
    maxHuntSanity: 80,
    specialSanityNote: '80% sanity when talking near the Yokai | 50% otherwise',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Deafness Test: During a hunt, Yokai can only hear voices or detect electronics within 2.5 meters (vs 9–10m for other ghosts).',
      'Talking within 2m of a Yokai raises its hunt threshold to 80% sanity.',
    ],
  },
  {
    name: 'Hantu',
    evidences: ['Ultraviolet', 'Ghost Orb', 'Freezing Temperatures'],
    forcedEvidence: 'Freezing Temperatures',
    huntSanity: 50,
    baseSpeedMps: 1.75,
    altSpeedsMps: [1.4, 1.75, 2.1, 2.3, 2.4, 2.5, 2.6, 2.65, 2.68, 2.7],
    losAccelerates: false,
    speedSummary: '1.40 m/s warm (>=15°C) to 2.70 m/s freezing (<0°C) across 10 temp tiers — NO LoS acceleration!',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Forced Evidence: Always gives Freezing Temperatures on Nightmare/Insanity.',
      'Temperature Speed: Moves across 10 temperature-step speeds from 1.40 m/s (>=15°C) up to 2.70 m/s (<0°C), and NEVER speeds up in Line-of-Sight.',
      'Emits freezing breath from its mouth during hunts when the Fuse Box is OFF.',
    ],
  },
  {
    name: 'Goryo',
    evidences: ['EMF Level 5', 'Ultraviolet', 'D.O.T.S Projector'],
    forcedEvidence: 'D.O.T.S Projector',
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Camera-Only DOTS: D.O.T.S. silhouette is only visible through a Video Camera when no player is in the ghost room.',
      'Never changes its favorite room and cannot roam long distances.',
    ],
  },
  {
    name: 'Myling',
    evidences: ['EMF Level 5', 'Ultraviolet', 'Ghost Writing'],
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard — Quiet footsteps (<12m instead of 20m)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Flashlight Drop Test: Drop an active flashlight on the floor; a Myling’s footsteps are only audible once your equipment starts flickering (<12m range vs 20m for others).',
      'Produces frequent paranormal sounds on the Parabolic Microphone.',
    ],
  },
  {
    name: 'Onryo',
    evidences: ['Spirit Box', 'Ghost Orb', 'Freezing Temperatures'],
    huntSanity: 60,
    specialSanityNote: '60% base | Hunts at ANY sanity after blowing out every 3rd flame!',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      '3-Candle Rule: Extinguishing every 3rd firelight (candle/lighter/campfire) triggers an immediate hunt regardless of sanity.',
      'Lit firelights act like Crucifixes (4m radius) and prevent the Onryo from hunting.',
    ],
  },
  {
    name: 'The Twins',
    evidences: ['EMF Level 5', 'Spirit Box', 'Freezing Temperatures'],
    huntSanity: 50,
    baseSpeedMps: 1.53,
    altSpeedsMps: [1.53, 1.87],
    losAccelerates: true,
    speedSummary: '1.53 m/s Main Twin (103 BPM) OR 1.87 m/s Decoy Twin (126 BPM)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Dual Speed: Hunts at either 1.53 m/s (-10% slower, from ghost room) or 1.87 m/s (+10% faster, from last remote interaction).',
      'Twin Interaction: Can interact with two objects in different rooms within 0.5s.',
    ],
  },
  {
    name: 'Raiju',
    evidences: ['EMF Level 5', 'Ghost Orb', 'D.O.T.S Projector'],
    huntSanity: 50,
    maxHuntSanity: 65,
    specialSanityNote: '65% sanity near active electronics | 50% otherwise',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7, 2.5],
    losAccelerates: true,
    speedSummary: '1.70 m/s normal | 2.50 m/s (169 BPM) within 6–10m of active electronics',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Electronics Boost: Surges to 2.5 m/s immediately when passing within 6m (small map) to 10m of turned-on equipment.',
      'Flickers electronics from 15m away instead of the normal 10m.',
    ],
  },
  {
    name: 'Obake',
    evidences: ['EMF Level 5', 'Ultraviolet', 'Ghost Orb'],
    forcedEvidence: 'Ultraviolet',
    huntSanity: 50,
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.7],
    losAccelerates: true,
    speedSummary: '1.70 m/s standard (speeds up in LoS)',
    blinkStyle: 'shapeshift',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Shapeshift Blink: Guaranteed to briefly change its ghost model for 1 blink at least once per hunt.',
      'Special UV: Can leave a 6-finger handprint, 2 fingerprints on a light switch, or 5 fingers on keyboards/cell doors.',
      '25% chance to hide fingerprints, and can halve the remaining UV timer on existing prints.',
    ],
  },
  {
    name: 'The Mimic',
    evidences: ['Spirit Box', 'Ultraviolet', 'Freezing Temperatures'],
    fakeEvidence: 'Ghost Orb',
    huntSanity: 50,
    maxHuntSanity: 80,
    specialSanityNote: 'Copies the exact hunt sanity, speed, and abilities of whichever ghost it is currently mimicking!',
    baseSpeedMps: 1.7,
    altSpeedsMps: [0.4, 1.0, 1.53, 1.7, 1.87, 2.5, 2.75, 3.0],
    losAccelerates: true,
    speedSummary: 'Variable! Copies another ghost every 30s–120s',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Fake Ghost Orbs: ALWAYS displays Ghost Orbs as an extra/fake evidence—even on 0-Evidence / Insanity / Nightmare!',
      'Changes mimicked ghost type every 30 to 120 seconds between hunts.',
    ],
  },
  {
    name: 'Moroi',
    evidences: ['Spirit Box', 'Ghost Writing', 'Freezing Temperatures'],
    forcedEvidence: 'Spirit Box',
    huntSanity: 50,
    baseSpeedMps: 1.85,
    altSpeedsMps: [1.5, 1.583, 1.666, 1.749, 1.832, 1.915, 1.998, 2.081, 2.164, 2.25, 3.71],
    losAccelerates: true,
    speedSummary: '1.50 m/s (>=45% sanity) +0.083 m/s per 5% lost up to 2.25 m/s (0% sanity), reaching 3.71 m/s in LoS!',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Sanity Pill Speed Test: Take Sanity Medication during or between hunts; if the ghost noticeably slows down, it is a Moroi.',
      'Smudge Blindness: Incense blinds a Moroi for 7.5 seconds (50% longer than the normal 5 seconds).',
      'Getting a Spirit Box or Parabolic whisper curses you (doubles passive sanity drain).',
    ],
  },
  {
    name: 'Deogen',
    evidences: ['Spirit Box', 'Ghost Writing', 'D.O.T.S Projector'],
    forcedEvidence: 'Spirit Box',
    huntSanity: 40,
    baseSpeedMps: 0.4,
    altSpeedsMps: [0.4, 3.0],
    losAccelerates: false,
    speedSummary: '3.00 m/s far away (>4.0m), linearly decelerating down to 0.40 m/s (27 BPM) within 1.0m of player!',
    blinkStyle: 'visible_long',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'No Hiding: Always knows where all players are—never hide in a closet! Linearly slows from 3.00 m/s (>=4.0m) down to 0.40 m/s (<=1.0m) for easy looping.',
      'Heavy Breathing: Using Spirit Box within 1m of the Deogen has a 33% chance to trigger a unique heavy bull-breathing response.',
    ],
  },
  {
    name: 'Thaye',
    evidences: ['Ghost Orb', 'Ghost Writing', 'D.O.T.S Projector'],
    huntSanity: 75,
    maxHuntSanity: 75,
    specialSanityNote: 'Starts at 75% sanity & 2.75 m/s (Age 0) → ages 10 stages (-6% sanity & -0.175 m/s each) down to 15% sanity & 1.00 m/s!',
    baseSpeedMps: 2.75,
    altSpeedsMps: [1.0, 1.175, 1.35, 1.525, 1.7, 1.875, 2.05, 2.225, 2.4, 2.575, 2.75],
    losAccelerates: false,
    speedSummary: '2.75 m/s Young (Age 0) → -0.175 m/s per age stage down to 1.00 m/s Old (Age 10) — NO LoS boost!',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Aging Speed Test: Very fast (2.75 m/s) in early hunts, gets permanently slower across 11 age stages (-0.175 m/s & -6% hunt sanity per stage), and NEVER speeds up in Line-of-Sight.',
      'Ouija Board age increases as the Thaye ages.',
    ],
  },
  {
    name: 'Dayan',
    evidences: ['EMF Level 5', 'Ghost Orb', 'Spirit Box'],
    huntSanity: 65,
    specialSanityNote: '65% if player moving within 7m (10m large map) | 45% if standing still within radius | 50% outside radius',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.2, 1.7, 2.25],
    losAccelerates: true,
    speedSummary: '1.20 m/s if player stands still <7m (10m large) | 2.25 m/s if player moves <7m | 1.70 m/s outside radius',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      'Movement Speed Test: Stand still during a hunt within 7m (10m on large maps) and listen—Dayan slows to 1.20 m/s when you stand still and jumps to 2.25 m/s when you move (even without LoS!).',
      'Always uses a female ghost model and female name.',
    ],
  },
  {
    name: 'Gallu',
    evidences: ['EMF Level 5', 'Spirit Box', 'Ultraviolet'],
    huntSanity: 60,
    specialSanityNote: '50% Normal | 60% Enraged (after Crucifix/Smudge/Salt) | 40% Weakened (after Enraged hunt)',
    baseSpeedMps: 1.7,
    altSpeedsMps: [1.36, 1.7, 1.96],
    losAccelerates: true,
    speedSummary: '1.70 m/s Normal → 1.96 m/s Enraged (Crucifix/Salt/Smudge) → 1.36 m/s Weakened',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      '3-State Cycle: Stepping in Salt, burning a Crucifix, or smudging pushes Gallu into its Enraged state (60% hunt sanity, 1.96 m/s speed).',
      'After finishing an Enraged hunt, it enters its Weakened state (40% hunt sanity, slow 1.36 m/s speed).',
    ],
  },
  {
    name: 'Obambo',
    evidences: ['Ghost Writing', 'Ultraviolet', 'D.O.T.S Projector'],
    huntSanity: 65,
    specialSanityNote: 'Cycles every 2 min between Calm (10% sanity) and Aggressive (65% sanity)!',
    baseSpeedMps: 1.45,
    altSpeedsMps: [1.45, 1.96],
    losAccelerates: true,
    speedSummary: '1.45 m/s Calm State (98 BPM) ↔ 1.96 m/s Aggressive State (133 BPM)',
    blinkStyle: 'normal',
    smudgeLockoutSec: 90,
    huntCooldownSec: 25,
    zeroEvidenceTests: [
      '2-Minute Pendulum Cycle: Switches between Calm (1.45 m/s, 10% hunt threshold, high room interactions) and Aggressive (1.96 m/s, 65% hunt threshold, 20% shorter hunts).',
      'Can swap speed mid-hunt from 1.45 m/s to 1.96 m/s (or vice versa) when its 2-minute timer ticks!',
    ],
  },
];

export const GHOSTS: GhostProfile[] = GHOST_DATA.map(withBehaviorRules);
