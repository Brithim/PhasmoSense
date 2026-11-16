let audioCtx: AudioContext | null = null;
let stopTimer: number | null = null;

export function playFootstepPreview(speedMps: number, multiplier: number = 1.0, durationSec: number = 3.2): void {
  stopFootstepPreview();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // 1.70 m/s = 115 BPM
  const bpm = (speedMps / 1.7) * 115.0 * multiplier;
  const intervalSec = Math.max(0.14, 60.0 / bpm);
  const now = audioCtx.currentTime;
  const steps = Math.min(28, Math.floor(durationSec / intervalSec));

  for (let i = 0; i < steps; i++) {
    const t = now + i * intervalSec;
    triggerSingleStep(audioCtx, t, i % 2 === 0);
  }

  stopTimer = window.setTimeout(() => {
    stopTimer = null;
  }, durationSec * 1000);
}

export function stopFootstepPreview(): void {
  if (stopTimer !== null) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

function triggerSingleStep(ctx: AudioContext, startTime: number, isLeftFoot: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  const startFreq = isLeftFoot ? 132 : 124;
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(42, startTime + 0.065);

  gain.gain.setValueAtTime(0.45, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.075);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + 0.08);
}

// -------------------------------------------------------------
// AUTHENTIC GAME AUDIO CUES & SOUND LIBRARY
// -------------------------------------------------------------
const audioCache = new Map<string, HTMLAudioElement>();

export function playAuthenticClip(filename: string, volume: number = 0.6): void {
  try {
    const path = `./audio/${filename}`;
    let audio = audioCache.get(path);
    if (!audio) {
      audio = new Audio(path);
      audioCache.set(path, audio);
    }
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  } catch (err) {
    console.warn('[AudioSynth] Failed to play authentic clip:', filename, err);
  }
}

export function playEmf5Tone(): void {
  playAuthenticClip('EMF_T3_3.wav', 0.65);
}

export function playEmfPowerSound(): void {
  playAuthenticClip('EMF_T2_On.wav', 0.5);
}

export function playSpiritBoxSound(): void {
  playAuthenticClip('Spirit box 3 drop 2.wav', 0.6);
}

export function playDoorGhostOpenSound(): void {
  playAuthenticClip('GenericWoodenDoor_DoorGhostOpen_01.wav', 0.7);
}

// -------------------------------------------------------------
// PROCEDURAL THEME UI SOUND EFFECTS (WEB AUDIO API)
// -------------------------------------------------------------
function getAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function playPaperRustleSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufSize = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.Q.setValueAtTime(2.2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

export function playInkStampSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playRelayClickSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Mechanical dual-pulse snap
  [0, 0.024].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(delay === 0 ? 820 : 640, now + delay);
    osc.frequency.exponentialRampToValueAtTime(120, now + delay + 0.015);

    gain.gain.setValueAtTime(0.12, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.018);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.022);
  });
}

export function playTerminalBeepSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2350, now);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

export function playThemeUiSound(themeId: string, action: 'click' | 'toggle' | 'confirm' = 'click'): void {
  try {
    if (themeId === 'journal') {
      if (action === 'confirm') playInkStampSound();
      else playPaperRustleSound();
    } else if (themeId === 'crt') {
      if (action === 'confirm') playTerminalBeepSound();
      else playRelayClickSound();
    } else {
      // Modern / OLED: subtle high-frequency blip
      playTerminalBeepSound();
    }
  } catch (_) {}
}
