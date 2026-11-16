import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Brain,
  Camera,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  Gauge,
  HelpCircle,
  Keyboard,
  Layers,
  Layout,
  MapPin,
  Mic,
  MicOff,
  Monitor,
  Palette,
  Play,
  Radio,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Tv,
  Undo2,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { AnalyticsView, AnalyticsSummary } from './components/AnalyticsView';
import { ThemeSettingsView } from './components/ThemeSettingsView';
import { ChangelogModal, PendingChangelog } from './components/ChangelogModal';
import {
  THEMES,
  ACCENT_COLORS,
  ThemeId,
  AccentColorId,
  HudLayoutMode,
} from './theme/theme';
import {
  ALL_EVIDENCES,
  BEHAVIOR_TAGS,
  EvidenceState,
  EvidenceType,
  GHOSTS,
} from './data/ghosts';
import { PHASMO_MAPS } from './data/maps';
import { evaluateGhosts, HuntRecord } from './engine/solver';
import {
  playFootstepPreview,
  stopFootstepPreview,
  playEmf5Tone,
  playEmfPowerSound,
  playSpiritBoxSound,
  playDoorGhostOpenSound,
  playThemeUiSound,
} from './engine/audioSynth';

declare global {
  interface Window {
    phasmoOverlay?: {
      setOverlayMode: (interactive: boolean) => void;
      setIgnoreMouse: (ignore: boolean) => void;
      updateHotkeys: (hotkeys: Record<string, string>) => Promise<Record<string, string>>;
      quitApp: () => void;
      onOverlayModeChanged: (cb: (isInteractive: boolean) => void) => () => void;
      onHotkeyAction: (cb: (action: string) => void) => () => void;
    };
  }
}

interface ToastNotification {
  id: string;
  tier: 'auto_applied' | 'suspected';
  title: string;
  detail: string;
  confidence: number;
  evidence?: EvidenceType;
  previousState?: EvidenceState;
  suggestedState?: 'confirmed' | 'ruled_out';
  behaviorId?: string;
  createdAt: number;
}

interface AudioTelemetry {
  bpm: number;
  mps: number;
  los_accelerating: boolean;
  footstep_pan?: number;
  footstep_direction?: 'LEFT' | 'CENTER' | 'RIGHT';
  voice_rejected: boolean;
  player_moving?: boolean;
  hunt_active: boolean;
  spectrum: number[];
  device: string;
  flash_active?: boolean;
  last_onset_band?: string;
  sensitivity?: string;
  audio_muted?: boolean;
}

// --- Hunt / smudge timing rules used for automatic behavior inference ---
const SMUDGE_TIMER_SEC = 180;
const HUNT_COOLDOWN_STANDARD_SEC = 25; // every ghost except Demon
const HUNT_COOLDOWN_DEMON_SEC = 20; // Demon minimum gap between hunts
// A truck sanity reading is an UPPER bound (sanity only drops). Trust it directly if fresh,
// or conservatively project passive dark drain for up to 3 minutes.
const SANITY_READING_MAX_AGE_SEC = 30;
const SANITY_ESTIMATE_MAX_AGE_SEC = 180;

function estimateSanityAfterDrain(
  lastSanity: number,
  ageSec: number,
  mapName: string,
  difficulty: string
): number {
  const mapInfo = PHASMO_MAPS.find((m) => m.name === mapName);
  const baseDrain =
    mapInfo?.size === 'Large' ? 0.05 : mapInfo?.size === 'Medium' ? 0.08 : 0.10;
  const diffLow = difficulty.toLowerCase();
  const diffMult = diffLow.includes('amateur')
    ? 1.0
    : diffLow.includes('intermediate')
    ? 1.15
    : 1.25;
  const dropped = ageSec * baseDrain * diffMult;
  return Math.max(0, Math.min(lastSanity, Math.round(lastSanity - dropped)));
}

const INITIAL_EVIDENCE_STATE: Record<EvidenceType, EvidenceState> = {
  'EMF Level 5': 'unknown',
  'Ultraviolet': 'unknown',
  'Ghost Writing': 'unknown',
  'Freezing Temperatures': 'unknown',
  'D.O.T.S Projector': 'unknown',
  'Ghost Orb': 'unknown',
  'Spirit Box': 'unknown',
};

const SHORT_EVIDENCE_NAMES: Record<EvidenceType, string> = {
  'EMF Level 5': 'EMF 5',
  'Ultraviolet': 'UV',
  'Ghost Writing': 'Writing',
  'Freezing Temperatures': 'Freezing',
  'D.O.T.S Projector': 'D.O.T.S',
  'Ghost Orb': 'Orbs',
  'Spirit Box': 'Spirit Box',
};

const DIFFICULTY_PRESETS = [
  { name: 'Amateur', evidence: 3, speed: 1.0, desc: '3 Evidence • 5m Setup • 100% Speed' },
  { name: 'Intermediate', evidence: 3, speed: 1.0, desc: '3 Evidence • 2m Setup • 100% Speed' },
  { name: 'Professional', evidence: 3, speed: 1.0, desc: '3 Evidence • 0m Setup • 100% Speed' },
  { name: 'Nightmare', evidence: 2, speed: 1.0, desc: '2 Evidence (+Forced) • Hidden Monitors' },
  { name: 'Insanity', evidence: 1, speed: 1.0, desc: '1 Evidence (+Forced) • 75% Start Sanity' },
  { name: 'Apocalypse III', evidence: 0, speed: 1.5, desc: '0 Evidence • 150% Ghost Speed' },
  { name: 'Custom', evidence: 3, speed: 1.0, desc: 'Custom Evidence & Speed Multiplier' },
] as const;

export default function App() {
  // Overlay Mode: false = Compact Click-Through Mini-HUD, true = Discord-Style Full Interactive Overlay
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'solver' | 'maps' | 'history' | 'calibration' | 'settings'>('solver');
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [matchStartTime, setMatchStartTime] = useState<number>(Date.now());
  const [isObjectivesOpen, setIsObjectivesOpen] = useState<boolean>(true);
  const [objectives, setObjectives] = useState<Array<{ id: string; text: string; completed: boolean }>>([
    { id: 'obj_1', text: 'Discover the Ghost Type', completed: false },
    { id: 'obj_2', text: 'Cleanse area with Incense', completed: false },
    { id: 'obj_3', text: 'Detect Ghost with Motion Sensor', completed: false },
    { id: 'obj_4', text: 'Capture a Photo of the Ghost', completed: false },
  ]);

  // Investigation State
  const [evidenceStates, setEvidenceStates] = useState<Record<EvidenceType, EvidenceState>>({
    ...INITIAL_EVIDENCE_STATE,
  });
  const [evidenceConfidence, setEvidenceConfidence] = useState<Partial<Record<EvidenceType, number>>>({});
  const [activeBehaviors, setActiveBehaviors] = useState<string[]>([]);
  const [manualExcludedGhosts, setManualExcludedGhosts] = useState<string[]>([]);
  const [pinnedGhost, setPinnedGhost] = useState<string | null>(null);

  // Match & Difficulty Settings
  const [difficultyPreset, setDifficultyPreset] = useState<string>('Professional');
  const [evidenceCountSetting, setEvidenceCountSetting] = useState<number>(3);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');
  const [equipmentTiers, setEquipmentTiers] = useState<Record<string, number>>({
    emf: 3,
    thermometer: 3,
    spirit_box: 3,
    uv: 3,
    dots: 3,
    video_cam: 3,
  });
  const [ignorePlayerWasd, setIgnorePlayerWasd] = useState<boolean>(true);
  const [hudPosition, setHudPosition] = useState<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'>('top-right');

  // Sanity & Speed State
  const [currentSanity, setCurrentSanity] = useState<number>(100);
  const [huntStartedAtSanity, setHuntStartedAtSanity] = useState<number | null>(null);
  const [observedSpeedMps, setObservedSpeedMps] = useState<number | null>(null);
  const [huntHistory, setHuntHistory] = useState<HuntRecord[]>([]);

  // Map & Room State
  const [selectedMapName, setSelectedMapName] = useState<string>(PHASMO_MAPS[0].name);
  const [selectedFloor, setSelectedFloor] = useState<string>(PHASMO_MAPS[0].floors[0]);
  const [markedGhostRoom, setMarkedGhostRoom] = useState<string | null>(null);

  // Timers (Smudge 180s countdown, Hunt Cooldown 25s, Hunt Duration stopwatch, Salt-Step UV 15s)
  const [smudgeRemaining, setSmudgeRemaining] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [saltStepRemaining, setSaltStepRemaining] = useState<number>(0);
  const [parabolicReading, setParabolicReading] = useState<{ reading: number; estimated_distance_m: number; timestamp: number } | null>(null);
  const [huntElapsed, setHuntElapsed] = useState<number>(0);
  const [huntRunning, setHuntRunning] = useState<boolean>(false);

  // Live values read by WebSocket / hotkey handlers. Refs (not state) so handlers never see stale values.
  const currentSanityRef = useRef<number>(100);
  currentSanityRef.current = currentSanity;
  const sanityReadAtRef = useRef<number | null>(null); // ms epoch of the last truck OCR read / manual slider change
  const smudgeStartedAtRef = useRef<number | null>(null); // ms epoch when the Smudge Timer was started
  const huntStartedAtMsRef = useRef<number | null>(null); // ms epoch of the current/last hunt's first footstep
  const lastHuntEndMsRef = useRef<number | null>(null); // ms epoch of the last hunt's final footstep
  const currentHuntSanityRef = useRef<number | null>(null);
  const activeBehaviorsRef = useRef<string[]>([]);
  activeBehaviorsRef.current = activeBehaviors;
  const thresholdsRef = useRef<{ auto_apply: number; suspected: number }>({
    auto_apply: 0.85,
    suspected: 0.52,
  });
  const evidenceFusionRef = useRef<
    Partial<Record<EvidenceType, { sources: Set<string>; lastTs: number; conf: number }>>
  >({});
  const evidenceStatesRef = useRef<Record<EvidenceType, EvidenceState>>({
    ...INITIAL_EVIDENCE_STATE,
  });
  evidenceStatesRef.current = evidenceStates;

  // Backend Telemetry & Toasts
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [audioTelemetry, setAudioTelemetry] = useState<AudioTelemetry>({
    bpm: 0,
    mps: 0,
    los_accelerating: false,
    voice_rejected: false,
    hunt_active: false,
    spectrum: new Array(16).fill(0),
    device: 'Connecting...',
  });
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [eventLog, setEventLog] = useState<Array<{ time: string; detail: string; conf: number }>>([]);
  const [lastOnsetFlash, setLastOnsetFlash] = useState<number>(0);
  const [audioSensitivity, setAudioSensitivity] = useState<string>('default');
  const [stereoMovingFilter, setStereoMovingFilter] = useState<boolean>(true);
  const [audioEngineEnabled, setAudioEngineEnabled] = useState<boolean>(true);
  const [visionEngineEnabled, setVisionEngineEnabled] = useState<boolean>(true);
  const [captureFps, setCaptureFps] = useState<number>(8);

  // Theme & GUI Personalization
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('modern');
  const [currentAccent, setCurrentAccent] = useState<AccentColorId>('sky');
  const [hudLayout, setHudLayout] = useState<HudLayoutMode>('vertical');
  const [uiScale, setUiScale] = useState<number>(1.0);
  const [hudOpacity, setHudOpacity] = useState<number>(0.88);
  const [crtScanlines, setCrtScanlines] = useState<boolean>(true);
  const [uiSoundEnabled, setUiSoundEnabled] = useState<boolean>(true);
  const [streamerMode, setStreamerMode] = useState<boolean>(false);
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState<boolean>(false);

  // Version & Startup Changelog Modal
  const [appVersion, setAppVersion] = useState<string>('2.1.0');
  const [pendingChangelog, setPendingChangelog] = useState<PendingChangelog | null>(null);

  // Hotkeys & Rebinding
  const [hotkeys, setHotkeys] = useState<Record<string, string>>({
    toggle_overlay: 'Alt+Q',
    undo_detection: 'Alt+Z',
    toggle_smudge_timer: 'Alt+S',
    toggle_objectives: 'Alt+O',
    toggle_hud_layout: 'Alt+L',
    toggle_audio: 'Alt+M',
    toggle_vision: 'Alt+V',
    tap_bpm: 'Alt+B',
    reset_match: 'Alt+R',
  });
  const [recordingHotkeyFor, setRecordingHotkeyFor] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lastHotkeyTimeRef = useRef<Record<string, number>>({});
  const recordingHotkeyRef = useRef<string | null>(null);
  recordingHotkeyRef.current = recordingHotkeyFor;

  // Sync preview video streaming with active tab (only stream preview when Calibration Studio is open)
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'set_preview',
          enabled: activeTab === 'calibration',
        })
      );
    }
  }, [activeTab]);

  // Check for updates / pending changelog on startup
  useEffect(() => {
    let mounted = true;
    fetch('http://127.0.0.1:8765/api/version')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        if (data.version) setAppVersion(data.version);
        if (data.pending_changelog) {
          setPendingChangelog(data.pending_changelog);
        }
      })
      .catch(() => {
        // Backend may still be initializing
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDismissChangelog = async () => {
    setPendingChangelog(null);
    try {
      await fetch('http://127.0.0.1:8765/api/version/clear-changelog', {
        method: 'POST',
      });
    } catch {
      // Ignore network errors on dismiss
    }
  };

  // Evaluate 24 Ghosts
  const evaluation = useMemo(
    () =>
      evaluateGhosts({
        evidenceStates,
        evidenceConfidence,
        evidenceCountSetting,
        observedSpeedMps,
        currentSanity,
        huntStartedAtSanity,
        activeBehaviors,
        manualExcludedGhosts,
        huntHistory,
      }),
    [
      evidenceStates,
      evidenceConfidence,
      evidenceCountSetting,
      observedSpeedMps,
      currentSanity,
      huntStartedAtSanity,
      activeBehaviors,
      manualExcludedGhosts,
      huntHistory,
    ]
  );

  // Reset full investigation
  const resetInvestigation = () => {
    setEvidenceStates({ ...INITIAL_EVIDENCE_STATE });
    setEvidenceConfidence({});
    setActiveBehaviors([]);
    setManualExcludedGhosts([]);
    setPinnedGhost(null);
    setCurrentSanity(100);
    setHuntStartedAtSanity(null);
    setObservedSpeedMps(null);
    setHuntHistory([]);
    setMarkedGhostRoom(null);
    setSmudgeRemaining(0);
    setCooldownRemaining(0);
    setSaltStepRemaining(0);
    setParabolicReading(null);
    setHuntElapsed(0);
    setHuntRunning(false);
    setToasts([]);
    setMatchStartTime(Date.now());
    setObjectives((prev) => prev.map((o) => ({ ...o, completed: false })));
    currentSanityRef.current = 100;
    sanityReadAtRef.current = null;
    smudgeStartedAtRef.current = null;
    huntStartedAtMsRef.current = null;
    lastHuntEndMsRef.current = null;
    currentHuntSanityRef.current = null;
    evidenceFusionRef.current = {};
    evidenceStatesRef.current = { ...INITIAL_EVIDENCE_STATE };
  };

  const handleRefreshHistory = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'get_history' }));
    } else {
      fetch('http://127.0.0.1:8765/api/history')
        .then((r) => r.json())
        .then((data) => setAnalyticsSummary(data))
        .catch(() => {});
    }
  };

  const handleSaveMatch = (matchData: Record<string, any>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'save_match', match: matchData }));
    } else {
      fetch('http://127.0.0.1:8765/api/history/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.summary) setAnalyticsSummary(data.summary);
        })
        .catch(() => {});
    }
  };

  // Undo most recent auto-applied toast
  const undoLastDetection = () => {
    setToasts((prev) => {
      if (prev.length === 0) return prev;
      const latest = prev[0];
      if (latest.evidence && latest.previousState !== undefined) {
        delete evidenceFusionRef.current[latest.evidence];
        evidenceStatesRef.current = {
          ...evidenceStatesRef.current,
          [latest.evidence]: latest.previousState,
        };
        setEvidenceStates((es) => ({
          ...es,
          [latest.evidence!]: latest.previousState!,
        }));
      }
      if (latest.behaviorId) {
        activeBehaviorsRef.current = activeBehaviorsRef.current.filter(
          (b) => b !== latest.behaviorId
        );
        setActiveBehaviors((bs) => bs.filter((b) => b !== latest.behaviorId));
      }
      return prev.slice(1);
    });
  };

  // Toggle Smudge Timer (180s Spirit -> 90s Standard -> 60s Demon).
  // The start time lives in a ref so hunts can be compared against it precisely.
  const toggleSmudgeTimer = () => {
    if (smudgeStartedAtRef.current !== null) {
      smudgeStartedAtRef.current = null;
      setSmudgeRemaining(0);
    } else {
      smudgeStartedAtRef.current = Date.now();
      setSmudgeRemaining(SMUDGE_TIMER_SEC);
    }
  };

  // Push a toast (newest first, max 4 on screen)
  const pushToast = (toast: Omit<ToastNotification, 'id' | 'createdAt'>) => {
    setToasts((prev) => [
      { ...toast, id: `${Date.now()}-${Math.random()}`, createdAt: Date.now() },
      ...prev.slice(0, 3),
    ]);
  };

  const logLine = (detail: string, conf = 1) => {
    const nowStr = new Date().toLocaleTimeString([], { hour12: false });
    setEventLog((prev) => [{ time: nowStr, detail, conf }, ...prev.slice(0, 24)]);
  };

  // Auto-apply a behavior tag inferred from timers / audio. Undoable with Alt+Z like any other detection.
  const autoTagBehavior = (behaviorId: string, title: string, detail: string, confidence: number) => {
    if (activeBehaviorsRef.current.includes(behaviorId)) return; // already tagged -> no duplicate toasts
    activeBehaviorsRef.current = [...activeBehaviorsRef.current, behaviorId];
    setActiveBehaviors((prev) => (prev.includes(behaviorId) ? prev : [...prev, behaviorId]));
    pushToast({ tier: 'auto_applied', title, detail, confidence, behaviorId });
    logLine(`${title}: ${detail}`, confidence);
  };

  // Tap BPM via backend
  const triggerTapBpm = () => {
    fetch('http://127.0.0.1:8765/api/tap-bpm', { method: 'POST' }).catch(() => {});
  };

  // Toggle Master Audio Processing & DSP Recording On/Off
  const toggleAudioProcessing = () => {
    setAudioEngineEnabled((prev) => {
      const next = !prev;
      updateBackendConfig({
        detectors_enabled: { audio_engine_enabled: next },
      });
      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
      return next;
    });
  };

  // Toggle Master Screen Monitoring & CV Tracking On/Off (Manual Logging Mode)
  const toggleVisionProcessing = () => {
    setVisionEngineEnabled((prev) => {
      const next = !prev;
      updateBackendConfig({
        detectors_enabled: { vision_engine_enabled: next },
      });
      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
      return next;
    });
  };

  const executeHotkeyAction = (action: string) => {
    if (recordingHotkeyRef.current) return;
    const now = Date.now();
    if (now - (lastHotkeyTimeRef.current[action] || 0) < 450) return;
    lastHotkeyTimeRef.current[action] = now;

    if (action === 'toggle_overlay') {
      setIsInteractive((prev) => {
        const next = !prev;
        window.phasmoOverlay?.setOverlayMode(next);
        return next;
      });
    } else if (action === 'undo_detection') {
      undoLastDetection();
    } else if (action === 'toggle_smudge_timer') {
      toggleSmudgeTimer();
    } else if (action === 'toggle_objectives') {
      setIsObjectivesOpen((prev) => !prev);
    } else if (action === 'toggle_hud_layout') {
      setHudLayout((prev) => {
        const next = prev === 'vertical' ? 'horizontal' : 'vertical';
        updateBackendConfig({ hud_layout: next });
        return next;
      });
      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
    } else if (action === 'toggle_audio') {
      toggleAudioProcessing();
    } else if (action === 'toggle_vision') {
      toggleVisionProcessing();
    } else if (action === 'tap_bpm') {
      triggerTapBpm();
    } else if (action === 'reset_match') {
      resetInvestigation();
    }
  };

  // Handle incoming detection events from Python CV & Audio DSP sidecar
  const handleDetectionEvent = (evt: Record<string, unknown>) => {
    const type = String(evt.type || '');
    const conf = Number(evt.confidence ?? 0.8);
    const detail = String(evt.detail || type);
    const nowStr = new Date().toLocaleTimeString([], { hour12: false });

    setEventLog((prev) => [{ time: nowStr, detail, conf }, ...prev.slice(0, 24)]);

    if (type === 'match_reset') {
      resetInvestigation();
      return;
    }

    if (type === 'map_detected' && typeof evt.map === 'string') {
      const found = PHASMO_MAPS.find((m) => m.name === evt.map);
      if (found) {
        setSelectedMapName(found.name);
        setSelectedFloor(found.floors[0]);
      }
    }

    if (type === 'difficulty_detected' && typeof evt.evidence_count === 'number') {
      if (typeof evt.difficulty === 'string') {
        setDifficultyPreset(evt.difficulty);
      }
      setEvidenceCountSetting(evt.evidence_count);
    }

    if (type === 'sanity_update' && typeof evt.sanity === 'number') {
      setCurrentSanity(evt.sanity);
      currentSanityRef.current = evt.sanity;
      sanityReadAtRef.current = Date.now();
    }

    if (type === 'footstep_speed' && typeof evt.mps === 'number') {
      setObservedSpeedMps(evt.mps);
      if (evt.los_accelerating === true) {
        autoTagBehavior(
          'los_speedup',
          'Auto-Tagged: Sped Up While Chasing',
          `Footsteps ramped up to ${evt.mps.toFixed(2)} m/s during the chase. Rules out Thaye.`,
          0.86
        );
      }
    }

    if (type === 'footstep_onset') {
      setLastOnsetFlash(Date.now());
    }

    if (type === 'hunt_started') {
      const nowMs = Date.now();
      // Backend sends the epoch time of the first footstep heard; the true hunt start is at or BEFORE it.
      const startMs =
        typeof evt.first_footstep_ts === 'number' ? evt.first_footstep_ts * 1000 : nowMs;
      const lastEndMs = lastHuntEndMsRef.current;
      // Measured gap >= true gap (last footstep <= real end, first footstep >= real start).
      const gapSec = lastEndMs !== null ? (startMs - lastEndMs) / 1000 : null;

      if (typeof evt.mps === 'number') {
        setObservedSpeedMps(evt.mps);
      }
      setHuntRunning(true);
      setCooldownRemaining(0);

      if (gapSec !== null && gapSec >= 0 && gapSec < HUNT_COOLDOWN_DEMON_SEC) {
        // No ghost can start a new hunt this soon, so the previous hunt never really ended:
        // the ghost just wandered out of earshot. Treat it as the same hunt (no new inferences).
        lastHuntEndMsRef.current = null;
        if (huntStartedAtMsRef.current !== null) {
          setHuntElapsed(Math.max(0, Math.round((nowMs - huntStartedAtMsRef.current) / 1000)));
        }
        logLine(`Footsteps returned after ${gapSec.toFixed(1)}s — same hunt continuing (ghost was out of earshot).`);
        return;
      }

      huntStartedAtMsRef.current = startMs;
      lastHuntEndMsRef.current = null;
      setHuntElapsed(Math.max(0, Math.round((nowMs - startMs) / 1000)));

      // (a) Hunt cooldown: only a Demon can hunt again < 25s after the previous hunt ended.
      if (gapSec !== null && gapSec >= HUNT_COOLDOWN_DEMON_SEC && gapSec < HUNT_COOLDOWN_STANDARD_SEC) {
        autoTagBehavior(
          'hunt_cooldown_short',
          'Auto-Tagged: Short Hunt Cooldown',
          `New hunt began ${gapSec.toFixed(1)}s after the last one (< 25s) — only a Demon can do this.`,
          0.86
        );
      }

      // (b) Smudge timing: compare this hunt against the running Smudge Timer.
      const smudgeStart = smudgeStartedAtRef.current;
      if (smudgeStart !== null) {
        const sinceSmudgeSec = (startMs - smudgeStart) / 1000; // >= true elapsed
        if (sinceSmudgeSec >= 0 && sinceSmudgeSec < 60) {
          pushToast({
            tier: 'suspected',
            title: 'Hunt < 60s After Smudge',
            detail: `Hunted ${Math.round(sinceSmudgeSec)}s after smudging — no ghost should be able to. The smudge probably missed the ghost, or a cursed item started the hunt. No tag applied.`,
            confidence: 0.6,
          });
        } else if (sinceSmudgeSec >= 60 && sinceSmudgeSec < 90) {
          autoTagBehavior(
            'smudge_early_hunt',
            'Auto-Tagged: Hunted < 90s After Smudge',
            `Hunted ${Math.round(sinceSmudgeSec)}s after smudging — only a Demon can hunt before 90s.`,
            0.88
          );
        } else if (sinceSmudgeSec >= 90 && sinceSmudgeSec < SMUDGE_TIMER_SEC) {
          autoTagBehavior(
            'smudge_hunt_before_180',
            'Auto-Tagged: Hunted 90–180s After Smudge',
            `Hunted ${Math.round(sinceSmudgeSec)}s after smudging — a Spirit would still be blocked. Rules out Spirit.`,
            0.88
          );
        }
        // The smudge has been "used up" by this hunt.
        smudgeStartedAtRef.current = null;
        setSmudgeRemaining(0);
      }

      // (c) Hunt sanity: trust fresh truck readings directly, or project passive dark drain up to 3 min.
      const readAt = sanityReadAtRef.current;
      const readingAgeSec = readAt !== null ? (startMs - readAt) / 1000 : null;
      if (readingAgeSec !== null && readingAgeSec <= SANITY_READING_MAX_AGE_SEC) {
        const s = currentSanityRef.current;
        currentHuntSanityRef.current = s;
        // Keep the HIGHEST sanity a hunt was seen at — that is the most informative for ruling ghosts out.
        setHuntStartedAtSanity((prev) => (prev === null ? s : Math.max(prev, s)));
        logLine(`Hunt recorded at ${s}% sanity (truck reading ${Math.round(readingAgeSec)}s old).`);
      } else if (
        readingAgeSec !== null &&
        readingAgeSec <= SANITY_ESTIMATE_MAX_AGE_SEC
      ) {
        const est = estimateSanityAfterDrain(
          currentSanityRef.current,
          readingAgeSec,
          selectedMapName,
          difficultyPreset
        );
        currentHuntSanityRef.current = est;
        setHuntStartedAtSanity((prev) => (prev === null ? est : Math.max(prev, est)));
        logLine(
          `Hunt recorded at ~${est}% estimated sanity (truck read ${currentSanityRef.current}% ${Math.round(readingAgeSec)}s ago).`
        );
      } else {
        currentHuntSanityRef.current = null;
        logLine(
          readingAgeSec === null
            ? 'Hunt detected but no sanity reading yet — check the truck monitor or use "Mark Hunt @".'
            : `Hunt detected but the last sanity reading is ${Math.round(readingAgeSec)}s old — not used. Use "Mark Hunt @" if you know it.`,
          0.5
        );
      }
    }

    if (type === 'rule_out_suggestion' && typeof evt.evidence === 'string') {
      const evName = evt.evidence as EvidenceType;
      if (evidenceStatesRef.current[evName] === 'unknown') {
        pushToast({
          tier: 'suspected',
          title: `Consider Ruling Out: ${evName}`,
          detail,
          confidence: conf,
          evidence: evName,
          previousState: 'unknown',
          suggestedState: 'ruled_out',
        });
      }
    }

    if (type === 'hunt_ended') {
      const nowMs = Date.now();
      const lastStepMs =
        typeof evt.last_footstep_ts === 'number' ? evt.last_footstep_ts * 1000 : nowMs - 4500;
      lastHuntEndMsRef.current = lastStepMs;
      setHuntRunning(false);
      setCooldownRemaining(
        Math.max(0, Math.round(HUNT_COOLDOWN_STANDARD_SEC - (nowMs - lastStepMs) / 1000))
      );

      const fallbackMps = observedSpeedMps ?? 1.7;
      const firstMps = typeof evt.first_mps === 'number' ? evt.first_mps : fallbackMps;
      const minMps = typeof evt.min_mps === 'number' ? evt.min_mps : firstMps;
      const maxMps = typeof evt.max_mps === 'number' ? evt.max_mps : firstMps;
      const avgMps = typeof evt.avg_mps === 'number' ? evt.avg_mps : (minMps + maxMps) / 2;
      const durationSec = typeof evt.duration_sec === 'number' ? evt.duration_sec : huntElapsed;
      const losAccelerated = evt.los_accelerating === true;
      const huntSanity = currentHuntSanityRef.current ?? huntStartedAtSanity;
      currentHuntSanityRef.current = null;

      // Auto-complete any hunt survival objectives
      setObjectives((prev) =>
        prev.map((o) =>
          /escape|hunt|survive/i.test(o.text) ? { ...o, completed: true } : o
        )
      );

      setHuntHistory((prev) => [
        ...prev,
        {
          huntNumber: prev.length + 1,
          startedAtSanity: huntSanity,
          firstMps,
          minMps,
          maxMps,
          avgMps,
          durationSec,
          losAccelerated,
        },
      ]);
    }

    if (type === 'ghost_behavior' && typeof evt.behavior_id === 'string') {
      const bId = evt.behavior_id;
      const autoThresh = thresholdsRef.current.auto_apply;
      if (!activeBehaviorsRef.current.includes(bId)) {
        activeBehaviorsRef.current = [...activeBehaviorsRef.current, bId];
      }
      setActiveBehaviors((prev) => (prev.includes(bId) ? prev : [...prev, bId]));
      setToasts((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          tier: conf >= autoThresh ? 'auto_applied' : 'suspected',
          title: `Audio Signature: ${evt.ghost || bId}`,
          detail,
          confidence: conf,
          behaviorId: bId,
          createdAt: Date.now(),
        },
        ...prev.slice(0, 3),
      ]);
    }

    if (type === 'evidence' && typeof evt.evidence === 'string') {
      const evName = evt.evidence as EvidenceType;
      const autoThresh = thresholdsRef.current.auto_apply;
      const incomingState =
        (evt.state as EvidenceState) || (conf >= autoThresh ? 'confirmed' : 'suspected');
      const source = String(evt.source || 'cv');
      const nowMs = Date.now();

      // Noisy-OR multi-cue & repeated-cue sensor fusion
      let fusedConf = conf;
      if (incomingState !== 'ruled_out') {
        const prevEntry = evidenceFusionRef.current[evName];
        if (
          prevEntry &&
          (!prevEntry.sources.has(source) || nowMs - prevEntry.lastTs >= 2500)
        ) {
          const weight = !prevEntry.sources.has(source) ? 0.85 : 0.45;
          fusedConf = Math.min(0.98, 1 - (1 - prevEntry.conf) * (1 - conf * weight));
          prevEntry.sources.add(source);
          prevEntry.lastTs = nowMs;
          prevEntry.conf = Math.max(prevEntry.conf, fusedConf);
        } else if (!prevEntry) {
          evidenceFusionRef.current[evName] = {
            sources: new Set([source]),
            lastTs: nowMs,
            conf,
          };
          fusedConf = conf;
        } else {
          fusedConf = Math.max(prevEntry.conf, conf);
        }
      }
      fusedConf = Math.max(fusedConf, conf);

      setEvidenceConfidence((prev) => ({
        ...prev,
        [evName]: Math.max(prev[evName] ?? 0, fusedConf),
      }));

      const oldState = evidenceStatesRef.current[evName];
      // Never downgrade an already confirmed evidence to suspected
      if (oldState === 'confirmed' && incomingState === 'suspected' && fusedConf < autoThresh) {
        return;
      }

      const finalState: EvidenceState =
        fusedConf >= autoThresh
          ? incomingState === 'ruled_out'
            ? 'ruled_out'
            : 'confirmed'
          : 'suspected';

      if (oldState !== finalState) {
        evidenceStatesRef.current = {
          ...evidenceStatesRef.current,
          [evName]: finalState,
        };
        setEvidenceStates((prev) => ({
          ...prev,
          [evName]: finalState,
        }));
        const multiCuePromoted =
          finalState === 'confirmed' && fusedConf >= autoThresh && conf < autoThresh;
        pushToast({
          tier: fusedConf >= autoThresh ? 'auto_applied' : 'suspected',
          title: multiCuePromoted
            ? `Auto-Confirmed (Multi-Cue Fusion): ${evName}`
            : finalState === 'confirmed'
            ? `Auto-Marked: ${evName}`
            : finalState === 'ruled_out'
            ? `Ruled Out: ${evName}`
            : `Suspected Cue: ${evName}`,
          detail,
          confidence: fusedConf,
          evidence: evName,
          previousState: oldState,
        });
      }
    }

    if (type === 'smudge_timer') {
      smudgeStartedAtRef.current = Date.now();
      setSmudgeRemaining(SMUDGE_TIMER_SEC);
      setObjectives((prev) =>
        prev.map((o) =>
          /cleanse|smudge|incense/i.test(o.text) ? { ...o, completed: true } : o
        )
      );
      pushToast({
        tier: 'auto_applied',
        title: 'Incense Smudge Ignited!',
        detail: 'Starting 60s Demon, 90s Standard, and 180s Spirit lockout timer.',
        confidence: conf,
      });
    }

    if (type === 'crucifix_burned') {
      setObjectives((prev) =>
        prev.map((o) =>
          /crucifix|prevent|block/i.test(o.text) ? { ...o, completed: true } : o
        )
      );
      pushToast({
        tier: 'auto_applied',
        title: 'Crucifix Burned — Hunt Blocked!',
        detail,
        confidence: conf,
      });
    }

    if (type === 'salt_stepped') {
      setSaltStepRemaining(15);
      setObjectives((prev) =>
        prev.map((o) =>
          /salt|uv|footstep|step/i.test(o.text) ? { ...o, completed: true } : o
        )
      );
      pushToast({
        tier: 'auto_applied',
        title: 'Ghost Stepped in Salt!',
        detail: 'Salt footprint active — scan with UV light within 15 seconds.',
        confidence: conf,
      });
    }

    if (type === 'parabolic_reading' && typeof evt.reading === 'number') {
      const rd = Number(evt.reading);
      const dist = typeof evt.estimated_distance_m === 'number' ? Number(evt.estimated_distance_m) : 8.0;
      setParabolicReading({ reading: rd, estimated_distance_m: dist, timestamp: Date.now() });
      setObjectives((prev) =>
        prev.map((o) =>
          /parabolic|sound|audio/i.test(o.text) ? { ...o, completed: true } : o
        )
      );
    }

    if (type === 'objectives_detected' && Array.isArray(evt.objectives) && evt.objectives.length > 0) {
      setObjectives(
        evt.objectives.map((text: string, idx: number) => ({
          id: `obj_${idx + 1}`,
          text: String(text),
          completed: false,
        }))
      );
      pushToast({
        tier: 'auto_applied',
        title: 'Contract Objectives Synced',
        detail: `Loaded ${evt.objectives.length} optional objectives from truck whiteboard.`,
        confidence: conf,
      });
    }
  };

  // Connect WebSocket to Python CV & Audio DSP Sidecar
  // The socket is opened once, so it calls handlers through refs that are refreshed every render.
  // (Previously it captured the first render's handler, which froze values like currentSanity at 100.)
  const detectionHandlerRef = useRef(handleDetectionEvent);
  detectionHandlerRef.current = handleDetectionEvent;
  const hotkeyHandlerRef = useRef(executeHotkeyAction);
  hotkeyHandlerRef.current = executeHotkeyAction;

  useEffect(() => {
    let reconnectTimer: number | null = null;
    const connect = () => {
      const ws = new WebSocket('ws://127.0.0.1:8765/ws');
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            action: 'set_preview',
            enabled: activeTabRef.current === 'calibration',
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if ((data.kind === 'init' || data.kind === 'config_updated') && data.config) {
            if (data.config.hotkeys) {
              setHotkeys(data.config.hotkeys);
              window.phasmoOverlay?.updateHotkeys(data.config.hotkeys);
            }
            if (data.config.temperature_unit) setTemperatureUnit(data.config.temperature_unit);
            if (data.config.equipment_tiers) setEquipmentTiers(data.config.equipment_tiers);
            if (data.config.hud_position) setHudPosition(data.config.hud_position);
            if (data.config.confidence_thresholds) {
              thresholdsRef.current = {
                auto_apply: Number(data.config.confidence_thresholds.auto_apply ?? 0.85),
                suspected: Number(data.config.confidence_thresholds.suspected ?? 0.52),
              };
            }
            if (data.config.difficulty) {
              if (data.config.difficulty.preset_name) {
                setDifficultyPreset(data.config.difficulty.preset_name);
              }
              if (typeof data.config.difficulty.evidence_count === 'number') {
                setEvidenceCountSetting(data.config.difficulty.evidence_count);
              }
              if (typeof data.config.difficulty.ghost_speed_multiplier === 'number') {
                setSpeedMultiplier(data.config.difficulty.ghost_speed_multiplier);
              }
            }
            if (data.config.theme) setCurrentTheme(data.config.theme as ThemeId);
            if (data.config.accent_color) setCurrentAccent(data.config.accent_color as AccentColorId);
            if (data.config.hud_layout) setHudLayout(data.config.hud_layout as HudLayoutMode);
            if (typeof data.config.ui_scale === 'number') setUiScale(data.config.ui_scale);
            if (typeof data.config.hud_opacity === 'number') setHudOpacity(data.config.hud_opacity);
            if (typeof data.config.crt_scanlines === 'boolean') setCrtScanlines(data.config.crt_scanlines);
            if (typeof data.config.ui_sound === 'boolean') setUiSoundEnabled(data.config.ui_sound);
            if (typeof data.config.streamer_mode === 'boolean') setStreamerMode(data.config.streamer_mode);
            if (typeof data.config.chroma_key === 'boolean') setChromaKeyEnabled(data.config.chroma_key);
            if (typeof data.config.detectors_enabled?.audio_engine_enabled === 'boolean') {
              setAudioEngineEnabled(data.config.detectors_enabled.audio_engine_enabled);
            }
            if (typeof data.config.detectors_enabled?.vision_engine_enabled === 'boolean') {
              setVisionEngineEnabled(data.config.detectors_enabled.vision_engine_enabled);
            }
            if (typeof data.config.capture_fps === 'number') {
              setCaptureFps(data.config.capture_fps);
            }
          }
          if (data.kind === 'hotkey' && typeof data.action === 'string') {
            hotkeyHandlerRef.current(data.action);
          }
          if (data.history) {
            setAnalyticsSummary(data.history);
          }
          if (data.kind === 'history_updated' && data.summary) {
            setAnalyticsSummary(data.summary);
          }
          if (data.kind === 'telemetry') {
            if (data.audio) {
              setAudioTelemetry((prev) => {
                if (activeTabRef.current !== 'calibration') {
                  const na = data.audio;
                  if (
                    prev.mps === na.mps &&
                    prev.bpm === na.bpm &&
                    prev.footstep_direction === na.footstep_direction &&
                    prev.last_onset_band === na.last_onset_band &&
                    Boolean(prev.flash_active) === Boolean(na.flash_active) &&
                    Boolean(prev.player_moving) === Boolean(na.player_moving) &&
                    Boolean(prev.voice_rejected) === Boolean(na.voice_rejected)
                  ) {
                    return prev;
                  }
                }
                return data.audio;
              });
            }
            if (data.preview_b64) setPreviewB64(data.preview_b64);
          }
          if (data.kind === 'detection' && data.event) {
            detectionHandlerRef.current(data.event);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connect, 1800);
      };
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // Tick active timers every 1 second & auto-expire toasts after 7.5s
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      // Derive the smudge countdown from its start time so it never drifts
      const smudgeStart = smudgeStartedAtRef.current;
      if (smudgeStart !== null) {
        const remaining = Math.max(0, SMUDGE_TIMER_SEC - Math.floor((now - smudgeStart) / 1000));
        setSmudgeRemaining(remaining);
        if (remaining === 0) smudgeStartedAtRef.current = null;
      }
      setCooldownRemaining((c) => (c > 0 ? c - 1 : 0));
      setSaltStepRemaining((s) => (s > 0 ? s - 1 : 0));
      setHuntElapsed((h) => (huntRunning ? h + 1 : h));
      setToasts((prev) => prev.filter((t) => now - t.createdAt < 7500));
    }, 1000);
    return () => clearInterval(interval);
  }, [huntRunning]);

  // Listen to Electron IPC mode & global hotkey events + browser fallback hotkeys
  useEffect(() => {
    const cleanMode = window.phasmoOverlay?.onOverlayModeChanged((interactive) => {
      setIsInteractive(interactive);
    });
    const cleanHotkey = window.phasmoOverlay?.onHotkeyAction((action) => {
      hotkeyHandlerRef.current(action);
    });

    // Browser keyboard listener for testing or when window has focus
    const onKeyDown = (e: KeyboardEvent) => {
      if (recordingHotkeyFor) {
        e.preventDefault();
        const parts: string[] = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
          parts.push(key);
          const combo = parts.join('+');
          const updated = { ...hotkeys, [recordingHotkeyFor]: combo };
          setHotkeys(updated);
          setRecordingHotkeyFor(null);
          window.phasmoOverlay?.updateHotkeys(updated);
          fetch('http://127.0.0.1:8765/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotkeys: updated }),
          }).catch(() => {});
        }
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'q' && !window.phasmoOverlay) {
        e.preventDefault();
        setIsInteractive((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === 'z' && !window.phasmoOverlay) {
        e.preventDefault();
        undoLastDetection();
      } else if ((e.altKey && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 't')) && !window.phasmoOverlay) {
        e.preventDefault();
        toggleSmudgeTimer();
      } else if (e.altKey && e.key.toLowerCase() === 'o' && !window.phasmoOverlay) {
        e.preventDefault();
        setIsObjectivesOpen((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === 'l' && !window.phasmoOverlay) {
        e.preventDefault();
        setHudLayout((prev) => {
          const next = prev === 'vertical' ? 'horizontal' : 'vertical';
          updateBackendConfig({ hud_layout: next });
          return next;
        });
        if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
      } else if (e.altKey && e.key.toLowerCase() === 'm' && !window.phasmoOverlay) {
        e.preventDefault();
        toggleAudioProcessing();
      } else if (e.altKey && e.key.toLowerCase() === 'v' && !window.phasmoOverlay) {
        e.preventDefault();
        toggleVisionProcessing();
      } else if (e.altKey && e.key.toLowerCase() === 'b' && !window.phasmoOverlay) {
        e.preventDefault();
        triggerTapBpm();
      } else if (e.altKey && e.key.toLowerCase() === 'r' && !window.phasmoOverlay) {
        e.preventDefault();
        resetInvestigation();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      cleanMode?.();
      cleanHotkey?.();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recordingHotkeyFor, hotkeys]);

  const toggleOverlayMode = (target: boolean) => {
    if (window.phasmoOverlay) {
      window.phasmoOverlay.setOverlayMode(target);
    } else {
      setIsInteractive(target);
    }
  };

  const cycleEvidenceState = (ev: EvidenceType) => {
    const order: EvidenceState[] = ['unknown', 'confirmed', 'ruled_out', 'suspected'];
    setEvidenceStates((prev) => {
      const next = order[(order.indexOf(prev[ev]) + 1) % order.length];
      return { ...prev, [ev]: next };
    });
  };

  const triggerSimulation = async (scenario: string) => {
    try {
      await fetch('http://127.0.0.1:8765/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
    } catch (_) {}
  };

  const updateBackendConfig = (patch: Record<string, unknown>) => {
    fetch('http://127.0.0.1:8765/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const selectDifficultyPreset = (presetName: string) => {
    const found = DIFFICULTY_PRESETS.find((p) => p.name === presetName);
    setDifficultyPreset(presetName);
    if (found && presetName !== 'Custom') {
      setEvidenceCountSetting(found.evidence);
      setSpeedMultiplier(found.speed);
      updateBackendConfig({
        difficulty: {
          preset_name: presetName,
          evidence_count: found.evidence,
          ghost_speed_multiplier: found.speed,
        },
      });
    } else {
      updateBackendConfig({
        difficulty: { preset_name: 'Custom' },
      });
    }
  };

  const currentMap = useMemo(
    () => PHASMO_MAPS.find((m) => m.name === selectedMapName) || PHASMO_MAPS[0],
    [selectedMapName]
  );

  const hudCornerClass = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }[hudPosition];

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeTheme = THEMES[currentTheme] || THEMES.modern;
  const activeAccent = ACCENT_COLORS[currentAccent] || ACCENT_COLORS.sky;

  // ============================================================================
  // COMPACT CLICK-THROUGH MINI-HUD (Default In-Game View)
  // ============================================================================
  if (!isInteractive) {
    const topCandidates = evaluation.candidates.slice(0, 4);
    const activeMps =
      audioTelemetry.mps > 0 ? audioTelemetry.mps : observedSpeedMps ?? 0;
    const isOnsetFlashing =
      Boolean(audioTelemetry.flash_active) || (Date.now() - lastOnsetFlash < 380);

    return (
      <div
        className={`relative w-screen h-screen pointer-events-none ${
          chromaKeyEnabled ? 'bg-[#00FF00]' : ''
        }`}
      >
        {hudLayout === 'horizontal' ? (
          /* =========================================================
             ULTRA-SLIM HORIZONTAL DOCK (Screen Ribbon)
             ========================================================= */
          <div
            className={`fixed ${
              hudPosition.startsWith('top') ? 'top-3' : 'bottom-3'
            } left-1/2 -translate-x-1/2 max-w-[96vw] flex flex-col items-center gap-2 z-50 transition-all duration-200 select-none`}
            style={{
              zoom: uiScale,
              opacity: hudOpacity,
            }}
          >
            {/* Dock Main Bar */}
            <div
              className={`rounded-2xl ${activeTheme.cardBg} ${activeTheme.cardBorder} ${
                activeTheme.paperTexture ? 'paper-vignette' : ''
              } ${
                crtScanlines && activeTheme.hasScanlines ? 'crt-scanlines' : ''
              } border shadow-2xl px-4 py-2 flex items-center gap-3.5 ${activeTheme.fontClass} ${activeTheme.textPrimary}`}
            >
              {/* 1. Status & Map/Difficulty Pill */}
              <div className="flex items-center gap-2 pr-2 border-r border-slate-800/80 shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${activeAccent.textClass}`}>
                      {difficultyPreset} ({evidenceCountSetting}E)
                    </span>
                    {!visionEngineEnabled && (
                      <span className="text-[8px] font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        MANUAL
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 truncate max-w-[110px]">
                    {markedGhostRoom ? `${selectedMapName} • ${markedGhostRoom}` : selectedMapName}
                  </span>
                </div>
              </div>

              {/* 2. Top Ghost Candidate */}
              <div className="flex items-center gap-2 pr-2 border-r border-slate-800/80 shrink-0">
                {topCandidates.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        {topCandidates[0].ghost.name}
                        {pinnedGhost === topCandidates[0].ghost.name && (
                          <span className="text-[8px] px-1 rounded bg-sky-500/30 text-sky-200">Pinned</span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {topCandidates[0].ghost.baseSpeedMps} m/s • ≤{topCandidates[0].ghost.huntSanity}%
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      {topCandidates[0].matchScore}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-rose-400">No match</span>
                )}
              </div>

              {/* 3. 7 Evidence Micro-Pills */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-800/80 shrink-0">
                {ALL_EVIDENCES.map((ev) => {
                  const st = evidenceStates[ev];
                  const badgeStyle =
                    st === 'confirmed'
                      ? activeTheme.evidenceConfirmed
                      : st === 'suspected'
                      ? activeTheme.evidenceSuspected
                      : st === 'ruled_out'
                      ? activeTheme.evidenceRuledOut
                      : activeTheme.evidenceNormal;
                  return (
                    <div
                      key={ev}
                      title={`${ev}: ${st}`}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono leading-none border uppercase ${badgeStyle}`}
                    >
                      {SHORT_EVIDENCE_NAMES[ev]}
                    </div>
                  );
                })}
              </div>

              {/* 4. Speed & Sanity Telemetry */}
              <div className="flex items-center gap-2.5 pr-2 border-r border-slate-800/80 shrink-0">
                <div className="flex items-center gap-1 font-mono text-xs">
                  <Footprints
                    className={`w-3.5 h-3.5 ${
                      !audioEngineEnabled
                        ? 'text-rose-400'
                        : isOnsetFlashing
                        ? 'text-emerald-400 animate-pulse'
                        : activeAccent.textClass
                    }`}
                  />
                  <span className={`font-bold ${!audioEngineEnabled ? 'text-rose-400 text-[11px]' : 'text-slate-100'}`}>
                    {!audioEngineEnabled
                      ? 'MUTED'
                      : activeMps > 0
                      ? `${activeMps.toFixed(2)}m/s`
                      : '—'}
                  </span>
                  {audioEngineEnabled && audioTelemetry.footstep_direction && (
                    <span className="text-[9px] text-cyan-400 font-bold">
                      {audioTelemetry.footstep_direction === 'LEFT'
                        ? '◀L'
                        : audioTelemetry.footstep_direction === 'RIGHT'
                        ? 'R▶'
                        : '●C'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <Brain className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-emerald-300">{currentSanity}%</span>
                </div>
              </div>

              {/* 5. Active Timers Pill */}
              {(smudgeRemaining > 0 || saltStepRemaining > 0 || huntRunning || cooldownRemaining > 0) && (
                <div className="flex items-center gap-2 pr-2 border-r border-slate-800/80 shrink-0">
                  {smudgeRemaining > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-xs">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>{formatTimer(smudgeRemaining)}</span>
                      <span className="text-[9px] uppercase font-bold text-slate-400">
                        ({smudgeRemaining > 120 ? 'Demon' : smudgeRemaining > 90 ? 'Std' : 'Spirit'})
                      </span>
                    </div>
                  )}
                  {saltStepRemaining > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 font-mono text-xs animate-pulse">
                      <Footprints className="w-3 h-3 text-cyan-400" />
                      <span>UV {saltStepRemaining}s</span>
                    </div>
                  )}
                  {huntRunning && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500 text-rose-300 font-mono text-xs font-bold animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>HUNT {huntElapsed}s</span>
                    </div>
                  )}
                </div>
              )}

              {/* 6. Objectives count, layout switch & full overlay buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                  onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                  onClick={() => {
                    setIsObjectivesOpen((p) => !p);
                    if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                  }}
                  className="pointer-events-auto text-[10px] font-semibold px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/40 transition flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                  Obj {objectives.filter((o) => o.completed).length}/{objectives.length}
                </button>

                <button
                  onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                  onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                  onClick={() => {
                    setHudLayout('vertical');
                    updateBackendConfig({ hud_layout: 'vertical' });
                    if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
                  }}
                  title="Switch to Vertical Card Layout (Alt+L)"
                  className="pointer-events-auto text-[10px] font-semibold p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  <Layout className="w-3.5 h-3.5" />
                </button>

                <button
                  onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                  onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                  onClick={() => {
                    toggleOverlayMode(true);
                    if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                  }}
                  className={`pointer-events-auto text-[10px] font-bold px-2 py-1 rounded ${activeAccent.bgClass} hover:opacity-90 text-slate-950 transition shadow`}
                >
                  {hotkeys.toggle_overlay} Full
                </button>
              </div>
            </div>

            {/* Optional Objectives Dropdown when in Horizontal mode */}
            {isObjectivesOpen && objectives.length > 0 && (
              <div
                className={`rounded-xl ${activeTheme.cardBg} ${activeTheme.cardBorder} border p-2.5 shadow-2xl flex items-center gap-3 ${activeTheme.fontClass}`}
              >
                {objectives.map((obj) => (
                  <div
                    key={obj.id}
                    onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                    onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                    onClick={() => {
                      setObjectives((prev) =>
                        prev.map((o) => (o.id === obj.id ? { ...o, completed: !o.completed } : o))
                      );
                      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                    }}
                    className="pointer-events-auto flex items-center gap-1.5 text-xs cursor-pointer select-none"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] shrink-0 ${
                        obj.completed
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 border border-slate-700 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`text-[11px] truncate max-w-[160px] ${
                        obj.completed ? 'line-through text-slate-400' : activeTheme.textPrimary
                      }`}
                    >
                      {obj.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* =========================================================
             CLASSIC VERTICAL CARD (370px Corner)
             ========================================================= */
          <div
            className={`fixed ${hudCornerClass} w-[370px] flex flex-col gap-2.5 z-50 transition-all duration-200 select-none`}
            style={{
              zoom: uiScale,
              opacity: hudOpacity,
            }}
          >
            {/* Main Mini-HUD Card */}
            <div
              className={`rounded-xl ${activeTheme.cardBg} ${activeTheme.cardBorder} ${
                activeTheme.paperTexture ? 'paper-vignette' : ''
              } ${
                crtScanlines && activeTheme.hasScanlines ? 'crt-scanlines' : ''
              } border shadow-2xl p-3.5 ${activeTheme.fontClass} ${activeTheme.textPrimary}`}
            >
              {/* Top Status Row */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <span className={`font-bold tracking-wider text-xs uppercase ${activeAccent.textClass}`}>
                    PhasmoSense HUD
                  </span>
                  <span className="text-[11px] text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-1">
                    <span>{difficultyPreset} ({evidenceCountSetting}E • {Math.round(speedMultiplier * 100)}%)</span>
                    {!visionEngineEnabled && (
                      <span className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Manual Mode
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                    onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                    onClick={() => {
                      setHudLayout('horizontal');
                      updateBackendConfig({ hud_layout: 'horizontal' });
                      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'toggle');
                    }}
                    title="Switch to Horizontal Dock Layout (Alt+L)"
                    className="pointer-events-auto text-[11px] p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    <Layout className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                    onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                    onClick={() => {
                      setIsObjectivesOpen((p) => !p);
                      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                    }}
                    className="pointer-events-auto text-[11px] font-medium px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/40 transition"
                  >
                    {isObjectivesOpen ? 'Obj ✓' : 'Obj'} ({hotkeys.toggle_objectives || 'Alt+O'})
                  </button>
                  <button
                    onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                    onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                    onClick={() => {
                      toggleOverlayMode(true);
                      if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                    }}
                    className={`pointer-events-auto text-[11px] font-medium px-2 py-0.5 rounded ${activeAccent.activeBadgeClass} transition`}
                  >
                    {hotkeys.toggle_overlay} • Full Overlay
                  </button>
                </div>
              </div>

              {/* Evidence Strip */}
              <div className="grid grid-cols-7 gap-1 mb-2.5">
                {ALL_EVIDENCES.map((ev) => {
                  const st = evidenceStates[ev];
                  const conf = evidenceConfidence[ev];
                  const badgeStyle =
                    st === 'confirmed'
                      ? activeTheme.evidenceConfirmed
                      : st === 'suspected'
                      ? activeTheme.evidenceSuspected
                      : st === 'ruled_out'
                      ? activeTheme.evidenceRuledOut
                      : activeTheme.evidenceNormal;
                  return (
                    <div
                      key={ev}
                      className={`flex flex-col items-center justify-center py-1 px-0.5 rounded border text-[10px] leading-tight text-center ${badgeStyle}`}
                    >
                      <span className="truncate w-full">{SHORT_EVIDENCE_NAMES[ev]}</span>
                      {st === 'suspected' && conf && (
                        <span className="text-[9px] text-amber-300">
                          {Math.round(conf * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Top Ghost Candidates */}
              <div className="mb-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>
                    CANDIDATES ({evaluation.candidates.length}/{GHOSTS.length})
                  </span>
                  <span className={`${activeAccent.textClass} flex items-center gap-1 truncate max-w-[190px]`}>
                    <MapPin className="w-3 h-3 shrink-0" />{' '}
                    {markedGhostRoom ? `${selectedMapName} • ${markedGhostRoom}` : selectedMapName}
                  </span>
                </div>
                {topCandidates.length === 0 ? (
                  <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded px-2.5 py-1.5">
                    No matching ghosts — Press {hotkeys.undo_detection} to undo last detection
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {topCandidates.map((item) => (
                      <div
                        key={item.ghost.name}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${
                          pinnedGhost === item.ghost.name
                            ? `${activeAccent.borderClass} ${activeAccent.activeBadgeClass}`
                            : `${activeTheme.cardBg} border-white/10`
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-100 flex items-center gap-1">
                            {item.ghost.name}
                            {item.ghost.name === 'The Mimic' && (
                              <span className="text-[9px] px-1 rounded bg-purple-500/30 text-purple-200">
                                +Orbs
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.ghost.baseSpeedMps} m/s • ≤{item.ghost.huntSanity}%
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-emerald-400">
                          {item.matchScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Telemetry Bar: Footstep Speed + Sanity + Voice Isolation */}
              <div className="grid grid-cols-3 gap-1.5 mb-2.5 text-xs">
                <div
                  className={`border rounded-lg px-2.5 py-1.5 flex items-center justify-between transition-all duration-150 ${
                    isOnsetFlashing
                      ? 'bg-emerald-500/25 border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-black/40 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <div className="relative">
                      <Footprints
                        className={`w-3.5 h-3.5 transition-colors ${
                          isOnsetFlashing ? 'text-emerald-300 animate-pulse' : activeAccent.textClass
                        }`}
                      />
                      {isOnsetFlashing && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] leading-tight">Speed</span>
                      {audioTelemetry.last_onset_band && (
                        <span className="text-[8px] font-mono uppercase text-slate-400 leading-tight">
                          {audioTelemetry.last_onset_band}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-bold text-slate-100">
                      {activeMps > 0 ? `${activeMps.toFixed(2)} m/s` : '—'}
                    </span>
                    {audioTelemetry.footstep_direction && (
                      <span
                        className={`text-[9px] font-bold font-mono ${
                          audioTelemetry.footstep_direction === 'LEFT'
                            ? 'text-cyan-400'
                            : audioTelemetry.footstep_direction === 'RIGHT'
                            ? activeAccent.textClass
                            : 'text-slate-400'
                        }`}
                      >
                        {audioTelemetry.footstep_direction === 'LEFT'
                          ? '◀ L'
                          : audioTelemetry.footstep_direction === 'RIGHT'
                          ? 'R ▶'
                          : '● C'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Brain className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sanity</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-300">
                    {currentSanity}%
                  </span>
                </div>

                <div
                  className={`border rounded-lg px-2.5 py-1.5 flex items-center justify-between ${
                    !audioEngineEnabled
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      : 'bg-black/40 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-1 text-slate-400">
                    <MicOff
                      className={`w-3.5 h-3.5 ${
                        !audioEngineEnabled
                          ? 'text-rose-400'
                          : audioTelemetry.voice_rejected || audioTelemetry.player_moving
                          ? 'text-amber-400 animate-bounce'
                          : 'text-slate-500'
                      }`}
                    />
                    <span className={`text-[10px] ${!audioEngineEnabled ? 'text-rose-300 font-bold' : ''}`}>
                      {!audioEngineEnabled
                        ? 'Audio: MUTED'
                        : audioTelemetry.player_moving
                        ? audioTelemetry.footstep_direction &&
                          audioTelemetry.footstep_direction !== 'CENTER'
                          ? `WASD (${audioTelemetry.footstep_direction})`
                          : 'WASD Cut'
                        : audioTelemetry.voice_rejected
                        ? '2P Filtered'
                        : 'Audio Clean'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parabolic Mic Signal Pill (Auto-fades after 9s) */}
              {parabolicReading && Date.now() - parabolicReading.timestamp < 9000 && (
                <div className="mb-2 bg-indigo-950/80 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs text-indigo-200 animate-pulse">
                  <span className="flex items-center gap-1.5 font-bold text-[11px]">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Paramic Signal
                  </span>
                  <span className="font-mono font-bold text-indigo-300">
                    {parabolicReading.reading.toFixed(1)} (~{parabolicReading.estimated_distance_m.toFixed(1)}m away)
                  </span>
                </div>
              )}

              {/* Active Timers (Smudge 3-Phase Gate / Salt Step UV / Cooldown / Hunt) */}
              {(smudgeRemaining > 0 || saltStepRemaining > 0 || cooldownRemaining > 0 || huntRunning) && (
                <div className="flex flex-col gap-1.5 mb-2.5 bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs">
                  {smudgeRemaining > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-1.5 font-bold text-amber-300">
                          <Flame className="w-3.5 h-3.5 text-amber-400" /> Smudge: {formatTimer(smudgeRemaining)}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                            smudgeRemaining > 120
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : smudgeRemaining > 90
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50 animate-pulse'
                              : 'bg-purple-500/25 text-purple-300 border border-purple-400/50'
                          }`}
                        >
                          {smudgeRemaining > 120
                            ? `Demon Locked (${smudgeRemaining - 120}s)`
                            : smudgeRemaining > 90
                            ? `DEMON CAN HUNT! (${smudgeRemaining - 90}s)`
                            : `Spirit Gate (${smudgeRemaining}s)`}
                        </span>
                      </div>

                      {/* 3-Segment Progress Bar */}
                      <div className="grid grid-cols-3 gap-1 h-1.5 rounded-full overflow-hidden bg-black/60 p-0.5 border border-white/10">
                        <div
                          className={`h-full rounded-full transition-all ${
                            smudgeRemaining > 120
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                              : 'bg-slate-700/50'
                          }`}
                        />
                        <div
                          className={`h-full rounded-full transition-all ${
                            smudgeRemaining > 90 && smudgeRemaining <= 120
                              ? 'bg-amber-400 shadow-sm shadow-amber-400/50 animate-pulse'
                              : smudgeRemaining > 90
                              ? 'bg-slate-700/50'
                              : 'bg-amber-600/30'
                          }`}
                        />
                        <div
                          className={`h-full rounded-full transition-all ${
                            smudgeRemaining <= 90
                              ? 'bg-purple-400 shadow-sm shadow-purple-400/50'
                              : 'bg-slate-700/50'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {saltStepRemaining > 0 && (
                      <div className="flex items-center gap-1.5 text-cyan-300 font-mono text-xs bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 rounded-lg animate-pulse">
                        <Footprints className="w-3.5 h-3.5 text-cyan-400" />
                        <span>UV Footprint: {saltStepRemaining}s</span>
                      </div>
                    )}

                    {cooldownRemaining > 0 && (
                      <div className="flex items-center gap-1.5 text-sky-300 font-mono">
                        <Timer className="w-3.5 h-3.5 text-sky-400" />
                        <span>Cooldown: {cooldownRemaining}s</span>
                      </div>
                    )}

                    {huntRunning && (
                      <div className="flex items-center gap-1.5 text-rose-400 font-mono font-bold animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>HUNT ACTIVE: {huntElapsed}s</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Whiteboard Contract Objectives Mini-Panel */}
              {isObjectivesOpen && objectives.length > 0 && (
                <div className="mb-2.5 bg-black/50 border border-white/10 rounded-xl p-2.5 text-slate-200">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1.5 text-indigo-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" /> Contract Objectives
                    </span>
                    <span className="font-mono text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                      {objectives.filter((o) => o.completed).length}/{objectives.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {objectives.map((obj) => (
                      <div
                        key={obj.id}
                        onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                        onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                        onClick={() => {
                          setObjectives((prev) =>
                            prev.map((o) =>
                              o.id === obj.id ? { ...o, completed: !o.completed } : o
                            )
                          );
                          if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
                        }}
                        className="pointer-events-auto flex items-center gap-2 text-xs py-0.5 px-1 rounded hover:bg-slate-800/60 cursor-pointer select-none transition"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] shrink-0 ${
                            obj.completed
                              ? 'bg-emerald-500 text-slate-950 font-bold'
                              : 'bg-slate-800 border border-slate-700 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span
                          className={`truncate text-[11px] ${
                            obj.completed ? 'line-through text-slate-400' : 'text-slate-200'
                          }`}
                        >
                          {obj.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo 3-Star Distance Guide Pill */}
              <div className="flex items-center justify-between text-[10px] text-neutral-400 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 mb-2.5">
                <span className="font-semibold text-slate-300 flex items-center gap-1">
                  <Camera className="w-3 h-3 text-amber-400" /> Photo 3★ Guide:
                </span>
                <span className="font-mono text-emerald-300 font-bold">≤1.5m</span>
                <span className="text-slate-400">•</span>
                <span className="font-mono text-amber-300">2★ ≤3.0m</span>
                <span className="text-slate-400">•</span>
                <span className="font-mono text-slate-400">1★ &gt;3.0m</span>
              </div>

              {/* Smart Investigation Advisor ("Next Best Test") */}
              <div className="bg-sky-950/45 border border-sky-500/35 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-200">
                    {evaluation.advisor.badge}
                  </span>
                  <span className="text-xs font-semibold text-sky-100 truncate">
                    {evaluation.advisor.headline}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  {evaluation.advisor.detail}
                </p>
              </div>
            </div>

            {/* Two-Tier Confidence Toast Stack */}
            {toasts.map((t) => (
              <div
                key={t.id}
                onMouseEnter={() => window.phasmoOverlay?.setIgnoreMouse(false)}
                onMouseLeave={() => window.phasmoOverlay?.setIgnoreMouse(true)}
                className={`pointer-events-auto rounded-xl px-3.5 py-2.5 border shadow-xl backdrop-blur-md flex items-center justify-between gap-2 transition-all ${
                  t.tier === 'auto_applied'
                    ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
                    : 'bg-amber-950/90 border-amber-500/60 text-amber-100'
                }`}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/30">
                      {Math.round(t.confidence * 100)}%{' '}
                      {t.tier === 'auto_applied' ? 'Auto-Applied' : 'Suspected'}
                    </span>
                    <span className="text-xs font-bold">{t.title}</span>
                  </div>
                  <span className="text-[11px] opacity-85 mt-0.5">{t.detail}</span>
                </div>
                {t.tier === 'auto_applied' ? (
                  <button
                    onClick={undoLastDetection}
                    className="text-[11px] px-2 py-1 rounded bg-black/40 hover:bg-black/60 border border-white/15 shrink-0"
                  >
                    Undo ({hotkeys.undo_detection})
                  </button>
                ) : (
                  t.evidence && (
                    <button
                      onClick={() => {
                        const nextState = t.suggestedState === 'ruled_out' ? 'ruled_out' : 'confirmed';
                        evidenceStatesRef.current = {
                          ...evidenceStatesRef.current,
                          [t.evidence!]: nextState,
                        };
                        setEvidenceStates((prev) => ({
                          ...prev,
                          [t.evidence!]: nextState,
                        }));
                        setToasts((prev) => prev.filter((x) => x.id !== t.id));
                        if (uiSoundEnabled) playThemeUiSound(currentTheme, 'confirm');
                      }}
                      className={`text-[11px] px-2 py-1 rounded shrink-0 font-semibold border ${
                        t.suggestedState === 'ruled_out'
                          ? 'bg-rose-500/30 hover:bg-rose-500/50 border-rose-300/40'
                          : 'bg-amber-500/30 hover:bg-amber-500/50 border-amber-300/40'
                      }`}
                    >
                      {t.suggestedState === 'ruled_out' ? 'Rule Out' : 'Confirm'}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // DISCORD-STYLE FULL INTERACTIVE OVERLAY (Swapped via Alt+Q)
  // ============================================================================
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col p-5 overflow-hidden transition-colors ${
        chromaKeyEnabled ? 'bg-[#00FF00]' : activeTheme.containerBg
      } ${activeTheme.fontClass} ${activeTheme.textPrimary} ${
        activeTheme.paperTexture ? 'paper-vignette' : ''
      } ${
        crtScanlines && activeTheme.hasScanlines ? 'crt-scanlines' : ''
      }`}
      style={{
        zoom: uiScale,
        ['--accent-color' as any]: activeAccent.hex,
        backgroundColor: chromaKeyEnabled
          ? '#00FF00'
          : currentTheme === 'oled'
          ? '#000000'
          : currentTheme === 'crt'
          ? '#030903'
          : currentTheme === 'journal'
          ? '#181410'
          : '#08080c',
        backgroundImage: chromaKeyEnabled
          ? undefined
          : currentTheme === 'oled'
          ? undefined
          : currentTheme === 'crt'
          ? `radial-gradient(circle at 50% 0%, rgba(77,252,77,0.08) 0%, transparent 75%)`
          : currentTheme === 'journal'
          ? `radial-gradient(circle at 50% 0%, rgba(180,130,80,0.12) 0%, transparent 75%)`
          : `radial-gradient(ellipse at 50% 0%, ${activeAccent.hex}14 0%, transparent 75%)`,
      }}
    >
      {/* Top Command Header */}
      <header
        className={`flex items-center justify-between ${activeTheme.headerBg} rounded-2xl px-5 py-3 mb-4 shadow-xl border`}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${activeAccent.activeBadgeClass} flex items-center justify-center ${activeAccent.textClass}`}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">
                  PhasmoSense Overlay
                </h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> 100% External Anti-Cheat Safe
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Press <kbd className={`px-1.5 py-0.5 bg-slate-800 rounded ${activeAccent.lightTextClass} font-mono`}>{hotkeys.toggle_overlay}</kbd> anytime to return to Click-Through Mini-HUD
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 ml-6 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setActiveTab('solver');
                if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'solver'
                  ? `${activeAccent.bgClass} text-slate-950 shadow font-bold`
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Ghost Solver ({evaluation.candidates.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('maps');
                if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'maps'
                  ? `${activeAccent.bgClass} text-slate-950 shadow font-bold`
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <Compass className="w-3.5 h-3.5" /> Interactive Maps
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'history'
                  ? `${activeAccent.bgClass} text-slate-950 shadow font-bold`
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Analytics & History
            </button>
            <button
              onClick={() => {
                setActiveTab('calibration');
                if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'calibration'
                  ? `${activeAccent.bgClass} text-slate-950 shadow font-bold`
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> CV / Audio Studio & Simulator
            </button>
            <button
              onClick={() => {
                setActiveTab('settings');
                if (uiSoundEnabled) playThemeUiSound(currentTheme, 'click');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'settings'
                  ? `${activeAccent.bgClass} text-slate-950 shadow font-bold`
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" /> Keybinds & Personalization
            </button>
          </nav>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleSmudgeTimer}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              smudgeRemaining > 0
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            {smudgeRemaining > 0 ? `Smudge ${formatTimer(smudgeRemaining)}` : `Smudge Timer (${hotkeys.toggle_smudge_timer})`}
          </button>

          <button
            onClick={() => setIsObjectivesOpen((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              isObjectivesOpen
                ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            Objectives ({hotkeys.toggle_objectives || 'Alt+O'})
          </button>

          <button
            onClick={toggleAudioProcessing}
            title={`Toggle Master Audio Processing & DSP (${hotkeys.toggle_audio || 'Alt+M'})`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              audioEngineEnabled
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 border-rose-400 text-rose-200 hover:bg-rose-500/30 animate-pulse'
            }`}
          >
            {audioEngineEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>{audioEngineEnabled ? 'Audio ON' : 'Audio MUTED'}</span>
            <span className="text-[10px] opacity-75">({hotkeys.toggle_audio || 'Alt+M'})</span>
          </button>

          <button
            onClick={toggleVisionProcessing}
            title={`Toggle Screen Monitoring & Computer Vision (${hotkeys.toggle_vision || 'Alt+V'})`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              visionEngineEnabled
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 hover:bg-sky-500/30'
                : 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30'
            }`}
          >
            {visionEngineEnabled ? (
              <Eye className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{visionEngineEnabled ? 'Vision ON' : 'Vision PAUSED (Manual)'}</span>
            <span className="text-[10px] opacity-75">({hotkeys.toggle_vision || 'Alt+V'})</span>
          </button>

          <button
            onClick={undoLastDetection}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition"
          >
            <Undo2 className={`w-3.5 h-3.5 ${activeAccent.textClass}`} /> Undo ({hotkeys.undo_detection})
          </button>

          <button
            onClick={resetInvestigation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset ({hotkeys.reset_match})
          </button>

          <button
            onClick={() => toggleOverlayMode(false)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl ${activeAccent.bgClass} ${activeAccent.hoverBgClass} text-slate-950 font-bold text-xs transition shadow`}
          >
            Resume Game ({hotkeys.toggle_overlay})
          </button>
        </div>
      </header>

      {/* =====================================================================
          TAB 1: GHOST SOLVER & INVESTIGATION ADVISOR
         ===================================================================== */}
      {activeTab === 'solver' && (
        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
          {/* Left Column: Evidence, Audio Speed, Sanity & Behavior Filters */}
          <div className="col-span-4 flex flex-col gap-3.5 overflow-y-auto pr-1">
            {/* Evidence & Difficulty Controls */}
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <div className="mb-3 pb-3 border-b border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Compass className={`w-3.5 h-3.5 ${activeAccent.textClass}`} /> Contract Map (Auto + Manual)
                  </span>
                  <select
                    value={selectedMapName}
                    onChange={(e) => {
                      const found = PHASMO_MAPS.find((m) => m.name === e.target.value);
                      if (found) {
                        setSelectedMapName(found.name);
                        setSelectedFloor(found.floors[0]);
                        setMarkedGhostRoom(null);
                      }
                    }}
                    className={`bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-semibold ${activeAccent.lightTextClass} focus:outline-none`}
                  >
                    {PHASMO_MAPS.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.size})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Contract Difficulty Preset
                    </span>
                    <span className={`text-[11px] ${activeAccent.lightTextClass} font-semibold`}>
                      {difficultyPreset} ({evidenceCountSetting} Evidence • {Math.round(speedMultiplier * 100)}% Speed)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {DIFFICULTY_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        title={p.desc}
                        onClick={() => selectDifficultyPreset(p.name)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition truncate ${
                          difficultyPreset === p.name
                            ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold shadow`
                            : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Layers className={`w-4 h-4 ${activeAccent.textClass}`} /> Evidence Filters (Auto + Manual)
                </h2>
                <div className="flex items-center gap-1">
                  {[3, 2, 1, 0].map((cnt) => (
                    <button
                      key={cnt}
                      onClick={() => {
                        setDifficultyPreset('Custom');
                        setEvidenceCountSetting(cnt);
                        updateBackendConfig({
                          difficulty: { preset_name: 'Custom', evidence_count: cnt },
                        });
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
                        evidenceCountSetting === cnt
                          ? `${activeAccent.activeBadgeClass} font-bold`
                          : 'bg-black/40 border-white/10 text-slate-400'
                      }`}
                    >
                      {cnt}E
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {ALL_EVIDENCES.map((ev) => {
                  const st = evidenceStates[ev];
                  const conf = evidenceConfidence[ev];
                  return (
                    <div
                      key={ev}
                      onClick={() => cycleEvidenceState(ev)}
                      className={`cursor-pointer flex items-center justify-between px-3 py-2 rounded-xl border transition ${
                        st === 'confirmed'
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-100'
                          : st === 'suspected'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-100'
                          : st === 'ruled_out'
                          ? 'bg-rose-950/35 border-rose-800/50 text-rose-300/70 line-through'
                          : 'bg-slate-950/70 border-slate-800/90 text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {st === 'confirmed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {st === 'suspected' && <HelpCircle className="w-4 h-4 text-amber-400" />}
                        {st === 'ruled_out' && <XCircle className="w-4 h-4 text-rose-400" />}
                        {st === 'unknown' && <span className="w-4 h-4 rounded-full border border-slate-600 inline-block" />}
                        {ev === 'EMF Level 5' && (
                          <img src="./assets/EMF 5.png" alt="EMF" className="w-4 h-4 object-contain inline-block" />
                        )}
                        {ev === 'Ultraviolet' && (
                          <img src="./assets/Small Fingerprint.png" alt="UV" className="w-4 h-4 object-contain inline-block" />
                        )}
                        {ev === 'D.O.T.S Projector' && (
                          <img src="./assets/Dots 1.png" alt="DOTS" className="w-4 h-4 object-contain inline-block" />
                        )}
                        <span className="text-xs font-semibold">{ev}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {conf !== undefined && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30 text-slate-300">
                            CV/DSP {Math.round(conf * 100)}%
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wider opacity-75">
                          {st.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footstep Speed & Sanity Analyzer */}
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Gauge className={`w-4 h-4 ${activeAccent.textClass}`} /> Hunt Speed & Sanity Telemetry
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    title="When ON, ignores footsteps while you hold W/A/S/D. Turn OFF if looping a ghost or spectating in multiplayer!"
                    onClick={() => {
                      const next = !ignorePlayerWasd;
                      setIgnorePlayerWasd(next);
                      updateBackendConfig({
                        detectors_enabled: { ignore_player_wasd_steps: next },
                      });
                    }}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
                      ignorePlayerWasd
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    WASD Gate: {ignorePlayerWasd ? 'ON' : 'OFF (Loop/Spec)'}
                  </button>
                  <button
                    onClick={triggerTapBpm}
                    className={`px-2.5 py-1 rounded-lg ${activeAccent.activeBadgeClass} ${activeAccent.borderClass} text-xs font-semibold`}
                  >
                    Tap ({hotkeys.tap_bpm})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div className="bg-black/40 border border-white/10 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Detected Ghost Speed</span>
                    {audioTelemetry.footstep_direction &&
                      (observedSpeedMps ?? audioTelemetry.mps) > 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeAccent.activeBadgeClass} ${activeAccent.borderClass}`}>
                          {audioTelemetry.footstep_direction === 'LEFT'
                            ? '◄ LEFT'
                            : audioTelemetry.footstep_direction === 'RIGHT'
                            ? 'RIGHT ►'
                            : 'CENTER'}
                        </span>
                      )}
                  </div>
                  <div className={`text-lg font-mono font-bold ${activeAccent.lightTextClass}`}>
                    {(observedSpeedMps ?? audioTelemetry.mps) > 0
                      ? `${(observedSpeedMps ?? audioTelemetry.mps).toFixed(2)} m/s`
                      : 'None'}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                    <span>{audioTelemetry.bpm > 0 ? `${audioTelemetry.bpm} BPM` : 'Standard = 1.70 m/s'}</span>
                    {observedSpeedMps !== null && (
                      <button
                        onClick={() => setObservedSpeedMps(null)}
                        className="text-rose-400 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/10 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Team / Target Sanity</span>
                    <span className="font-mono font-bold text-emerald-300">{currentSanity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={currentSanity}
                    onChange={(e) => {
                      setCurrentSanity(Number(e.target.value));
                      // A manual slider change counts as a fresh sanity reading
                      sanityReadAtRef.current = Date.now();
                    }}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <button
                      onClick={() => {
                        currentHuntSanityRef.current = currentSanity;
                        setHuntStartedAtSanity(currentSanity);
                      }}
                      className={`${activeAccent.lightTextClass} hover:underline`}
                    >
                      Mark Hunt @ {currentSanity}%
                    </button>
                    {huntStartedAtSanity !== null && (
                      <span className="text-amber-300">
                        Hunted @ {huntStartedAtSanity}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Manual Speed Quick Filter */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-400 mr-1">Quick Speed:</span>
                {[
                  { label: 'Slow (1.0)', val: 1.0 },
                  { label: 'Twins- (1.53)', val: 1.53 },
                  { label: 'Normal (1.7)', val: 1.7 },
                  { label: 'Twins+ (1.87)', val: 1.87 },
                  { label: 'Fast (2.5+)', val: 2.55 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() =>
                      setObservedSpeedMps((prev) =>
                        prev === preset.val ? null : preset.val
                      )
                    }
                    className={`px-2 py-1 rounded border transition ${
                      observedSpeedMps === preset.val
                        ? `${activeAccent.activeBadgeClass} ${activeAccent.borderClass} font-semibold`
                        : 'bg-black/40 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Per-Hunt Speed & Sanity History */}
              {huntHistory.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-800/80">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                    Hunt History ({huntHistory.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {huntHistory.map((h) => (
                      <span
                        key={h.huntNumber}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/40 border border-white/10 text-slate-300"
                      >
                        #{h.huntNumber}: {h.minMps.toFixed(2)}–{h.maxMps.toFixed(2)} m/s •{' '}
                        {Math.round(h.durationSec)}s
                        {h.startedAtSanity !== null ? ` • @${h.startedAtSanity}%` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 0-Evidence & Nightmare Behavioral Elimination Checklist */}
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2.5">
                <Zap className="w-4 h-4 text-amber-400" /> Behavioral & 0-Evidence Observations
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {BEHAVIOR_TAGS.map((tag) => {
                  const active = activeBehaviors.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      title={tag.description}
                      onClick={() =>
                        setActiveBehaviors((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((x) => x !== tag.id)
                            : [...prev, tag.id]
                        )
                      }
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition text-left ${
                        active
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-semibold'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Whiteboard Contract Objectives Card */}
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400" /> Optional Objectives (Auto-OCR + Manual)
                </h2>
                <span className="text-[11px] font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30">
                  {objectives.filter((o) => o.completed).length} / {objectives.length} Done
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">
                Auto-synced from truck whiteboard or click to toggle:
              </p>
              <div className="space-y-1.5">
                {objectives.map((obj) => (
                  <div
                    key={obj.id}
                    onClick={() =>
                      setObjectives((prev) =>
                        prev.map((o) => (o.id === obj.id ? { ...o, completed: !o.completed } : o))
                      )
                    }
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-black/40 border border-white/10 hover:border-slate-700 cursor-pointer select-none transition"
                  >
                    <span
                      className={`w-4 h-4 rounded-md flex items-center justify-center text-xs shrink-0 ${
                        obj.completed
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 border border-slate-700 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`text-xs ${
                        obj.completed ? 'line-through text-slate-400' : 'text-slate-200 font-medium'
                      }`}
                    >
                      {obj.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Photo 3-Star Guide inside Objectives card */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 bg-slate-950/60 rounded-xl p-2.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block mb-1 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> Photo Distance Guide (3-Star Rules)
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-mono">
                  <div className="bg-emerald-950/50 border border-emerald-500/30 rounded p-1 text-emerald-300">
                    <div className="font-bold">★★★ 3-Star</div>
                    <div className="text-[10px]">≤ 1.5m (Touch)</div>
                  </div>
                  <div className="bg-amber-950/50 border border-amber-500/30 rounded p-1 text-amber-300">
                    <div className="font-bold">★★☆ 2-Star</div>
                    <div className="text-[10px]">1.5m - 3.0m</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded p-1 text-slate-400">
                    <div className="font-bold">★☆☆ 1-Star</div>
                    <div className="text-[10px]">&gt; 3.0m</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Smart Advisor + 24 Ghost Cards */}
          <div className="col-span-8 flex flex-col gap-3.5 overflow-hidden">
            {/* Smart Investigation Advisor Banner */}
            <div className={`bg-gradient-to-r ${activeAccent.bannerGradient} rounded-2xl p-4 flex items-center justify-between shadow-lg`}>
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-xl ${activeAccent.activeBadgeClass} flex items-center justify-center ${activeAccent.lightTextClass} shrink-0`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${activeAccent.activeBadgeClass}`}>
                      {evaluation.advisor.badge}
                    </span>
                    <h3 className="text-sm font-bold text-white">
                      {evaluation.advisor.headline}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {evaluation.advisor.detail}
                  </p>
                </div>
              </div>
              <button
                onClick={stopFootstepPreview}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0"
              >
                Stop Audio Preview
              </button>
            </div>

            {/* Candidate Ghost Cards Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 gap-3 content-start">
              {evaluation.candidates.map(({ ghost, matchScore, posteriorPct, mimicWarning }) => (
                <div
                  key={ghost.name}
                  className={`rounded-2xl border p-4 transition flex flex-col justify-between ${
                    pinnedGhost === ghost.name
                      ? `${activeAccent.bannerBgClass} ${activeAccent.borderClass} shadow-lg ${activeAccent.glowClass}`
                      : `${activeTheme.cardBg} ${activeTheme.cardBorder} hover:border-white/20`
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            onClick={() =>
                              setPinnedGhost((p) =>
                                p === ghost.name ? null : ghost.name
                              )
                            }
                            className={`text-base font-bold text-white cursor-pointer hover:${activeAccent.lightTextClass}`}
                          >
                            {ghost.name}
                          </h3>
                          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {matchScore}% match
                          </span>
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${activeAccent.activeBadgeClass}`}>
                            {posteriorPct ?? matchScore}% likelihood
                          </span>
                          {mimicWarning && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 border border-purple-400">
                              FAKE ORB ALERT
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Hunt Sanity: <strong className="text-slate-200">{ghost.huntSanity}%</strong>{' '}
                          {ghost.specialSanityNote && `(${ghost.specialSanityNote})`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Footstep Audio Preview Button */}
                        <button
                          title={`Listen to ${ghost.name} footsteps (${ghost.baseSpeedMps} m/s)`}
                          onClick={() =>
                            playFootstepPreview(ghost.baseSpeedMps, speedMultiplier)
                          }
                          className={`p-1.5 rounded-lg bg-slate-800 ${activeAccent.lightTextClass} border border-slate-700 transition hover:opacity-80`}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        {/* Manual Cross-Out Button */}
                        <button
                          title="Manually cross out this ghost"
                          onClick={() =>
                            setManualExcludedGhosts((prev) => [...prev, ghost.name])
                          }
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/25 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Evidence Pills */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {ghost.evidences.map((ev) => {
                        const isConfirmed = evidenceStates[ev] === 'confirmed';
                        const isSuspected = evidenceStates[ev] === 'suspected';
                        const isForced = ghost.forcedEvidence === ev;
                        return (
                          <span
                            key={ev}
                            className={`text-[11px] px-2 py-0.5 rounded-md border ${
                              isConfirmed
                                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                                : isSuspected
                                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                                : 'bg-black/40 border-white/10 text-slate-300'
                            }`}
                          >
                            {ev} {isForced && '★'}
                          </span>
                        );
                      })}
                      {ghost.fakeEvidence && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md border bg-purple-950/60 border-purple-500/50 text-purple-200">
                          +{ghost.fakeEvidence} (Fake)
                        </span>
                      )}
                    </div>

                    {/* Speed Summary */}
                    <div className="text-[11px] bg-black/40 border border-white/10/80 rounded-lg px-2.5 py-1.5 mb-2 text-sky-200 flex items-center justify-between">
                      <span>
                        <strong className="text-slate-400">Speed:</strong> {ghost.speedSummary}
                      </span>
                      {ghost.altSpeedsMps.length > 1 && (
                        <button
                          onClick={() =>
                            playFootstepPreview(
                              ghost.altSpeedsMps[ghost.altSpeedsMps.length - 1],
                              speedMultiplier
                            )
                          }
                          className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/35 shrink-0 ml-2"
                        >
                          Hear Alt ({ghost.altSpeedsMps[ghost.altSpeedsMps.length - 1]} m/s)
                        </button>
                      )}
                    </div>

                    {/* 0-Evidence / Behavioral Tells */}
                    <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                      {ghost.zeroEvidenceTests.map((t, idx) => (
                        <li key={idx} className="leading-snug">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}

              {/* Ruled-Out Ghosts Section */}
              {evaluation.eliminated.length > 0 && (
                <div className="col-span-2 mt-2 bg-slate-900/50 border border-slate-800/70 rounded-2xl p-3">
                  <div className="text-xs font-semibold text-slate-400 mb-2">
                    Ruled Out Ghosts ({evaluation.eliminated.length}) — Click to restore if manually excluded
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {evaluation.eliminated.map(({ ghost, reasons }) => (
                      <button
                        key={ghost.name}
                        title={reasons.join(', ')}
                        onClick={() =>
                          setManualExcludedGhosts((prev) =>
                            prev.filter((n) => n !== ghost.name)
                          )
                        }
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-500 line-through hover:text-slate-300"
                      >
                        {ghost.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: INTERACTIVE FLOORPLAN MAPS
         ===================================================================== */}
      {activeTab === 'maps' && (
        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
          <div className={`col-span-4 rounded-2xl p-4 flex flex-col gap-4 overflow-y-auto border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Select Contract Map
              </h2>
              <div className="flex flex-col gap-1.5">
                {PHASMO_MAPS.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => {
                      setSelectedMapName(m.name);
                      setSelectedFloor(m.floors[0]);
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                      selectedMapName === m.name
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {m.size}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <img src="./assets/FuseboxIcon.png" alt="Fusebox" className="w-3.5 h-3.5 object-contain" />
                  Fuse Box Capacity
                </span>
                <span className="text-emerald-400 font-mono font-bold">Max {currentMap.maxLights || 9} Lights</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Turning on the {(currentMap.maxLights || 9) + 1}th light will automatically trip the house breaker.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" /> Possible Fusebox Spawns
              </h2>
              <div className="space-y-1.5">
                {(currentMap.fuseboxSpawns || []).map((fb, idx) => (
                  <div
                    key={idx}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      {fb.floor}
                    </div>
                    <div className="text-slate-400 text-[11px]">{fb.location}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Cursed Possession Spawns
              </h2>
              <div className="space-y-1.5">
                {currentMap.cursedSpawns.map((c) => (
                  <div
                    key={c.item}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-purple-300">{c.item}</div>
                    <div className="text-slate-400 text-[11px]">{c.location}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`col-span-8 rounded-2xl p-4 flex flex-col overflow-hidden border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">{currentMap.name}</h2>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 ${activeAccent.lightTextClass} border border-slate-700`}>
                    Trip Capacity: {currentMap.maxLights || 9} Lights
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Click any room to mark it as the active Ghost Room on your Mini-HUD
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {currentMap.floors.map((fl) => (
                  <button
                    key={fl}
                    onClick={() => setSelectedFloor(fl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      selectedFloor === fl
                        ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold`
                        : 'bg-black/40 border-white/10 text-slate-300'
                    }`}
                  >
                    {fl}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG Floorplan Blueprint */}
            <div className="flex-1 relative bg-black/40 border border-white/10 rounded-2xl overflow-hidden p-4">
              <div className="relative w-full h-full">
                {currentMap.rooms
                  .filter((r) => r.floor === selectedFloor)
                  .map((room) => {
                    const isGhostRoom = markedGhostRoom === room.name;
                    return (
                      <div
                        key={room.id}
                        onClick={() =>
                          setMarkedGhostRoom((prev) =>
                            prev === room.name ? null : room.name
                          )
                        }
                        style={{
                          left: `${room.x}%`,
                          top: `${room.y}%`,
                          width: `${room.w}%`,
                          height: `${room.h}%`,
                        }}
                        className={`absolute rounded-xl border-2 p-2.5 cursor-pointer transition flex flex-col justify-between ${
                          isGhostRoom
                            ? `${activeAccent.bannerBgClass} ${activeAccent.borderClass} shadow-lg ${activeAccent.glowClass}`
                            : 'bg-slate-900/80 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-bold text-white leading-tight">
                            {room.name}
                          </span>
                          {isGhostRoom && (
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${activeAccent.bgClass} text-slate-950`}>
                              GHOST ROOM
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {room.hasBreaker && (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/50 text-emerald-200">
                              <img src="./assets/FuseboxIcon.png" alt="Breaker" className="w-3 h-3 object-contain" />
                              Breaker
                            </span>
                          )}
                          {room.cursedItem && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/25 border border-purple-400/50 text-purple-200">
                              🔮 {room.cursedItem}
                            </span>
                          )}
                          {room.loopSpot && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 text-amber-200">
                              🔄 Loop Spot
                            </span>
                          )}
                          {room.hidingSpot && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200">
                              🚪 Hide Spot
                            </span>
                          )}
                          {room.lightCount !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">
                              💡 {room.lightCount} {room.lightCount === 1 ? 'light' : 'lights'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB: MATCH ANALYTICS & RECENT RECAPS (SQLite)
         ===================================================================== */}
      {activeTab === 'history' && (
        <AnalyticsView
          summary={analyticsSummary}
          onRefresh={handleRefreshHistory}
          onSaveMatch={handleSaveMatch}
          currentMatchState={{
            selectedMap: selectedMapName,
            difficulty: difficultyPreset,
            evidenceCount: evidenceCountSetting,
            predictedGhost: pinnedGhost || (evaluation.candidates[0]?.ghost.name ?? ''),
            activeDurationSec: Math.floor((Date.now() - matchStartTime) / 1000),
            currentSanity,
            huntCount: huntHistory.length,
            maxSpeed: Math.max(1.7, ...(huntHistory.map((h) => h.maxMps || 1.7))),
            objectives,
          }}
        />
      )}

      {/* =====================================================================
          TAB 3: CV & AUDIO CALIBRATION + SIMULATION STUDIO
         ===================================================================== */}
      {activeTab === 'calibration' && (
        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
          {/* Left: Live Vision Feed & Audio Equalizer */}
          <div className="col-span-6 flex flex-col gap-4 overflow-y-auto pr-1">
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-sky-400" /> Live Screen Capture & OCR Preview
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleVisionProcessing}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition flex items-center gap-1 ${
                      visionEngineEnabled
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 hover:bg-sky-500/30'
                        : 'bg-amber-500/20 border-amber-400 text-amber-300 hover:bg-amber-500/30'
                    }`}
                  >
                    {visionEngineEnabled ? (
                      <>
                        <Eye className="w-3 h-3 text-sky-400" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3 text-amber-400" />
                        <span>Paused (Manual)</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-emerald-300 font-mono">
                    {wsConnected ? 'Connected' : 'Reconnecting...'}
                  </span>
                </div>
              </div>
              <div className="aspect-video w-full rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center relative">
                {!visionEngineEnabled && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-1.5 p-4 text-center z-10">
                    <EyeOff className="w-7 h-7 text-amber-400 animate-pulse" />
                    <div className="text-xs font-bold text-amber-200">Screen Monitoring Paused (Manual Mode)</div>
                    <div className="text-[10px] text-slate-400 max-w-xs">
                      Screen processing is off to optimize laptop battery, CPU usage, and game frame rate.
                    </div>
                    <button
                      onClick={toggleVisionProcessing}
                      className="mt-1 px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px]"
                    >
                      Resume Screen Capture ({hotkeys.toggle_vision || 'Alt+V'})
                    </button>
                  </div>
                )}
                {previewB64 ? (
                  <img
                    src={previewB64}
                    alt="Live CV Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-500">
                    {visionEngineEnabled
                      ? 'Waiting for screen capture or simulation frame...'
                      : 'Screen capture paused'}
                  </span>
                )}
              </div>
            </div>

            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" /> Audio DSP Spectrum & Engine
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleAudioProcessing}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition flex items-center gap-1 ${
                      audioEngineEnabled
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 border-rose-400 text-rose-300 hover:bg-rose-500/30 animate-pulse'
                    }`}
                  >
                    {audioEngineEnabled ? (
                      <>
                        <Volume2 className="w-3 h-3 text-emerald-400" />
                        <span>Tracking ON</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3 h-3 text-rose-400" />
                        <span>MUTED</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                    {audioTelemetry.device}
                  </span>
                </div>
              </div>
              <div className="h-24 bg-black/40 border border-white/10 rounded-xl p-3 flex items-end gap-1.5">
                {audioTelemetry.spectrum.map((val, idx) => (
                  <div key={idx} className="flex-1 h-full flex items-end">
                    <div
                      style={{ height: `${Math.max(8, Math.round(val * 100))}%` }}
                      className={`w-full rounded-t transition-all duration-150 ${
                        audioTelemetry.voice_rejected
                          ? 'bg-amber-400'
                          : idx < 4
                          ? 'bg-sky-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                <span>Low Impact (Wood 25–240Hz)</span>
                <span>Mid Body (Concrete 240–750Hz)</span>
                <span>High Grit (Gravel 750–2.2kHz)</span>
              </div>

              {/* Multi-Band Surface & Stereo Panning Telemetry */}
              <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-black/40 border border-white/10/80 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Detected Surface Band</span>
                    {audioTelemetry.flash_active && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-bold animate-pulse">
                        TRANSIENT HIT
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Footprints className="w-4 h-4 text-emerald-400" />
                    <span className="font-mono font-bold capitalize text-slate-100">
                      {audioTelemetry.last_onset_band || 'Awaiting Footstep'}
                    </span>
                  </div>
                </div>

                <div className="bg-black/40 border border-white/10/80 rounded-xl p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Stereo Spatial Direction</span>
                    <span className="font-mono text-slate-400">
                      Pan: {typeof audioTelemetry.footstep_pan === 'number' ? audioTelemetry.footstep_pan.toFixed(2) : '0.00'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                        audioTelemetry.footstep_direction === 'LEFT'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : audioTelemetry.footstep_direction === 'RIGHT'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-slate-800/80 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {audioTelemetry.footstep_direction === 'LEFT'
                        ? '◀ LEFT'
                        : audioTelemetry.footstep_direction === 'RIGHT'
                        ? 'RIGHT ▶'
                        : '● CENTER'}
                    </span>
                    {audioTelemetry.player_moving && (
                      <span className="text-[10px] text-amber-400 font-semibold">
                        (WASD Active)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Simulation Deck & Live Event Log */}
          <div className="col-span-6 flex flex-col gap-4 overflow-y-auto pr-1">
            <div className={`rounded-2xl p-4 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-1">
                <Play className="w-4 h-4 text-sky-400" /> Built-In Detector Simulation Deck
              </h2>
              <p className="text-xs text-slate-400 mb-3">
                Test and verify any Computer Vision, OCR, or Audio DSP detector right now by injecting synthetic game frames and audio waveforms:
              </p>

              <div className="text-[11px] font-semibold text-sky-300 mb-1.5">
                Computer Vision & OCR Scenarios
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { id: 'emf_5_t3', label: 'Simulate Tier III EMF ParaMeter (Level 5)' },
                  { id: 'emf_5', label: 'Simulate Tier II EMF Level 5 LED' },
                  { id: 'spirit_box_t3', label: 'Simulate Tier III Spirit Box Response' },
                  { id: 'ghost_writing', label: 'Simulate Ghost Writing Book' },
                  { id: 'freezing_thermo', label: 'Simulate Digital Thermometer (-3.4°C)' },
                  { id: 'journal_sync', label: 'Simulate In-Game Journal Sync (OCR)' },
                  { id: 'truck_sanity', label: 'Simulate Truck Sanity (44% + Map)' },
                  { id: 'uv_handprint', label: 'Simulate UV Neon Green Handprint' },
                  { id: 'ghost_orb', label: 'Simulate Night Vision Ghost Orbs' },
                  { id: 'dots_silhouette', label: 'Simulate D.O.T.S Laser Silhouette' },
                  { id: 'truck_objectives', label: 'Simulate Truck Objectives OCR' },
                  { id: 'parabolic_mic', label: 'Simulate Parabolic Mic (2.4 reading)' },
                  { id: 'smudge_ignition', label: 'Simulate Smudge Ignition Flash' },
                  { id: 'crucifix_burned', label: 'Simulate Crucifix Burned Ember' },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => triggerSimulation(btn.id)}
                    className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-sky-500/20 border border-slate-800 hover:border-sky-400/50 text-xs text-left text-slate-200 transition"
                  >
                    ▶ {btn.label}
                  </button>
                ))}
              </div>

              <div className="text-[11px] font-semibold text-emerald-300 mb-1.5">
                Live Audio DSP & Footstep Scenarios
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'footsteps_normal', label: 'Simulate Standard Hunt (1.70 m/s)' },
                  { id: 'footsteps_fast', label: 'Simulate Fast Hunt (2.75 m/s)' },
                  { id: 'footsteps_slow', label: 'Simulate Slow Hunt (1.05 m/s)' },
                  { id: 'footsteps_los', label: 'Simulate LoS Acceleration Chase' },
                  { id: 'footsteps_gravel', label: 'Simulate Gravel / Snow (750–2200Hz)' },
                  { id: 'footsteps_concrete', label: 'Simulate Concrete / Linoleum (240–750Hz)' },
                  { id: 'footsteps_player_moving_panned', label: 'Simulate Moving Player + Panned Ghost' },
                  { id: 'footsteps_missed_step', label: 'Simulate Harmonic Missed-Step Recovery' },
                  { id: 'multiplayer_voice', label: 'Simulate 2nd Player Talking (Voice Filter)' },
                  { id: 'emf5_beep', label: 'Simulate EMF 5 Audio Tone (2850Hz)' },
                  { id: 'spirit_box_audio', label: 'Simulate Spirit Box Audio Response' },
                  { id: 'banshee_scream', label: 'Simulate Banshee Parabolic Scream' },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => triggerSimulation(btn.id)}
                    className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-400/50 text-xs text-left text-slate-200 transition"
                  >
                    🔊 {btn.label}
                  </button>
                ))}
              </div>

              {/* Authentic In-Game Audio Cue Library */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-[11px] font-semibold text-purple-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-purple-400" /> Authentic In-Game Audio Cue Library
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                    40 Audio Profiles
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'EMF Level 5 Tone', fn: playEmf5Tone, desc: 'Tier III High Frequency' },
                    { label: 'EMF Power On Beep', fn: playEmfPowerSound, desc: 'Hardware startup' },
                    { label: 'Spirit Box Radio Sweep', fn: playSpiritBoxSound, desc: 'Frequency scanning static' },
                    { label: 'Ghost Door Touch / Open', fn: playDoorGhostOpenSound, desc: 'Interaction audio' },
                  ].map((aud, idx) => (
                    <button
                      key={idx}
                      onClick={aud.fn}
                      className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-purple-500/20 border border-slate-800 hover:border-purple-400/50 text-xs text-left text-slate-200 transition flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-purple-200">{aud.label}</div>
                        <div className="text-[10px] text-slate-400">{aud.desc}</div>
                      </div>
                      <Volume2 className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-1.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detection Event Telemetry Log */}
            <div className={`flex-1 rounded-2xl p-4 flex flex-col overflow-hidden border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Real-Time CV & Audio Detection Log
              </h2>
              <div className="flex-1 overflow-y-auto space-y-1.5 text-xs font-mono">
                {eventLog.length === 0 ? (
                  <div className="text-slate-500 text-xs">
                    No detections yet — click any Simulation button above or open Phasmophobia!
                  </div>
                ) : (
                  eventLog.map((item, i) => (
                    <div
                      key={i}
                      className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-400">[{item.time}]</span>
                      <span className="text-slate-200 flex-1 truncate">{item.detail}</span>
                      <span className="text-emerald-400">{Math.round(item.conf * 100)}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: KEYBINDS, EQUIPMENT TIERS & OVERLAY SETTINGS
         ===================================================================== */}
      {activeTab === 'settings' && (
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-1">
          {/* Phase 5 Theme Engine & Customization Studio */}
          <ThemeSettingsView
            currentTheme={currentTheme}
            onSelectTheme={(t) => {
              setCurrentTheme(t);
              updateBackendConfig({ theme: t });
            }}
            currentAccent={currentAccent}
            onSelectAccent={(a) => {
              setCurrentAccent(a);
              updateBackendConfig({ accent_color: a });
            }}
            hudLayout={hudLayout}
            onSelectHudLayout={(l) => {
              setHudLayout(l);
              updateBackendConfig({ hud_layout: l });
            }}
            uiScale={uiScale}
            onChangeUiScale={(s) => {
              setUiScale(s);
              updateBackendConfig({ ui_scale: s });
            }}
            hudOpacity={hudOpacity}
            onChangeHudOpacity={(o) => {
              setHudOpacity(o);
              updateBackendConfig({ hud_opacity: o });
            }}
            crtScanlines={crtScanlines}
            onToggleCrtScanlines={(en) => {
              setCrtScanlines(en);
              updateBackendConfig({ crt_scanlines: en });
            }}
            uiSoundEnabled={uiSoundEnabled}
            onToggleUiSound={(en) => {
              setUiSoundEnabled(en);
              updateBackendConfig({ ui_sound: en });
            }}
            streamerMode={streamerMode}
            onToggleStreamerMode={(en) => {
              setStreamerMode(en);
              updateBackendConfig({ streamer_mode: en });
            }}
            chromaKeyEnabled={chromaKeyEnabled}
            onToggleChromaKey={(en) => {
              setChromaKeyEnabled(en);
              updateBackendConfig({ chroma_key: en });
            }}
          />

          <div className="grid grid-cols-12 gap-4">
            {/* Custom Global Hotkeys */}
            <div className={`col-span-6 rounded-2xl p-5 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
              <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <Keyboard className={`w-4 h-4 ${activeAccent.textClass}`} /> Global Hotkey Bindings
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Click any keybind button below and press your preferred key combination:
              </p>
              <div className="space-y-2.5">
                {[
                  { key: 'toggle_overlay', label: 'Swap Mini-HUD ↔ Discord-Style Full Overlay' },
                  { key: 'undo_detection', label: 'Undo Last Auto-Applied Detection' },
                  { key: 'toggle_smudge_timer', label: 'Start / Reset 180s Smudge Incense Timer' },
                  { key: 'toggle_objectives', label: 'Toggle In-Game Objectives Checklist' },
                  { key: 'toggle_hud_layout', label: 'Toggle Mini-HUD Vertical ↔ Slim Dock' },
                  { key: 'toggle_audio', label: 'Toggle Master Audio Processing & Recording' },
                  { key: 'toggle_vision', label: 'Toggle Screen Monitoring & CV (Manual Mode)' },
                  { key: 'tap_bpm', label: 'Manual Tap-Tempo Footstep Cadence' },
                  { key: 'reset_match', label: 'Reset Match / Clear All Evidence' },
                ].map((item) => {
                const isRec = recordingHotkeyFor === item.key;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-4 py-3"
                  >
                    <span className="text-xs font-medium text-slate-200">{item.label}</span>
                    <button
                      onClick={() =>
                        setRecordingHotkeyFor(isRec ? null : item.key)
                      }
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition ${
                        isRec
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200 animate-pulse'
                          : `bg-slate-800 border-slate-700 ${activeAccent.lightTextClass} hover:${activeAccent.borderClass}`
                      }`}
                    >
                      {isRec ? 'Press keys...' : hotkeys[item.key]}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Equipment Tiers, Temperature Unit & HUD Placement */}
          <div className={`col-span-6 rounded-2xl p-5 flex flex-col gap-5 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <Settings className={`w-4 h-4 ${activeAccent.textClass}`} /> Equipment Tiers & Units
              </h2>
              <p className="text-xs text-slate-400 mb-3">
                Select your active loadout tiers so the Computer Vision engine matches the exact visual & audio profile:
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'emf', label: 'EMF Reader' },
                  { id: 'thermometer', label: 'Thermometer' },
                  { id: 'spirit_box', label: 'Spirit Box' },
                  { id: 'uv', label: 'UV Light' },
                  { id: 'dots', label: 'D.O.T.S Projector' },
                  { id: 'video_cam', label: 'Video Camera' },
                ].map((eq) => (
                  <div
                    key={eq.id}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between"
                  >
                    <span className="text-xs font-medium text-slate-200">{eq.label}</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3].map((tierNum) => (
                        <button
                          key={tierNum}
                          onClick={() => {
                            const next = { ...equipmentTiers, [eq.id]: tierNum };
                            setEquipmentTiers(next);
                            updateBackendConfig({ equipment_tiers: next });
                          }}
                          className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            equipmentTiers[eq.id] === tierNum
                              ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold`
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          T{tierNum}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Thermometer Units
                </div>
                <div className="flex gap-2">
                  {(['C', 'F'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => {
                        setTemperatureUnit(u);
                        updateBackendConfig({ temperature_unit: u });
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                        temperatureUnit === u
                          ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold`
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      °{u} ({u === 'C' ? 'Celsius' : 'Fahrenheit'})
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Ghost Speed Multiplier
                </div>
                <div className="flex gap-1">
                  {[0.5, 0.75, 1.0, 1.25, 1.5].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setSpeedMultiplier(m);
                        updateBackendConfig({
                          difficulty: { ghost_speed_multiplier: m },
                        });
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border ${
                        speedMultiplier === m
                          ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold`
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {Math.round(m * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-3">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Click-Through Mini-HUD Corner Placement
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    'top-right',
                    'top-left',
                    'bottom-right',
                    'bottom-left',
                  ] as const
                ).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => {
                      setHudPosition(pos);
                      updateBackendConfig({ hud_position: pos });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold border capitalize ${
                      hudPosition === pos
                        ? `${activeAccent.bgClass} text-slate-950 ${activeAccent.borderClass} font-bold`
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {pos.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Screen Monitoring, Computer Vision & Performance Mode */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-3">
              {/* Master Vision Engine Toggle */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    {visionEngineEnabled ? (
                      <Eye className="w-4 h-4 text-sky-400" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-amber-400" />
                    )}
                    <span>Master Screen Monitoring & Computer Vision</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Controls DirectX screen capture, optical OCR, and equipment/environmental CV
                  </span>
                </div>
                <button
                  onClick={toggleVisionProcessing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                    visionEngineEnabled
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200 hover:bg-sky-500/30'
                      : 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30'
                  }`}
                >
                  {visionEngineEnabled ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-sky-400" />
                      <span>ENABLED (CV Active)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>PAUSED (Manual Logger)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Performance Mode / Capture FPS Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Screen Capture Performance Mode & Frame Rate
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Active: {captureFps} FPS (Hunts boost to 12 FPS)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { fps: 4, label: 'Eco / Laptop', desc: '4 FPS • Minimal CPU & battery drain' },
                    { fps: 8, label: 'Balanced', desc: '8 FPS • Smooth detection (Recommended)' },
                    { fps: 12, label: 'High Performance', desc: '12 FPS • Instant visual response' },
                  ].map((preset) => (
                    <button
                      key={preset.fps}
                      onClick={() => {
                        setCaptureFps(preset.fps);
                        updateBackendConfig({ capture_fps: preset.fps });
                      }}
                      className={`p-2 rounded-lg border text-left transition ${
                        captureFps === preset.fps
                          ? `${activeAccent.bgClass} text-slate-950 font-bold ${activeAccent.borderClass}`
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold">{preset.label}</div>
                      <div className={`text-[10px] ${captureFps === preset.fps ? 'text-slate-900 opacity-80' : 'text-slate-400'}`}>
                        {preset.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Audio DSP & Footstep Detection Settings */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-3">
              {/* Master Audio Engine Toggle */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    {audioEngineEnabled ? (
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    )}
                    <span>Master Audio Capture & DSP Engine</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Controls WASAPI loopback, per-process audio capture, and all ghost acoustic detectors
                  </span>
                </div>
                <button
                  onClick={toggleAudioProcessing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                    audioEngineEnabled
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30 animate-pulse'
                  }`}
                >
                  {audioEngineEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ENABLED (Recording Active)</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                      <span>MUTED (Capture Off)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Audio Engine & Multi-Band Surface Sensitivity</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                  Wood • Concrete • Gravel
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Surface Transient Sensitivity:</span>
                  <div className="flex gap-1.5">
                    {(['quiet', 'default', 'aggressive'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setAudioSensitivity(s);
                          updateBackendConfig({ audio_sensitivity: s });
                        }}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold border capitalize ${
                          audioSensitivity === s
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {audioSensitivity === 'quiet'
                      ? 'Boosts gains for muffled distant footsteps'
                      : audioSensitivity === 'aggressive'
                      ? 'Tighter thresholds for stormy / high-ambient maps'
                      : 'Standard thresholds for all 14 Phasmophobia maps'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Stereo Spatial Center-Rejection:</span>
                  <button
                    onClick={() => {
                      const next = !stereoMovingFilter;
                      setStereoMovingFilter(next);
                      updateBackendConfig({
                        detectors_enabled: { ignore_player_wasd_steps: next },
                      });
                    }}
                    className={`w-full py-1 px-2.5 rounded-lg text-[11px] font-bold border text-left flex items-center justify-between ${
                      stereoMovingFilter
                        ? `${activeAccent.activeBadgeClass} ${activeAccent.borderClass}`
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>{stereoMovingFilter ? 'Filter Center When Moving' : 'Track All Angles'}</span>
                    <span className="text-[10px] opacity-75">
                      {stereoMovingFilter ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Rejects player footsteps (|Pan| &lt; 0.14) while moving, but tracks panned ghost steps!
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Official Game Mechanics & Formulas Reference */}
          <div className={`col-span-12 rounded-2xl p-5 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Brain className={`w-5 h-5 ${activeAccent.textClass}`} />
                <div>
                  <h2 className="text-sm font-bold text-white">Official Game Mechanics & Formulas Reference</h2>
                  <p className="text-xs text-slate-400">Authentic in-game formulas, hunt thresholds, and ghost behavior mechanics</p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-purple-300">
                24 Ghost Types • Tiers I–III • 14 Maps Supported
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs">
              {/* Hunt Thresholds */}
              <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
                <div className={`font-bold ${activeAccent.lightTextClass} flex items-center gap-1.5 pb-1 border-b border-slate-800`}>
                  <ShieldCheck className="w-3.5 h-3.5" /> Hunt Sanity Thresholds
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="font-semibold text-rose-300">Demon</span>
                    <span className="font-mono text-rose-400">70% (or special at any %)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-amber-300">Yokai</span>
                    <span className="font-mono text-amber-400">80% (when talking near ghost)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-amber-300">Raiju</span>
                    <span className="font-mono text-amber-400">65% (near active electronics)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-yellow-300">Mare</span>
                    <span className="font-mono text-yellow-400">60% (Dark) / 40% (Lit room)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-yellow-300">Onryo</span>
                    <span className="font-mono text-yellow-400">60% (Every 3rd flame blown)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-200">Standard (17 ghosts)</span>
                    <span className="font-mono text-slate-400">50% Average Sanity</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-emerald-300">Deogen</span>
                    <span className="font-mono text-emerald-400">40% Average Sanity</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-emerald-300">Shade</span>
                    <span className="font-mono text-emerald-400">35% (Never in same room)</span>
                  </div>
                </div>
              </div>

              {/* Special Speed Profiles */}
              <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                  <Activity className="w-3.5 h-3.5" /> Hunt Speed Profiles
                </div>
                <div className="space-y-1.5 text-slate-300 text-[11px]">
                  <div>
                    <span className="font-semibold text-emerald-200">Standard: </span>
                    <span className="text-slate-400">1.70 m/s base → accelerates to 2.81 m/s with LoS</span>
                  </div>
                  <div>
                    <span className="font-semibold text-rose-300">Revenant: </span>
                    <span className="text-slate-400">1.00 m/s search → 3.00 m/s instant burst on LoS</span>
                  </div>
                  <div>
                    <span className="font-semibold text-sky-300">Deogen: </span>
                    <span className="text-slate-400">3.00 m/s far away → 0.40 m/s crawl within 2.5m</span>
                  </div>
                  <div>
                    <span className="font-semibold text-purple-300">Moroi: </span>
                    <span className="text-slate-400">1.50 m/s (50% sanity) → 2.25 m/s (0% sanity)</span>
                  </div>
                  <div>
                    <span className="font-semibold text-cyan-300">Hantu: </span>
                    <span className="text-slate-400">1.4 m/s (&gt;15°C) → 2.7 m/s (&lt;0°C) (No LoS accel)</span>
                  </div>
                  <div>
                    <span className="font-semibold text-amber-300">Thaye: </span>
                    <span className="text-slate-400">2.75 m/s (young) → 1.00 m/s (old, loses speed over time)</span>
                  </div>
                </div>
              </div>

              {/* Environment & Sanity Formulas */}
              <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-purple-300 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                  <Zap className="w-3.5 h-3.5" /> Environment & Sanity Formulas
                </div>
                <div className="space-y-2 text-[11px] text-slate-300">
                  <div>
                    <div className="font-semibold text-slate-200">Passive Sanity Drain:</div>
                    <div className="font-mono text-purple-300 text-[10px] bg-slate-900 px-1.5 py-0.5 rounded mt-0.5">
                      Rate = Base × Diff × (LightsOn ? 0.0 : 1.0) × (MoroiCursed ? 2.0 : 1.0)
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">Fuse Box Room Warming / Cooling:</div>
                    <div className="text-slate-400">
                      Breaker ON warms rooms to ~20°C (Freezing stays &lt;0°C in ghost room). Breaker OFF drops all rooms to ambient (5–8°C).
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">Incense Hunt Lockout:</div>
                    <div className="text-slate-400">
                      Standard: 90s • Demon: 60s • Spirit: 180s (3 minutes)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Post-Update "What's New" Changelog Modal */}
      {pendingChangelog && (
        <ChangelogModal
          version={appVersion}
          changelog={pendingChangelog}
          onClose={handleDismissChangelog}
        />
      )}
    </div>
  );
}
