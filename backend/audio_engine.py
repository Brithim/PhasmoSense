import collections
import ctypes
import math
import threading
import time
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

import numpy as np

try:
    import pyaudiowpatch as pyaudio
except ImportError:
    pyaudio = None

try:
    import psutil
except ImportError:
    psutil = None

try:
    import proctap
except ImportError:
    proctap = None


# Phasmophobia base standard ghost speed: 1.70 m/s corresponds to ~115 BPM
BASE_STANDARD_BPM = 115.0
BASE_STANDARD_MPS = 1.70

# Virtual-Key codes for player movement (W, A, S, D + Arrow keys)
MOVEMENT_VK_CODES = (0x57, 0x41, 0x53, 0x44, 0x25, 0x26, 0x27, 0x28)
_user32 = ctypes.windll.user32 if hasattr(ctypes, "windll") else None


class AudioEngine:
    def __init__(self, config_manager: Any) -> None:
        self.config_manager = config_manager
        self.sample_rate: int = 44100
        self.chunk_size: int = 2048
        self.hop_size: int = 512
        self.running: bool = False
        self._thread: Optional[threading.Thread] = None

        # Cached FFT window & spectral frequency band slices
        self._cached_sample_rate: int = 0
        self._cached_fft_size: int = 0
        self._cached_hanning: Optional[np.ndarray] = None
        self._cached_slices: Dict[str, Tuple[int, int]] = {}
        self._cached_geom_bands: List[Tuple[int, int]] = []

        # Multi-band energy & spectral flux state
        self.prev_band_energies: Dict[str, float] = {"low": 0.0, "mid": 0.0, "high": 0.0}
        self.band_noise_history: Dict[str, Deque[float]] = {
            "low": collections.deque(maxlen=32),
            "mid": collections.deque(maxlen=32),
            "high": collections.deque(maxlen=32),
        }

        # Visual correlation flags (shared from VisionEngine via Server)
        self.last_visual_flicker_ts: float = 0.0
        self.visual_camera_moving: bool = False

        # Footstep onset tracking
        self.onset_times: Deque[float] = collections.deque(maxlen=32)
        self.bpm_history: Deque[Tuple[float, float]] = collections.deque(maxlen=24)
        self.last_onset_time: float = 0.0
        self.last_player_move_time: float = 0.0
        self.prev_low_rms: float = 0.0
        self.low_rms_history: Deque[float] = collections.deque(maxlen=24)

        # Live telemetry state for UI
        self.current_bpm: float = 0.0
        self.current_mps: float = 0.0
        self.los_accelerating: bool = False
        self.voice_rejected: bool = False
        self.player_moving: bool = False
        self.hunt_active: bool = False
        self.hunt_start_time: float = 0.0
        self.last_hunt_ambient_time: float = 0.0
        self.steps_before_flicker_streak: int = 0
        self.spirit_box_audio_streak: int = 0
        self.emf_t3_pulse_times: Deque[float] = collections.deque(maxlen=16)
        self.footstep_pan: float = 0.0
        self.footstep_direction: str = "CENTER"
        self.last_onset_band: str = "wood"
        self.last_onset_flash_ts: float = 0.0
        self.hunt_speeds: List[float] = []
        self.spectrum_bars: List[float] = [0.0] * 16
        self.device_name: str = "Initializing..."
        self.sensitivity: str = "default"  # quiet, default, aggressive
        self.audio_muted: bool = False
        self.telemetry: Dict[str, Any] = {"audio_muted": False}

        self.cooldowns: Dict[str, float] = {}
        self.pending_events: Deque[Dict[str, Any]] = collections.deque(maxlen=50)

    def _ensure_spectral_cache(self, n: int, sr: int) -> None:
        if self._cached_fft_size == n and self._cached_sample_rate == sr:
            return
        self._cached_fft_size = n
        self._cached_sample_rate = sr
        self._cached_hanning = np.hanning(n).astype(np.float32)
        df = sr / float(n)

        def b_idx(f_low: float, f_high: float) -> Tuple[int, int]:
            i0 = max(0, int(round(f_low / df)))
            i1 = max(i0 + 1, min(n // 2 + 1, int(round(f_high / df)) + 1))
            return (i0, i1)

        self._cached_slices = {
            "voice_formant": b_idx(280, 1280),
            "emf_tone": b_idx(2550, 3150),
            "radio_high": b_idx(2100, 4800),
            "breath_low": b_idx(160, 620),
            "breath_hiss": b_idx(1200, 2800),
            "speech_bass": b_idx(30, 240),
            "emf_t3": b_idx(2200, 3500),
            "hunt_vocal": b_idx(180, 900),
            "hunt_static": b_idx(3400, 6500),
            "heartbeat": b_idx(38, 68),
            "banshee_band": b_idx(1050, 2450),
            "mask_low": b_idx(25, 240),
            "mask_mid": b_idx(240, 750),
            "mask_high": b_idx(750, 2200),
            "flicker": b_idx(1500, 4800),
        }

        band_edges = np.geomspace(50, min(12000, sr // 2 - 100), 17)
        self._cached_geom_bands = [
            (
                max(0, int(round(band_edges[i] / df))),
                max(1, min(n // 2 + 1, int(round(band_edges[i + 1] / df)) + 1)),
            )
            for i in range(16)
        ]

    def _can_emit(self, key: str, cooldown_sec: float = 5.0) -> bool:
        now = time.time()
        if now - self.cooldowns.get(key, 0.0) >= cooldown_sec:
            self.cooldowns[key] = now
            return True
        return False

    def _check_player_movement_keys(self) -> bool:
        """Checks if W/A/S/D or Arrow keys are currently held down on Windows
        (with a 420ms tail after key release so the final footstep ring-out is ignored)."""
        if not self.config_manager.config.get("detectors_enabled", {}).get(
            "ignore_player_wasd_steps", True
        ):
            self.player_moving = False
            return False

        now = time.time()
        if _user32 is not None:
            try:
                for vk in MOVEMENT_VK_CODES:
                    if _user32.GetAsyncKeyState(vk) & 0x8000:
                        self.last_player_move_time = now
                        self.player_moving = True
                        return True
            except Exception:
                pass

        if self.visual_camera_moving:
            self.last_player_move_time = now
            self.player_moving = True
            return True

        if (now - self.last_player_move_time) < 0.42:
            self.player_moving = True
            return True

        self.player_moving = False
        return False

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._audio_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self.running = False

    def pop_events(self) -> List[Dict[str, Any]]:
        evts = list(self.pending_events)
        self.pending_events.clear()
        return evts

    def get_telemetry(self) -> Dict[str, Any]:
        now = time.time()
        self._check_player_movement_keys()

        # Decay BPM display if no footsteps for > 4.5s
        if now - self.last_onset_time > 4.5 and self.current_bpm > 0:
            if self.hunt_active:
                self.hunt_active = False
                hunt_duration = round(now - self.hunt_start_time, 1)
                speeds = self.hunt_speeds or [self.current_mps]
                self.pending_events.append(
                    {
                        "type": "hunt_ended",
                        "source": "audio_dsp",
                        "duration_sec": hunt_duration,
                        "last_footstep_ts": round(self.last_onset_time, 3),
                        "first_mps": round(float(speeds[0]), 2),
                        "min_mps": round(float(min(speeds)), 2),
                        "max_mps": round(float(max(speeds)), 2),
                        "avg_mps": round(float(np.mean(speeds)), 2),
                        "los_accelerating": self.los_accelerating,
                        "confidence": 0.90,
                        "detail": f"Hunt footsteps ceased (Duration: {hunt_duration}s, Speed: {min(speeds):.2f}–{max(speeds):.2f} m/s). Starting 25s Hunt Cooldown timer.",
                    }
                )
                self.hunt_speeds.clear()
            self.current_bpm = 0.0
            self.current_mps = 0.0
            self.los_accelerating = False
            self.footstep_pan = 0.0
            self.footstep_direction = "CENTER"

        is_moving = self.player_moving or self.visual_camera_moving
        is_audio_muted = not self.config_manager.config.get("detectors_enabled", {}).get("audio_engine_enabled", True)
        self.audio_muted = is_audio_muted
        self.telemetry["audio_muted"] = is_audio_muted
        dev = f"{self.device_name} [MUTED / OFF]" if is_audio_muted else self.device_name
        self.telemetry["device_name"] = dev
        phasmo_only = self.config_manager.config.get("detectors_enabled", {}).get("phasmophobia_audio_only", True)
        is_isolated = ("Phasmophobia.exe" in self.device_name) and ("Isolated" in self.device_name)
        return {
            "bpm": round(self.current_bpm, 1),
            "mps": round(self.current_mps, 2),
            "los_accelerating": self.los_accelerating,
            "footstep_pan": round(self.footstep_pan, 2),
            "footstep_direction": self.footstep_direction,
            "voice_rejected": self.voice_rejected,
            "player_moving": is_moving,
            "hunt_active": self.hunt_active,
            "spectrum": [round(x, 3) for x in self.spectrum_bars],
            "device": dev,
            "last_onset_ts": round(self.last_onset_time, 3),
            "last_onset_band": self.last_onset_band,
            "flash_active": (now - self.last_onset_flash_ts) < 0.28,
            "audio_muted": is_audio_muted,
            "audio_isolated": is_isolated,
            "phasmophobia_audio_only": phasmo_only,
        }

    def _find_phasmo_pid(self) -> Optional[int]:
        # 1. Fast-path: Win32 FindWindowW to check if Phasmophobia game window exists
        if _user32 is not None:
            try:
                hwnd = _user32.FindWindowW(None, "Phasmophobia")
                if hwnd:
                    pid = ctypes.c_ulong()
                    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    if pid.value > 0:
                        if psutil is None or psutil.pid_exists(pid.value):
                            return int(pid.value)
            except Exception:
                pass

        # 2. Process enumeration via psutil
        if psutil is not None:
            try:
                for p in psutil.process_iter(["pid", "name"]):
                    try:
                        name = str(p.info.get("name") or "").lower()
                        if "phasmophobia" in name:
                            return int(p.info["pid"])
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            except Exception:
                pass
        return None

    def _audio_loop(self) -> None:
        while self.running:
            cfg = self.config_manager.config
            detectors = cfg.get("detectors_enabled", {})
            audio_enabled = detectors.get("audio_engine_enabled", True)
            phasmo_only = detectors.get("phasmophobia_audio_only", True)

            # Master switch: if audio engine is disabled, sleep in quiet state
            if not audio_enabled:
                self.device_name = "Audio Engine [MUTED / OFF]"
                self.spectrum_bars = [0.0] * 16
                self.current_bpm = 0.0
                self.current_mps = 0.0
                time.sleep(0.3)
                continue

            # 1. Attempt Dedicated Per-Process Audio Capture for Phasmophobia.exe
            phasmo_pid = self._find_phasmo_pid()
            if proctap is not None and phasmo_pid is not None:
                tap = None
                try:
                    print(f"[AudioEngine] Attaching isolated WASAPI process tap to Phasmophobia.exe (PID {phasmo_pid})...")
                    tap = proctap.ProcessAudioCapture(phasmo_pid)
                    tap.start()
                    self.sample_rate = 48000
                    self.device_name = f"Phasmophobia.exe (PID {phasmo_pid}) Isolated"

                    while self.running:
                        current_detectors = self.config_manager.config.get("detectors_enabled", {})
                        if not current_detectors.get("audio_engine_enabled", True):
                            self.device_name = f"Phasmophobia.exe (PID {phasmo_pid}) [MUTED / OFF]"
                            self.spectrum_bars = [0.0] * 16
                            time.sleep(0.15)
                            continue

                        chunk_bytes = tap.read(timeout=0.25)
                        if chunk_bytes is not None and len(chunk_bytes) >= 128:
                            # proctap returns standard 48kHz, 2-channel, float32 [-1.0..1.0]
                            stereo = np.frombuffer(chunk_bytes, dtype=np.float32).reshape((-1, 2))
                            mono = np.mean(stereo, axis=1)
                            self.analyze_samples(mono, self.sample_rate, stereo_samples=stereo)
                        else:
                            # Decay spectrum bars when game is quiet / tabbed out
                            self.spectrum_bars = [max(0.0, x * 0.82) for x in self.spectrum_bars]
                            if psutil is not None and not psutil.pid_exists(phasmo_pid):
                                print(f"[AudioEngine] Phasmophobia.exe (PID {phasmo_pid}) has closed.")
                                break
                            time.sleep(0.02)
                except Exception as exc:
                    print(f"[AudioEngine] ProcessAudioCapture error: {exc}")
                finally:
                    if tap is not None:
                        try:
                            tap.stop()
                            tap.close()
                        except Exception:
                            pass
                    tap = None

                if not self.running:
                    break

            # 2. If Phasmophobia Audio Only is enabled, do NOT fallback to system audio (YouTube, Discord, etc.)
            if phasmo_only:
                self.device_name = "Audio Standby: Awaiting Phasmophobia.exe..."
                self.spectrum_bars = [0.0] * 16
                self.current_bpm = 0.0
                self.current_mps = 0.0
                time.sleep(0.5)
                continue

            # 3. System-Wide WASAPI Loopback Fallback (ONLY if user explicitly disabled phasmophobia_audio_only)
            if pyaudio is None:
                self.device_name = "Audio Standby (pyaudio unavailable)"
                time.sleep(1.0)
                continue

            p = None
            stream = None
            try:
                p = pyaudio.PyAudio()
                wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
                default_speakers = p.get_device_info_by_index(
                    wasapi_info["defaultOutputDevice"]
                )

                loopback_device = default_speakers
                if not default_speakers.get("isLoopbackDevice", False):
                    for loopback in p.get_loopback_device_info_generator():
                        if default_speakers["name"] in loopback["name"]:
                            loopback_device = loopback
                            break

                self.sample_rate = int(loopback_device.get("defaultSampleRate", 44100))
                channels = max(1, int(loopback_device.get("maxInputChannels", 2)))
                self.device_name = f"{loopback_device.get('name', 'WASAPI Loopback')} (Fallback)"

                stream = p.open(
                    format=pyaudio.paInt16,
                    channels=channels,
                    rate=self.sample_rate,
                    frames_per_buffer=self.chunk_size,
                    input=True,
                    input_device_index=loopback_device["index"],
                )

                last_pid_check = time.time()
                while self.running:
                    current_detectors = self.config_manager.config.get("detectors_enabled", {})
                    if not current_detectors.get("audio_engine_enabled", True):
                        self.device_name = "WASAPI Loopback [MUTED / OFF]"
                        self.spectrum_bars = [0.0] * 16
                        time.sleep(0.15)
                        continue
                    if current_detectors.get("phasmophobia_audio_only", True):
                        break  # Hot-swap back to strict process isolation

                    raw = stream.read(self.chunk_size, exception_on_overflow=False)
                    samples = (
                        np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                    )
                    stereo_samples = None
                    if channels > 1:
                        reshaped = samples.reshape(-1, channels)
                        if channels >= 2:
                            stereo_samples = reshaped[:, :2]
                        samples = reshaped.mean(axis=1)
                    self.analyze_samples(samples, self.sample_rate, stereo_samples=stereo_samples)

                    # Periodically check if Phasmophobia launched to hot-swap to isolated capture
                    now = time.time()
                    if now - last_pid_check >= 2.0:
                        last_pid_check = now
                        if self._find_phasmo_pid() is not None:
                            break  # Switch to dedicated per-process capture!
            except Exception as exc:
                self.device_name = f"Audio Standby ({type(exc).__name__})"
                time.sleep(1.5)
            finally:
                if stream is not None:
                    try:
                        stream.stop_stream()
                        stream.close()
                    except Exception:
                        pass
                if p is not None:
                    try:
                        p.terminate()
                    except Exception:
                        pass

    def analyze_samples(
        self,
        samples: np.ndarray,
        sample_rate: int = 44100,
        is_simulation: bool = False,
        stereo_samples: Optional[np.ndarray] = None,
    ) -> List[Dict[str, Any]]:
        """Processes a mono float32 audio buffer (-1.0..1.0) and optional stereo channels."""
        events: List[Dict[str, Any]] = []
        if samples.size < 256:
            return events

        cfg = self.config_manager.config
        enabled = cfg.get("detectors_enabled", {})
        if not is_simulation and not enabled.get("audio_engine_enabled", True):
            self.spectrum_bars = [0.0] * 16
            self.audio_muted = True
            self.telemetry = {
                "bpm": 0,
                "mps": 0.0,
                "is_hunt_speed": False,
                "device_name": "Audio Engine: OFF (Muted)",
                "spectral_flux": 0.0,
                "voice_rejected": False,
                "player_moving": False,
                "flash_active": False,
                "footstep_direction": None,
                "audio_muted": True,
            }
            return events

        self.audio_muted = False
        self.telemetry["audio_muted"] = False

        speed_mult = float(
            cfg.get("difficulty", {}).get("ghost_speed_multiplier", 1.0)
        )
        self.sensitivity = str(cfg.get("audio_sensitivity", "default")).lower()

        # Compute Hanning-windowed FFT spectrum with cached window and geometric visualizer bands
        self._ensure_spectral_cache(samples.size, sample_rate)
        slices = self._cached_slices
        windowed = samples * self._cached_hanning
        fft_complex = np.fft.rfft(windowed)
        spec = np.abs(fft_complex)

        # Vectorized BLAS dot product for 5x faster zero-allocation RMS computation
        rms = float(np.sqrt(np.dot(samples, samples) / float(samples.size)))
        peak = float(np.max(np.abs(samples)) + 1e-9)
        crest_factor = peak / (rms + 1e-9)

        # Update 16-bar equalizer visualizer using precomputed geometric band slices
        bars: List[float] = []
        for i0, i1 in self._cached_geom_bands:
            band_slice = spec[i0:i1]
            val = float(np.mean(band_slice)) if band_slice.size > 0 else 0.0
            bars.append(min(1.0, val * 0.18))
        self.spectrum_bars = bars

        is_moving = False if is_simulation else (self._check_player_movement_keys() or self.visual_camera_moving)

        if rms < 0.0010:
            self.voice_rejected = False
            self.prev_low_rms = 0.0
            self.prev_band_energies = {
                k: v * 0.15 for k, v in self.prev_band_energies.items()
            }
            for k in ("low", "mid", "high"):
                self.band_noise_history[k].append(1e-4)
            return events

        total_energy = float(np.sum(spec) + 1e-9)
        s_voice = slices["voice_formant"]
        s_emf = slices["emf_tone"]
        voice_energy = float(np.sum(spec[s_voice[0] : s_voice[1]]))
        emf_energy = float(np.sum(spec[s_emf[0] : s_emf[1]]))
        voice_ratio = voice_energy / total_energy

        # 1. Multiplayer Human Speech Formant Detection & Spirit Box Audio Gate
        s_radio = slices["radio_high"]
        s_breath_l = slices["breath_low"]
        s_breath_h = slices["breath_hiss"]
        s_bass = slices["speech_bass"]

        radio_high_ratio = float(np.sum(spec[s_radio[0] : s_radio[1]])) / total_energy
        breath_low_ratio = float(np.sum(spec[s_breath_l[0] : s_breath_l[1]])) / total_energy
        breath_hiss_ratio = float(np.sum(spec[s_breath_h[0] : s_breath_h[1]])) / total_energy
        speech_bass_ratio = float(np.sum(spec[s_bass[0] : s_bass[1]])) / total_energy

        is_voice_chat = (
            enabled.get("voice_isolation", True)
            and voice_ratio > 0.64
            and speech_bass_ratio < 0.18
            and crest_factor < 3.6
        )

        # 1b. Spirit Box Audio Response
        # Rejects player footsteps & movement scuffs:
        # Footstep impacts produce transient spikes (high crest factor >= 3.5), whereas real
        # Spirit Box ghost responses are sustained phonemic speech formants + radio carrier (crest factor < 3.5).
        # Furthermore, require consecutive frame streak (>= 3 frames while walking, >= 2 frames while stationary)
        # so single-frame clicks/scuffs on tile, wood, gravel, or concrete never falsely trigger.
        is_sb_spectral_match = (
            enabled.get("audio_equipment", True)
            and voice_ratio > 0.38
            and radio_high_ratio > 0.20
            and speech_bass_ratio < 0.15
            and rms > 0.025
            and crest_factor < 3.5
        )

        if is_sb_spectral_match:
            self.spirit_box_audio_streak += 1
        else:
            self.spirit_box_audio_streak = 0

        req_sb_streak = 1 if is_simulation else (3 if is_moving else 2)
        if is_sb_spectral_match and self.spirit_box_audio_streak >= req_sb_streak:
            is_voice_chat = False
            if is_simulation or self._can_emit("spirit_box_audio", 8.0):
                evt = {
                    "type": "evidence",
                    "source": "spirit_box_audio_dsp",
                    "evidence": "Spirit Box",
                    "state": "confirmed" if is_simulation else "suspected",
                    "confidence": 0.87 if is_simulation else 0.80,
                    "detail": "Spirit Box radio-modulated vocal response detected",
                }
                events.append(evt)
                self.pending_events.append(evt)

        self.voice_rejected = is_voice_chat
        if is_voice_chat and is_simulation and self._can_emit("voice_rejected_sim", 2.0):
            evt = {
                "type": "voice_isolated",
                "source": "audio_dsp",
                "confidence": 0.96,
                "detail": "Multiplayer human voice chat detected & filtered out (0 false triggers).",
            }
            events.append(evt)
            self.pending_events.append(evt)

        # 2. EMF Level 5 Audio Tone Detector
        if enabled.get("audio_equipment", True) and not is_voice_chat:
            s_emf_t3 = slices["emf_t3"]
            emf_t3_energy = float(np.sum(spec[s_emf_t3[0] : s_emf_t3[1]]))
            t3_pulsed_emitted = False
            if (emf_t3_energy / total_energy) > 0.42 and rms > 0.012 and samples.size >= 64:
                win_len = samples.size // 8
                sub_rms = np.array(
                    [
                        float(np.sqrt(np.dot(samples[i * win_len : (i + 1) * win_len], samples[i * win_len : (i + 1) * win_len]) / float(win_len)))
                        for i in range(8)
                    ],
                    dtype=np.float32,
                )
                sub_min = float(np.min(sub_rms))
                sub_max = float(np.max(sub_rms))
                if (sub_max / (sub_min + 1e-6)) >= 2.2:
                    mid_env = 0.5 * (sub_max + sub_min)
                    above = sub_rms >= mid_env
                    transitions = int(np.sum(above[1:] != above[:-1]))
                    if transitions >= 3:
                        t3_pulsed_emitted = True
                        self.emf_t3_pulse_times.append(time.time())
                        if is_simulation or self._can_emit("emf5_audio", 7.0):
                            evt = {
                                "type": "evidence",
                                "source": "emf5_t3_audio_dsp",
                                "evidence": "EMF Level 5",
                                "state": "confirmed",
                                "confidence": 0.89,
                                "detail": "Tier 3 EMF ParaMeter pulsed Level 5 alarm detected",
                            }
                            events.append(evt)
                            self.pending_events.append(evt)

            emf_peak = (
                float(np.max(spec[s_emf[0] : s_emf[1]]))
                if s_emf[1] > s_emf[0]
                else 0.0
            )
            spec_median = float(np.median(spec) + 1e-6)
            if (
                not t3_pulsed_emitted
                and emf_energy / total_energy > 0.48
                and (emf_peak / spec_median) > 18.0
                and rms > 0.012
            ):
                if is_simulation or self._can_emit("emf5_audio", 7.0):
                    evt = {
                        "type": "evidence",
                        "source": "emf5_audio_dsp",
                        "evidence": "EMF Level 5",
                        "state": "confirmed",
                        "confidence": 0.88,
                        "detail": "EMF Level 5 high-frequency harmonic audio tone detected",
                    }
                    events.append(evt)
                    self.pending_events.append(evt)

        # 3. Unique Ghost Audio Signatures & Hunt Ambient Coincidence Tracking
        if not is_voice_chat and rms >= 0.008:
            s_hv = slices["hunt_vocal"]
            s_hs = slices["hunt_static"]
            s_hb = slices["heartbeat"]
            vocal_ratio = float(np.sum(spec[s_hv[0] : s_hv[1]])) / total_energy
            static_ratio = float(np.sum(spec[s_hs[0] : s_hs[1]])) / total_energy
            heartbeat_ratio = float(np.sum(spec[s_hb[0] : s_hb[1]])) / total_energy
            if (vocal_ratio >= 0.28 and static_ratio >= 0.06) or heartbeat_ratio >= 0.30:
                self.last_hunt_ambient_time = time.time()

        if enabled.get("audio_ghost_signatures", True) and not is_voice_chat:
            s_ban = slices["banshee_band"]
            banshee_ratio = float(np.sum(spec[s_ban[0] : s_ban[1]])) / total_energy
            if banshee_ratio > 0.72 and rms > 0.08 and crest_factor < 2.5:
                if is_simulation or self._can_emit("banshee_scream", 12.0):
                    evt = {
                        "type": "ghost_behavior",
                        "source": "parabolic_audio_dsp",
                        "ghost": "Banshee",
                        "behavior_id": "banshee_scream",
                        "confidence": 0.91,
                        "detail": "Parabolic Mic Banshee wail signature detected!",
                    }
                    events.append(evt)
                    self.pending_events.append(evt)

            if (
                breath_low_ratio > 0.50
                and 0.16 <= breath_hiss_ratio <= 0.42
                and rms > 0.035
                and crest_factor < 2.9
            ):
                if is_simulation or self._can_emit("deogen_breath", 12.0):
                    evt = {
                        "type": "ghost_behavior",
                        "source": "spirit_box_audio_dsp",
                        "ghost": "Deogen",
                        "behavior_id": "deogen_breath",
                        "confidence": 0.89,
                        "detail": "Deogen heavy bull-breathing signature detected on Spirit Box!",
                    }
                    events.append(evt)
                    self.pending_events.append(evt)

        # ---------------------------------------------------------------------
        # 4. MULTI-BAND SPECTRAL FLUX & STEREO TRANSIENT FOOTSTEP DETECTOR
        # ---------------------------------------------------------------------
        if enabled.get("audio_footsteps", True) and not is_voice_chat:
            # 3 Complementary Surface Bands:
            # Band 1: Low Impact (Wood / Floorboards / Hollow attic) 25Hz - 240Hz
            # Band 2: Mid Body (Concrete / Linoleum / Asphalt / Tile) 240Hz - 750Hz
            # Band 3: High Grit (Gravel / Snow / Grass / Shoe sole click) 750Hz - 2200Hz
            s_low = slices["mask_low"]
            s_mid = slices["mask_mid"]
            s_high = slices["mask_high"]

            e_low = float(np.sum(spec[s_low[0] : s_low[1]]))
            e_mid = float(np.sum(spec[s_mid[0] : s_mid[1]]))
            e_high = float(np.sum(spec[s_high[0] : s_high[1]]))

            # Rolling median noise floors per band
            hist_low = self.band_noise_history["low"]
            hist_mid = self.band_noise_history["mid"]
            hist_high = self.band_noise_history["high"]

            base_low = float(np.median(hist_low)) if len(hist_low) >= 4 else max(1e-4, e_low * 0.7)
            base_mid = float(np.median(hist_mid)) if len(hist_mid) >= 4 else max(1e-4, e_mid * 0.7)
            base_high = float(np.median(hist_high)) if len(hist_high) >= 4 else max(1e-4, e_high * 0.7)

            hist_low.append(e_low)
            hist_mid.append(e_mid)
            hist_high.append(e_high)

            # Spectral flux (half-wave rectified energy rise)
            flux_low = max(0.0, e_low - self.prev_band_energies["low"])
            flux_mid = max(0.0, e_mid - self.prev_band_energies["mid"])
            flux_high = max(0.0, e_high - self.prev_band_energies["high"])
            self.prev_band_energies = {"low": e_low, "mid": e_mid, "high": e_high}

            gain_low = e_low / max(1e-4, base_low)
            gain_mid = e_mid / max(1e-4, base_mid)
            gain_high = e_high / max(1e-4, base_high)

            sens_scale = 0.85 if self.sensitivity == "quiet" else (1.20 if self.sensitivity == "aggressive" else 1.0)

            # Footstep Noise Floor Gate:
            # Real Phasmophobia footsteps have an absolute RMS of at least 0.009 and peak >= 0.020.
            # Ambient house drone, ventilation hum, weather/rain, and lobby music sit between 0.0015 and 0.0055 RMS.
            min_footstep_rms = 0.0075 if self.sensitivity == "quiet" else (0.0120 if self.sensitivity == "aggressive" else 0.0088)
            min_footstep_peak = 0.0170 if self.sensitivity == "quiet" else (0.0250 if self.sensitivity == "aggressive" else 0.0200)

            is_above_ambient_noise = (rms >= min_footstep_rms) and (peak >= min_footstep_peak)

            # Surface transient conditions
            transient_low = (
                is_above_ambient_noise
                and gain_low >= (1.45 * sens_scale)
                and flux_low >= (0.60 * sens_scale)
                and (flux_low / total_energy) >= 0.16
                and (e_low / total_energy) >= 0.22
                and crest_factor >= 2.1
            )
            transient_mid = (
                is_above_ambient_noise
                and gain_mid >= (1.48 * sens_scale)
                and flux_mid >= (0.60 * sens_scale)
                and (flux_mid / total_energy) >= 0.18
                and (e_mid / total_energy) >= 0.20
                and crest_factor >= 2.2
            )
            transient_high = (
                is_above_ambient_noise
                and gain_high >= (1.52 * sens_scale)
                and flux_high >= (0.60 * sens_scale)
                and (flux_high / total_energy) >= 0.20
                and (e_high / total_energy) >= 0.18
                and crest_factor >= 2.1
            )

            dominant_surface: Optional[str] = None
            if transient_low:
                dominant_surface = "wood"
            elif transient_mid:
                dominant_surface = "concrete"
            elif transient_high:
                dominant_surface = "gravel"

            if dominant_surface is not None:
                self.spirit_box_audio_streak = 0

            # Stereo Panning Calculation
            pan = 0.0
            if (
                stereo_samples is not None
                and stereo_samples.ndim == 2
                and stereo_samples.shape[0] == samples.size
                and stereo_samples.shape[1] >= 2
            ):
                left_ch = stereo_samples[:, 0]
                right_ch = stereo_samples[:, 1]
                rms_l = float(np.sqrt(np.dot(left_ch, left_ch) / float(left_ch.size)))
                rms_r = float(np.sqrt(np.dot(right_ch, right_ch) / float(right_ch.size)))
                pan = (rms_r - rms_l) / (rms_r + rms_l + 1e-9)
                self.footstep_pan = pan
                self.footstep_direction = (
                    "LEFT" if pan <= -0.14 else ("RIGHT" if pan >= 0.14 else "CENTER")
                )

            # STEREO CENTER-REJECTION FILTER WHILE PLAYER IS MOVING:
            # When the player is walking/sprinting, their own footsteps are centered (|pan| < 0.14).
            # If the player is moving, suppress center footsteps, but ALLOW off-center ghost steps (|pan| >= 0.14)!
            if is_moving:
                if abs(pan) < 0.14:
                    dominant_surface = None  # Discard player's own center footstep!

            now = time.time()
            time_since_last = now - self.last_onset_time

            # Refractory period: minimum 140ms between footsteps
            if dominant_surface is not None and time_since_last >= 0.14:
                self.last_onset_band = dominant_surface
                self.last_onset_flash_ts = now

                # Emit instant footstep flash telemetry event
                flash_evt = {
                    "type": "footstep_onset",
                    "source": "audio_dsp",
                    "surface": dominant_surface,
                    "pan": round(pan, 2),
                    "direction": self.footstep_direction,
                    "timestamp": round(now, 3),
                }
                events.append(flash_evt)
                self.pending_events.append(flash_evt)

                self.RegisterFootstepOnset(
                    now, speed_mult, events, is_simulation=is_simulation
                )

            # Myling quiet check: audible footsteps with zero high-frequency flicker noise
            if not is_voice_chat:
                s_flk = slices["flicker"]
                flicker_ratio = float(np.sum(spec[s_flk[0] : s_flk[1]])) / total_energy
                low_ratio = e_low / total_energy
                if (
                    len(self.onset_times) >= 4
                    and rms >= 0.005
                    and low_ratio >= 0.58
                    and flicker_ratio <= 0.06
                ):
                    self.steps_before_flicker_streak += 1
                    if is_simulation or (
                        self.steps_before_flicker_streak >= 3
                        and self._can_emit("steps_before_flicker_audio", 20.0)
                    ):
                        myling_evt = {
                            "type": "ghost_behavior",
                            "source": "myling_audio_dsp",
                            "behavior_id": "steps_before_flicker",
                            "confidence": 0.86,
                            "detail": "Audible hunt footsteps with zero electronic flicker interference (rules out Myling)",
                        }
                        events.append(myling_evt)
                        self.pending_events.append(myling_evt)
                elif flicker_ratio > 0.15:
                    self.steps_before_flicker_streak = 0

        return events

    def RegisterFootstepOnset(
        self,
        timestamp: float,
        speed_mult: float = 1.0,
        out_events: Optional[List[Dict[str, Any]]] = None,
        is_simulation: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Harmonic rhythm tracker: handles dropped/missed steps and smooth LoS acceleration."""
        # Reset sequence if silence > 2.8s
        if self.onset_times and (timestamp - self.onset_times[-1]) > 2.8:
            self.onset_times.clear()
            self.bpm_history.clear()
            self.hunt_speeds.clear()

        self.onset_times.append(timestamp)
        self.last_onset_time = timestamp

        if len(self.onset_times) < 4:
            return None

        times = list(self.onset_times)
        raw_iois = list(np.diff(times[-12:]))
        valid_iois: List[float] = [dt for dt in raw_iois if 0.14 <= dt <= 2.2]
        if len(valid_iois) < 3:
            return None

        # Base candidate cadence interval
        base_t = float(np.median(valid_iois))

        # HARMONIC MISSED-STEP INTERPOLATION:
        # If an interval is approximately 2 * base_t (1.65x .. 2.35x), 1 footstep was dropped/muffled!
        # Subdivide it so standard deviation doesn't blow up and discard the hunt.
        harmonic_iois: List[float] = []
        for dt in valid_iois:
            if 1.65 * base_t <= dt <= 2.35 * base_t:
                harmonic_iois.append(dt * 0.5)
                harmonic_iois.append(dt * 0.5)
            else:
                harmonic_iois.append(dt)

        iois_arr = np.array(harmonic_iois)
        median_ioi = float(np.median(iois_arr))
        std_ioi = float(np.std(iois_arr))
        jitter_cv = std_ioi / max(0.05, median_ioi)

        # Detect smooth LoS acceleration (intervals steadily shrinking by >= 12% across sequence)
        is_los_ramping = False
        if len(harmonic_iois) >= 5:
            first_half = float(np.mean(harmonic_iois[: len(harmonic_iois) // 2]))
            last_half = float(np.mean(harmonic_iois[len(harmonic_iois) // 2 :]))
            if (first_half - last_half) >= (0.12 * first_half) and first_half > last_half:
                is_los_ramping = True
                self.los_accelerating = True
                # Use recent intervals for instantaneous chase speed
                median_ioi = float(np.median(harmonic_iois[-4:]))

        # Allow higher jitter tolerance during active LoS acceleration
        max_jitter = 0.38 if is_los_ramping else 0.28
        if jitter_cv > max_jitter:
            return None

        raw_bpm = 60.0 / median_ioi
        normalized_bpm = raw_bpm / max(0.5, speed_mult)
        estimated_mps = (normalized_bpm / BASE_STANDARD_BPM) * BASE_STANDARD_MPS

        self.current_bpm = raw_bpm
        self.current_mps = estimated_mps
        self.bpm_history.append((timestamp, estimated_mps))
        self.hunt_speeds.append(estimated_mps)
        if len(self.hunt_speeds) > 60:
            self.hunt_speeds = self.hunt_speeds[-60:]

        # VISUAL & AMBIENT COINCIDENCE TRIGGER:
        # If visual electronic flicker is active (lights/flashlight flickering on screen),
        # or hunt ambient audio is present, auto-trigger hunt at 5 steps!
        visual_flicker_recent = (
            self.last_visual_flicker_ts > 0.0
            and (timestamp - self.last_visual_flicker_ts) <= 4.0
        )
        hunt_ambient_recent = is_simulation or visual_flicker_recent or (
            self.last_hunt_ambient_time > 0.0
            and (timestamp - self.last_hunt_ambient_time) <= 3.5
        )

        can_start_hunt = (
            len(self.onset_times) >= 5
            if hunt_ambient_recent
            else (len(self.onset_times) >= 7 and len(harmonic_iois) >= 6 and jitter_cv <= 0.20)
        )

        if not self.hunt_active and can_start_hunt:
            self.hunt_active = True
            self.hunt_start_time = self.onset_times[0]
            hunt_evt = {
                "type": "hunt_started",
                "source": "audio_dsp",
                "bpm": round(self.current_bpm, 1),
                "mps": round(self.current_mps, 2),
                "first_footstep_ts": round(self.hunt_start_time, 3),
                "confidence": 0.94 if visual_flicker_recent else 0.90,
                "detail": f"Hunt footsteps detected ({self.current_mps:.2f} m/s | {self.current_bpm:.0f} BPM). Starting Hunt Timer.",
            }
            self.pending_events.append(hunt_evt)
            if out_events is not None:
                out_events.append(hunt_evt)

        if self._can_emit("footstep_speed_update", 1.8):
            speeds = self.hunt_speeds or [self.current_mps]
            speed_evt = {
                "type": "footstep_speed",
                "source": "audio_dsp",
                "bpm": round(self.current_bpm, 1),
                "mps": round(self.current_mps, 2),
                "first_mps": round(float(speeds[0]), 2),
                "min_mps": round(float(min(speeds)), 2),
                "max_mps": round(float(max(speeds)), 2),
                "footstep_pan": round(self.footstep_pan, 2),
                "footstep_direction": self.footstep_direction,
                "los_accelerating": self.los_accelerating,
                "confidence": 0.90 if visual_flicker_recent else 0.88,
                "detail": f"Footstep cadence: {self.current_mps:.2f} m/s ({self.current_bpm:.0f} BPM)",
            }
            self.pending_events.append(speed_evt)
            if out_events is not None:
                out_events.append(speed_evt)
            return speed_evt
        return None
