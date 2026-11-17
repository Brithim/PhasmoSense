import base64
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import mss
except ImportError:
    mss = None

try:
    import dxcam
except ImportError:
    dxcam = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None


EVIDENCE_KEYWORDS = {
    "emf5": "EMF Level 5",
    "emflevel5": "EMF Level 5",
    "ultraviolet": "Ultraviolet",
    "fingerprints": "Ultraviolet",
    "ghostwriting": "Ghost Writing",
    "freezing": "Freezing Temperatures",
    "freezingtemperatures": "Freezing Temperatures",
    "dots": "D.O.T.S Projector",
    "projector": "D.O.T.S Projector",
    "ghostorb": "Ghost Orb",
    "ghostorbs": "Ghost Orb",
    "spiritbox": "Spirit Box",
}

MAP_KEYWORDS = {
    "tanglewood": "6 Tanglewood Drive",
    "edgefield": "42 Edgefield Road",
    "ridgeview": "10 Ridgeview Court",
    "grafton": "Grafton Farmhouse",
    "willow": "13 Willow Street",
    "bleasdale": "Bleasdale Farmhouse",
    "brownstone": "Brownstone High School",
    "highschool": "Brownstone High School",
    "maplelodge": "Maple Lodge Campsite",
    "woodwind": "Camp Woodwind",
    "prison": "Prison",
    "sunnymeadowsrestricted": "Sunny Meadows (Restricted)",
    "sunnymeadows": "Sunny Meadows Mental Institution",
    "pointhope": "Point Hope",
    "nellsdiner": "Nell's Diner",
    "diner": "Nell's Diner",
}

DIFFICULTY_EVIDENCE = {
    "amateur": 3,
    "intermediate": 3,
    "professional": 3,
    "nightmare": 2,
    "insanity": 1,
    "apocalypse": 0,
}


class VisionEngine:
    def __init__(self, config_manager: Any) -> None:
        self.config_manager = config_manager
        self.ocr = RapidOCR() if RapidOCR is not None else None
        self.prev_dots_gray: Optional[np.ndarray] = None
        self.orb_tracks: List[Tuple[float, float, float]] = []  # (x, y, timestamp)
        self.last_ocr_time: float = 0.0
        self.last_frame_b64: Optional[str] = None
        self.last_detections: List[Dict[str, Any]] = []
        self.cooldowns: Dict[str, float] = {}
        self.in_lobby_or_menu: bool = False
        self.in_journal: bool = False
        self.freezing_streak: int = 0
        self.uv_streak: int = 0
        self.spirit_box_streak: int = 0
        self.writing_streak: int = 0
        self.crucifix_burn_streak: int = 0
        self.last_truck_seen_ts: float = 0.0
        self.hunt_blink_samples: List[Tuple[float, bool]] = []
        self.cold_non_freezing_count: int = 0
        self.first_cold_non_freezing_ts: float = 0.0
        self._cold_checked_this_frame: bool = False
        self.prev_frame_gray: Optional[np.ndarray] = None
        self.last_flicker_ts: float = 0.0
        self.camera_moving: bool = False
        self.prev_mean_lum: float = 0.0
        self.preview_enabled: bool = False
        self.last_preview_time: float = 0.0

        # High-performance DXGI Desktop Duplication & persistent GDI context
        self.dx_camera: Any = None
        self.dx_camera_monitor_idx: int = -1
        self.dx_camera_failed: bool = False
        self.sct: Any = None
        if mss is not None:
            try:
                self.sct = mss.mss()
            except Exception:
                pass

    def _can_emit(self, key: str, cooldown_sec: float = 4.0) -> bool:
        now = time.time()
        if now - self.cooldowns.get(key, 0.0) >= cooldown_sec:
            self.cooldowns[key] = now
            return True
        return False

    def capture_screen(self) -> Optional[np.ndarray]:
        cfg = self.config_manager.config
        mon_idx = int(cfg.get("monitor_index", 1))

        # Reset failed flag if user selected a different display monitor
        if self.dx_camera_monitor_idx != mon_idx:
            self.dx_camera_failed = False

        # 1. DXGI Desktop Duplication API (DirectX 11 GPU Texture Share - sub-millisecond)
        if dxcam is not None and not self.dx_camera_failed:
            try:
                if self.dx_camera is None or self.dx_camera_monitor_idx != mon_idx:
                    out_idx = max(0, mon_idx - 1)
                    self.dx_camera = dxcam.create(output_idx=out_idx, output_color="BGR")
                    self.dx_camera_monitor_idx = mon_idx

                if self.dx_camera is not None:
                    frame = self.dx_camera.grab()
                    if frame is not None and frame.size > 0:
                        return frame
            except Exception:
                self.dx_camera = None
                self.dx_camera_failed = True

        # 2. Optimized Zero-Copy GDI Fallback (Persistent HDC context)
        if self.sct is None and mss is not None:
            try:
                self.sct = mss.mss()
            except Exception:
                pass

        if self.sct is not None:
            try:
                monitors = self.sct.monitors
                if mon_idx >= len(monitors):
                    mon_idx = 1 if len(monitors) > 1 else 0
                raw = self.sct.grab(monitors[mon_idx])
                # Direct memory view into GDI BGRA buffer (zero intermediate Python heap copies)
                bgra = np.frombuffer(raw.raw, dtype=np.uint8).reshape((raw.height, raw.width, 4))
                return np.ascontiguousarray(bgra[:, :, :3])
            except Exception:
                return None

        return None

    def _crop_roi(
        self, frame: np.ndarray, roi_name: str, anchor_16_9: bool = True
    ) -> np.ndarray:
        """Crops a normalized ROI. When anchor_16_9=True on Ultrawide (21:9 / 32:9) monitors,
        maps horizontal coordinates to the central 16:9 pillar where Unity anchors viewmodels & UI."""
        h, w = frame.shape[:2]
        roi = self.config_manager.config["rois"].get(
            roi_name, {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
        )
        aspect = w / float(max(h, 1))
        if anchor_16_9 and aspect > 1.85:
            # Central 16:9 pillar width and left offset on 21:9 (3440x1440) or 32:9 monitors
            pillar_w = h * (16.0 / 9.0)
            pad_left = (w - pillar_w) * 0.5
            x1 = max(0, min(w - 1, int(pad_left + roi["x"] * pillar_w)))
            x2 = max(x1 + 1, min(w, int(pad_left + (roi["x"] + roi["w"]) * pillar_w)))
        else:
            x1 = max(0, min(w - 1, int(roi["x"] * w)))
            x2 = max(x1 + 1, min(w, int((roi["x"] + roi["w"]) * w)))

        y1 = max(0, min(h - 1, int(roi["y"] * h)))
        y2 = max(y1 + 1, min(h, int((roi["y"] + roi["h"]) * h)))
        return frame[y1:y2, x1:x2]

    def encode_preview(self, frame: np.ndarray, max_width: int = 480) -> str:
        h, w = frame.shape[:2]
        if w > max_width:
            scale = max_width / float(w)
            frame = cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_LINEAR)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        if not ok:
            return ""
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")

    def process_frame(
        self,
        frame: np.ndarray,
        force_ocr: bool = False,
        is_simulation: bool = False,
        hunt_active: bool = False,
    ) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        self._cold_checked_this_frame = False
        cfg = self.config_manager.config
        enabled = cfg.get("detectors_enabled", {})
        if not is_simulation and not enabled.get("vision_engine_enabled", True):
            return events

        tiers = cfg.get("equipment_tiers", {})
        temp_unit = cfg.get("temperature_unit", "C")

        # Normalize high-res / Ultrawide frames (e.g. 3440x1440 -> 1720x720) to canonical 720p vertical height
        # so contour areas, LED pixel spacing, and OCR font heights are invariant across 1080p, 1440p, 4K, and 21:9/32:9!
        orig_h, orig_w = frame.shape[:2]
        if orig_h != 720 and orig_h > 0:
            norm_w = int(round(orig_w * (720.0 / float(orig_h))))
            frame = cv2.resize(frame, (norm_w, 720), interpolation=cv2.INTER_LINEAR)

        now = time.time()
        # Keep lightweight preview for Calibration Studio or simulation
        # Throttle preview encoding to at most 2 FPS (~0.5s) to save ~35% CPU during gameplay
        if is_simulation or self.preview_enabled:
            if is_simulation or (now - self.last_preview_time >= 0.5):
                self.last_preview_time = now
                self.last_frame_b64 = self.encode_preview(frame)

        # Optical flow motion & luminance flicker tracking for AudioEngine correlation
        mean_lum = 0.0
        try:
            small_gray = cv2.cvtColor(
                cv2.resize(frame, (160, 90), interpolation=cv2.INTER_LINEAR),
                cv2.COLOR_BGR2GRAY,
            )
            mean_lum = float(np.mean(small_gray))
            if self.prev_frame_gray is not None:
                lum_delta = abs(mean_lum - self.prev_mean_lum)
                # Rapid ambient or electronic/flashlight flicker (delta >= 14.0)
                if lum_delta >= 14.0:
                    self.last_flicker_ts = time.time()
                # Frame difference for camera / player motion
                diff = cv2.absdiff(small_gray, self.prev_frame_gray)
                mean_diff = float(np.mean(diff))
                self.camera_moving = (mean_diff >= 3.8)
            self.prev_frame_gray = small_gray
            self.prev_mean_lum = mean_lum
        except Exception:
            pass

        # In live gameplay:
        # a) NEVER run OCR during an active hunt (saves 100% OCR CPU so hunt blink CV and footstep audio DSP remain ultra-responsive)
        # b) Skip full-frame OCR inference if the scene is pitch black (no UI/truck/journal/LCD visible)
        # c) Use a relaxed 2.2s OCR interval during normal gameplay
        has_text_lum = is_simulation or force_ocr or (mean_lum >= 8.0 or (self.prev_frame_gray is not None and np.max(self.prev_frame_gray) >= 45))
        run_ocr = (not hunt_active or is_simulation or force_ocr) and (force_ocr or is_simulation or (now - self.last_ocr_time >= 2.2)) and has_text_lum

        # 1. OCR Pipeline: Journal, Truck Sanity, Map/Difficulty, & Digital Thermometer
        if run_ocr and self.ocr is not None:
            self.last_ocr_time = now
            events.extend(
                self._analyze_ocr(frame, enabled, tiers, temp_unit, is_simulation)
            )

        # Gate out Lobby, Shop, and open Journal pages so 3D Equipment/Environmental CV never false-triggers on menus/books
        in_active_gameplay = is_simulation or (
            not self.in_lobby_or_menu and not self.in_journal
        )

        # 1b. Truck Activity Monitor Line Graph (EMF 5 jumps / Twins double-kink)
        if enabled.get("truck_sanity_ocr", True) and in_active_gameplay:
            events.extend(self._detect_truck_activity_board(frame, is_simulation))

        # 2. Multi-Tier Equipment Computer Vision (EMF, Thermometer, Spirit Box)
        if enabled.get("equipment_cv", True) and in_active_gameplay:
            hand_roi = self._crop_roi(frame, "equipment_hand")
            # Fast check: lit displays/LEDs/mercury require at least moderate luminance in hand ROI
            if is_simulation or (hand_roi.size > 0 and np.max(hand_roi) >= 90):
                events.extend(
                    self._detect_emf(hand_roi, int(tiers.get("emf", 2)), is_simulation)
                )
                events.extend(
                    self._detect_thermometer_cv(
                        hand_roi, int(tiers.get("thermometer", 2)), temp_unit, is_simulation
                    )
                )
                events.extend(
                    self._detect_spirit_box_cv(
                        hand_roi, int(tiers.get("spirit_box", 2)), is_simulation
                    )
                )
                events.extend(
                    self._detect_smudge_and_crucifix(hand_roi, is_simulation)
                )
                events.extend(
                    self._detect_cursed_possessions(frame, hand_roi, is_simulation)
                )

        # 3. Environmental Computer Vision (Ghost Orbs, UV on Ground/Walls, DOTS, Writing, Hunt Blink)
        if enabled.get("environmental_cv", True) and in_active_gameplay:
            h, w = frame.shape[:2]
            # Use a wide vertical FOV (10%..94%) for UV so both wall handprints and floor salt footprints are captured
            uv_roi = frame[int(h * 0.10) : int(h * 0.94), int(w * 0.10) : int(w * 0.90)]
            center_roi = self._crop_roi(frame, "center_viewport")
            events.extend(self._detect_uv(uv_roi, is_simulation))
            events.extend(self._detect_ghost_orbs(center_roi, is_simulation))
            events.extend(self._detect_dots(center_roi, is_simulation))
            events.extend(self._detect_ghost_writing(center_roi, is_simulation))
            events.extend(
                self._detect_hunt_blink(center_roi, hunt_active, is_simulation)
            )
            # Check floor/table cursed items (Circle, Ouija)
            if is_simulation or hand_roi.size == 0:
                events.extend(
                    self._detect_cursed_possessions(frame, np.empty((0, 0, 3), dtype=np.uint8), is_simulation)
                )

        if events:
            self.last_detections = events[-6:]
        return events

    def _analyze_ocr(
        self,
        frame: np.ndarray,
        enabled: Dict[str, Any],
        tiers: Dict[str, Any],
        temp_unit: str,
        is_simulation: bool,
    ) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        try:
            # On Ultrawide (21:9 / 32:9), crop the central 16:9 pillar where Unity renders UI/Journal/Monitors & held tools,
            # and scale by vertical height (540p) instead of width so 3440x1440 text is never crushed to 401px height!
            h, w = frame.shape[:2]
            aspect = w / float(max(h, 1))
            if aspect > 1.85:
                pillar_w = int(round(h * (16.0 / 9.0)))
                pad_left = max(0, (w - pillar_w) // 2)
                ocr_src = frame[:, pad_left : pad_left + pillar_w]
            else:
                ocr_src = frame

            oh, ow = ocr_src.shape[:2]
            scale = min(1.0, 540.0 / float(max(oh, 1)))
            small = (
                cv2.resize(ocr_src, (int(ow * scale), int(oh * scale)))
                if scale < 1.0
                else ocr_src
            )
            result, _ = self.ocr(small)
            if not result:
                return events
        except Exception:
            return events

        full_text_lines: List[Tuple[List[List[float]], str, float]] = []
        combined_lower = []
        for item in result:
            box, text, score = item[0], str(item[1]).strip(), float(item[2])
            if score < 0.45:
                continue
            full_text_lines.append((box, text, score))
            combined_lower.append(text.lower())

        joined_text = " | ".join(combined_lower)

        lobby_keywords = (
            "select a contract",
            "mission debriefing",
            "contract complete",
            "loadout",
            "multiplayer",
            "singleplayer",
            "shop",
            "ready",
            "buy",
            "storage",
        )
        self.in_lobby_or_menu = any(kw in joined_text for kw in lobby_keywords)
        self.in_journal = "evidence" in joined_text and (
            "using the" in joined_text
            or "ghost" in joined_text
            or sum(1 for kw in EVIDENCE_KEYWORDS if kw in re.sub(r"[^a-z0-9]", "", joined_text)) >= 3
        )

        # A) Lobby / Contract Reset Detection
        if enabled.get("auto_reset_lobby", True):
            if (
                "select a contract" in joined_text
                or "mission debriefing" in joined_text
                or "contract complete" in joined_text
            ):
                if is_simulation or self._can_emit("lobby_reset", 15.0):
                    self.cold_non_freezing_count = 0
                    self.first_cold_non_freezing_ts = 0.0
                    self.hunt_blink_samples.clear()
                    events.append(
                        {
                            "type": "match_reset",
                            "source": "vision_ocr",
                            "label": "Lobby / Debriefing Detected",
                            "confidence": 0.95,
                            "detail": "Auto-resetting investigation state for new contract.",
                        }
                    )

        # B) Map & Difficulty Detection
        joined_norm = re.sub(r"[^a-z0-9]", "", joined_text)
        for kw, map_name in MAP_KEYWORDS.items():
            if kw in joined_norm:
                if is_simulation or self._can_emit(f"map_{kw}", 12.0):
                    events.append(
                        {
                            "type": "map_detected",
                            "source": "vision_ocr",
                            "map": map_name,
                            "confidence": 0.93,
                            "detail": f"Contract Map identified: {map_name}",
                        }
                    )
                break

        for diff_kw, ev_count in DIFFICULTY_EVIDENCE.items():
            if diff_kw in joined_text:
                if is_simulation or self._can_emit(f"diff_{diff_kw}", 20.0):
                    events.append(
                        {
                            "type": "difficulty_detected",
                            "source": "vision_ocr",
                            "difficulty": diff_kw.capitalize(),
                            "evidence_count": ev_count,
                            "confidence": 0.91,
                            "detail": f"Difficulty: {diff_kw.capitalize()} ({ev_count} Evidence)",
                        }
                    )
                break

        # C) Truck Sanity Monitor OCR
        if enabled.get("truck_sanity_ocr", True):
            if "sanity" in joined_text or "average" in joined_text:
                self.last_truck_seen_ts = time.time()
                pct_matches = re.findall(r"(\d{1,3})\s*%", joined_text)
                valid_pcts = [int(p) for p in pct_matches if 0 <= int(p) <= 100]
                if valid_pcts:
                    avg_sanity = int(round(sum(valid_pcts) / len(valid_pcts)))
                    if is_simulation or self._can_emit("truck_sanity", 3.5):
                        events.append(
                            {
                                "type": "sanity_update",
                                "source": "vision_ocr",
                                "sanity": avg_sanity,
                                "confidence": 0.94,
                                "detail": f"Truck Sanity Monitor read: {avg_sanity}%",
                            }
                        )

        # D) In-Game Journal Sync (detecting circled vs struck-through evidence)
        if enabled.get("journal_ocr", True) and "evidence" in joined_text:
            for box, text, score in full_text_lines:
                t_norm = re.sub(r"[^a-z0-9]", "", text.lower())
                for kw, ev_name in EVIDENCE_KEYWORDS.items():
                    if kw in t_norm:
                        mark_state = self._classify_journal_mark(small, box)
                        if mark_state in ("confirmed", "ruled_out"):
                            if is_simulation or self._can_emit(
                                f"journal_{ev_name}_{mark_state}", 5.0
                            ):
                                events.append(
                                    {
                                        "type": "evidence",
                                        "source": "journal_ocr",
                                        "evidence": ev_name,
                                        "state": mark_state,
                                        "confidence": 0.94,
                                        "detail": f"Journal sync: {ev_name} ({mark_state.replace('_', ' ')})",
                                    }
                                )
                        break

        # E) Digital Thermometer (Tier II / III or Simulation) OCR
        if enabled.get("equipment_cv", True) and (
            int(tiers.get("thermometer", 2)) in (2, 3) or is_simulation
        ):
            sh, sw = small.shape[:2]
            for box, text, score in full_text_lines:
                t_low = text.lower()
                if "m/s" in t_low or "bpm" in t_low or "%" in t_low:
                    continue
                # Must be located in the lower-right held equipment region of the screen
                cx = sum(pt[0] for pt in box) / 4.0
                cy = sum(pt[1] for pt in box) / 4.0
                if cx < sw * 0.45 or cy < sh * 0.40:
                    continue

                # Require an explicit C or F unit so arbitrary decimals on screen never trigger Freezing
                temp_match = re.search(
                    r"(-?\d{1,2}\.\d)\s*°?\s*([cfCF])\b", text
                )
                if temp_match:
                    val = float(temp_match.group(1))
                    unit = temp_match.group(2).upper()
                    # Phasmophobia Tier 2/3 Digital Thermometer Freezing threshold is < 1.0°C (<= 0.9°C) or < 33.8°F (<= 33.7°F)
                    is_freezing = (unit == "C" and -10.5 <= val <= 0.9) or (
                        unit == "F" and 14.0 <= val <= 33.7
                    )
                    if is_freezing:
                        self._handle_cold_non_freezing(val, unit, True, is_simulation)
                        if is_simulation or self._can_emit("freezing_ocr", 8.0):
                            events.append(
                                {
                                    "type": "evidence",
                                    "source": "thermometer_ocr",
                                    "evidence": "Freezing Temperatures",
                                    "state": "confirmed",
                                    "confidence": 0.92,
                                    "detail": f"Digital Thermometer reading: {val:.1f}°{unit} (< 1.0°C / 33.8°F)",
                                }
                            )
                    else:
                        events.extend(
                            self._handle_cold_non_freezing(val, unit, False, is_simulation)
                        )

        # F) Truck Whiteboard Optional Objectives OCR
        if "objective" in joined_text or "whiteboard" in joined_text or (
            any(k in joined_text for k in ("cleanse", "incense", "motion sensor", "walk in salt", "crucifix", "photo of the ghost"))
        ):
            self.last_truck_seen_ts = time.time()
            possible_objs = []
            if "incense" in joined_text or "cleanse" in joined_text:
                possible_objs.append("Cleanse the area near the ghost using Incense")
            if "motion" in joined_text:
                possible_objs.append("Detect a ghost presence with a Motion Sensor")
            if "salt" in joined_text:
                possible_objs.append("Get the ghost to walk in Salt")
            if "photo" in joined_text:
                possible_objs.append("Capture a photo of the ghost")
            if "crucifix" in joined_text:
                possible_objs.append("Prevent the ghost from hunting with a Crucifix")
            if "escape" in joined_text:
                possible_objs.append("Escape the ghost during a hunt")
            if "event" in joined_text or "witness" in joined_text:
                possible_objs.append("Witness a Ghost Event")
            if "candle" in joined_text:
                possible_objs.append("Get a ghost to blow out a Candle")

            if possible_objs and (is_simulation or self._can_emit("objectives_ocr", 15.0)):
                events.append(
                    {
                        "type": "objectives_detected",
                        "source": "truck_whiteboard_ocr",
                        "objectives": possible_objs[:3],
                        "confidence": 0.92,
                        "detail": f"Contract Objectives loaded ({len(possible_objs[:3])} found)",
                    }
                )

        # G) Parabolic Microphone Signal & Distance Calculation
        if "paramic" in joined_text or "parab" in joined_text or is_simulation:
            for box, text, score in full_text_lines:
                t_str = text.strip()
                m_par = re.search(r"(\d{1,2}\.\d)", t_str)
                is_temp = bool(re.search(r"\d\s*°?[cfCF]\b", t_str))
                if m_par and not is_temp and "%" not in t_str:
                    val = float(m_par.group(1))
                    if 0.1 <= val <= 25.0:
                        est_m = max(1.5, min(30.0, round(30.0 / (val + 0.8), 1)))
                        if is_simulation or self._can_emit("parabolic_ocr", 2.5):
                            events.append(
                                {
                                    "type": "parabolic_reading",
                                    "source": "parabolic_ocr",
                                    "reading": val,
                                    "estimated_distance_m": est_m,
                                    "confidence": 0.88,
                                    "detail": f"Parabolic Mic sound reading {val:.1f} (~{est_m:.1f}m away)",
                                }
                            )
                            break
        return events

    def _handle_cold_non_freezing(
        self, val: float, unit: str, is_freezing: bool, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Tracks sustained non-freezing cold ghost-room readings (1.0-2.9°C / 33.8-37.2°F)
        and suggests ruling out Freezing Temperatures when temps plateau above freezing."""
        if self._cold_checked_this_frame:
            return []
        self._cold_checked_this_frame = True

        if is_freezing:
            self.cold_non_freezing_count = 0
            self.first_cold_non_freezing_ts = 0.0
            return []

        u = unit.upper()
        in_cold_band = (u == "C" and 1.0 <= val <= 2.9) or (u == "F" and 33.8 <= val <= 37.2)
        if not in_cold_band:
            return []

        now = time.time()
        if self.cold_non_freezing_count == 0:
            self.first_cold_non_freezing_ts = now
        self.cold_non_freezing_count += 1

        if self.cold_non_freezing_count >= 6 and (
            is_simulation or (now - self.first_cold_non_freezing_ts) >= 45.0
        ):
            if is_simulation or self._can_emit("rule_out_freezing_suggest", 30.0):
                return [
                    {
                        "type": "rule_out_suggestion",
                        "source": "thermometer_cold_non_freezing",
                        "evidence": "Freezing Temperatures",
                        "confidence": 0.80,
                        "detail": (
                            f"Thermometer stabilized at {val:.1f}°{u} across "
                            f"{self.cold_non_freezing_count} readings without dropping below 1.0°C "
                            "— consider ruling out Freezing Temperatures."
                        ),
                    }
                ]
        return []

    def _classify_journal_mark(
        self, img: np.ndarray, box: List[List[float]]
    ) -> Optional[str]:
        """Checks a detected Journal evidence label ROI for a dark ink circle or strikethrough.
        Completely masks out the inner text bounding box so printed letters never cause false positives."""
        xs = [int(pt[0]) for pt in box]
        ys = [int(pt[1]) for pt in box]
        bx1, bx2 = max(0, min(xs)), min(img.shape[1], max(xs))
        by1, by2 = max(0, min(ys)), min(img.shape[0], max(ys))
        box_h = max(10, by2 - by1)
        pad_y = max(14, int(box_h * 0.75))
        pad_x = max(16, int(box_h * 0.85))

        x1, x2 = max(0, bx1 - pad_x), min(img.shape[1], bx2 + pad_x)
        y1, y2 = max(0, by1 - pad_y), min(img.shape[0], by2 + pad_y)
        crop = img[y1:y2, x1:x2]
        if crop.size == 0 or crop.shape[0] < 16 or crop.shape[1] < 32:
            return None

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        # Journal ink marks (circle/strikethrough) are much darker than the tan paper background
        paper_median = float(np.median(gray))
        thresh_val = max(60, min(115, int(paper_median * 0.58)))
        _, dark = cv2.threshold(gray, thresh_val, 255, cv2.THRESH_BINARY_INV)
        h, w = dark.shape

        # Coordinates of the text box inside `crop` (expanded by 2px so zero letter ink leaks outside)
        tx1 = max(2, (bx1 - x1) - 2)
        tx2 = min(w - 2, (bx2 - x1) + 2)
        ty1 = max(2, (by1 - y1) - 2)
        ty2 = min(h - 2, (by2 - y1) + 2)

        outer_only = dark.copy()
        outer_only[ty1:ty2, tx1:tx2] = 0

        # 1) Check all 4 outer margin strips for an enclosing hand-drawn oval/circle
        top_strip = outer_only[:ty1, tx1:tx2]
        bot_strip = outer_only[ty2:, tx1:tx2]
        left_strip = outer_only[ty1:ty2, :tx1]
        right_strip = outer_only[ty1:ty2, tx2:]

        if (
            top_strip.size > 0
            and bot_strip.size > 0
            and left_strip.size > 0
            and right_strip.size > 0
        ):
            top_cov = float(np.mean(np.max(top_strip, axis=0) > 0))
            bot_cov = float(np.mean(np.max(bot_strip, axis=0) > 0))
            left_cov = float(np.mean(np.max(left_strip, axis=1) > 0))
            right_cov = float(np.mean(np.max(right_strip, axis=1) > 0))

            # All 4 sides outside the text box must contain the ink loop
            if top_cov > 0.52 and bot_cov > 0.52 and left_cov > 0.42 and right_cov > 0.42:
                return "confirmed"

        # 2) Check horizontal center band extending into BOTH left and right outer margins for a strikethrough line
        mid_y1, mid_y2 = max(0, h // 2 - 3), min(h, h // 2 + 4)
        mid_band = dark[mid_y1:mid_y2, :]
        col_coverage = float(np.mean(np.max(mid_band, axis=0) > 0))
        left_ext = float(np.mean(np.max(outer_only[mid_y1:mid_y2, :tx1], axis=0) > 0)) if tx1 > 2 else 0.0
        right_ext = float(np.mean(np.max(outer_only[mid_y1:mid_y2, tx2:], axis=0) > 0)) if tx2 < w - 2 else 0.0

        if col_coverage > 0.88 and left_ext > 0.35 and right_ext > 0.35:
            return "ruled_out"
        return None

    def _detect_emf(
        self, roi: np.ndarray, tier: int, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects EMF Level 5 across all three equipment tiers:
        Tier 1 (GheistField analog needle pinned right in red overdrive zone),
        Tier 2 (K-II 5-LED Green -> Amber -> Red bar), and
        Tier 3 (ParaMeter backlit digital screen with 5 level bars + red peak alert)."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        rh, rw = roi.shape[:2]
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        dark_mask = hsv[:, :, 2] <= 70

        # 1) Green LED 1/2 (Hue 36..78)
        green_mask = cv2.inRange(hsv, np.array([36, 175, 185]), np.array([78, 255, 255]))
        # 2) Yellow/Orange LED 3/4 (Hue 12..34)
        amber_mask = cv2.inRange(hsv, np.array([12, 175, 185]), np.array([34, 255, 255]))
        # 3) Bright Red LED #5 / peak alert (Hue 0..8 or 170..180)
        red1 = cv2.inRange(hsv, np.array([0, 185, 195]), np.array([8, 255, 255]))
        red2 = cv2.inRange(hsv, np.array([170, 185, 195]), np.array([180, 255, 255]))
        red_mask = cv2.bitwise_or(red1, red2)

        def find_led_centroids(mask: np.ndarray) -> List[Tuple[float, float]]:
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            pts: List[Tuple[float, float]] = []
            for c in cnts:
                area = cv2.contourArea(c)
                if 20 <= area <= 1600:
                    m = cv2.moments(c)
                    if m["m00"] > 0:
                        pts.append((m["m10"] / m["m00"], m["m01"] / m["m00"]))
            return pts

        greens = find_led_centroids(green_mask)
        ambers = find_led_centroids(amber_mask)
        reds = find_led_centroids(red_mask)

        # Tier 2: collinear horizontal row ordered Left -> Right: Green -> Amber -> Red
        t2_match = False
        for gx, gy in greens:
            for ax, ay in ambers:
                for rx, ry in reds:
                    if gx < ax < rx and 50 <= (rx - gx) <= 250:
                        if abs(gy - ay) <= 26 and abs(ry - ay) <= 26 and abs(ry - gy) <= 30:
                            t2_match = True
                            break
                if t2_match:
                    break
            if t2_match:
                break

        def has_dark_bezel(x: int, y: int, cw: int, ch: int, pad: int = 24) -> bool:
            bx1, by1 = max(0, x - pad), max(0, y - pad)
            bx2, by2 = min(rw, x + cw + pad), min(rh, y + ch + pad)
            outer_area = (bx2 - bx1) * (by2 - by1) - (cw * ch)
            if outer_area <= 0:
                return False
            sub = dark_mask[by1:by2, bx1:bx2].copy()
            sub[(y - by1) : (y + ch - by1), (x - bx1) : (x + cw - bx1)] = False
            return (int(np.count_nonzero(sub)) / float(outer_area)) >= 0.30

        # Tier 3: ParaMeter backlit PDA screen with 5-bar Level 5 display + red peak alert
        t3_match = False
        if tier == 3 or is_simulation:
            screen_mask = cv2.inRange(hsv, np.array([30, 15, 95]), np.array([115, 230, 255]))
            scr_cnts, _ = cv2.findContours(screen_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in scr_cnts:
                area = cv2.contourArea(c)
                if 2200 <= area <= 48000:
                    x, y, cw, ch = cv2.boundingRect(c)
                    aspect = cw / float(max(ch, 1))
                    if 0.60 <= aspect <= 1.95 and has_dark_bezel(x, y, cw, ch):
                        scr_red_px = int(np.count_nonzero(red_mask[y : y + ch, x : x + cw]))
                        if scr_red_px < 18:
                            continue
                        scr_gray = gray[y : y + ch, x : x + cw]
                        dark_thresh = max(40, int(float(np.median(scr_gray)) * 0.65))
                        dark_segs = (scr_gray < dark_thresh).astype(np.uint8) * 255
                        bright_segs = (scr_gray > 215).astype(np.uint8) * 255
                        seg_mask = cv2.bitwise_or(dark_segs, bright_segs)
                        seg_cnts, _ = cv2.findContours(
                            seg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                        )
                        bar_pts: List[Tuple[float, float]] = []
                        slot_rows: List[float] = []
                        for sc in seg_cnts:
                            sa = cv2.contourArea(sc)
                            sx, sy, sw_c, sh_c = cv2.boundingRect(sc)
                            if 8 <= sa <= 450:
                                m = cv2.moments(sc)
                                if m["m00"] > 0:
                                    bar_pts.append((m["m10"] / m["m00"], m["m01"] / m["m00"]))
                            if sw_c >= cw * 0.35 and sh_c <= max(8, int(ch * 0.12)):
                                slot_rows.append(float(sy + sh_c * 0.5))

                        # (a) >= 5 collinear level-bar segments in a horizontal row
                        row_match = False
                        for bx, by in bar_pts:
                            row_group = [p for p in bar_pts if abs(p[1] - by) <= 10.0]
                            if len(row_group) >= 5:
                                ys_g = [p[1] for p in row_group]
                                xs_g = [p[0] for p in row_group]
                                if float(np.std(ys_g)) <= 5.0 and (max(xs_g) - min(xs_g)) >= 0.32 * cw:
                                    row_match = True
                                    break

                        # (b) >= 3 stacked signal slot dividers with bounded red level-5 alert badge
                        div_bands: List[float] = []
                        for ry_div in sorted(slot_rows):
                            if not div_bands or (ry_div - div_bands[-1]) >= ch * 0.15:
                                div_bands.append(ry_div)
                        slot_match = len(div_bands) >= 3 and 18 <= scr_red_px <= 2500

                        if row_match or slot_match:
                            t3_match = True
                            break

        # Tier 1: GheistField analog meter with needle pinned right in red overdrive zone
        t1_match = False
        if tier == 1 or is_simulation:
            dial_mask = cv2.inRange(hsv, np.array([10, 15, 130]), np.array([36, 120, 255]))
            dial_cnts, _ = cv2.findContours(dial_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in dial_cnts:
                area = cv2.contourArea(c)
                if 1600 <= area <= 32000:
                    x, y, cw, ch = cv2.boundingRect(c)
                    aspect = cw / float(max(ch, 1))
                    if 0.85 <= aspect <= 2.2 and has_dark_bezel(x, y, cw, ch):
                        rx1, rx2 = x + int(cw * 0.68), x + cw
                        ry1, ry2 = y + int(ch * 0.15), y + int(ch * 0.85)
                        zone_red = int(np.count_nonzero(red_mask[ry1:ry2, rx1:rx2]))
                        zone_gray = gray[ry1:ry2, rx1:rx2]
                        if zone_gray.size > 0 and zone_red >= 25:
                            needle_ratio = float(np.count_nonzero(zone_gray < 65)) / float(
                                zone_gray.size
                            )
                            if 0.04 <= needle_ratio <= 0.28:
                                t1_match = True
                                break

        if t3_match or t2_match or t1_match:
            detected_tier = 3 if t3_match else (1 if t1_match and not t2_match else tier)
            # Visual-only EMF defaults to suspected (78%) unless in simulation or paired with audio
            conf = 0.89 if is_simulation else 0.78
            if is_simulation or self._can_emit("emf5_cv", 7.0):
                tier_desc = {
                    1: "Tier 1 GheistField analog needle pinned in Level 5 overdrive",
                    2: "Tier 2 EMF Reader 5-LED array active",
                    3: "Tier 3 EMF ParaMeter 5-bar Level 5 alert active",
                }.get(detected_tier, f"Tier {detected_tier} EMF Level 5 active")
                events.append(
                    {
                        "type": "evidence",
                        "source": f"emf_tier_{detected_tier}_cv",
                        "evidence": "EMF Level 5",
                        "state": "confirmed" if conf >= 0.85 else "suspected",
                        "confidence": conf,
                        "detail": tier_desc,
                    }
                )
        return events

    def _detect_thermometer_cv(
        self, roi: np.ndarray, tier: int, temp_unit: str, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects Tier I mercury thermometer freezing level and Tier II/III backlit LCD digital readings."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

        # A) Tier II / III Backlit LCD Screen localized OCR (catches 7-segment readings where '°C/F' is tiny)
        if self.ocr is not None and not is_simulation:
            # Thermometer LCD screen is a bright cyan/greenish/gray backlit rectangle inside a dark body
            lcd_mask = cv2.inRange(hsv, np.array([35, 18, 125]), np.array([115, 220, 255]))
            cnts, _ = cv2.findContours(lcd_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            found_freezing_in_frame = False
            for c in cnts:
                area = cv2.contourArea(c)
                if 900 <= area <= 35000:
                    x, y, cw, ch = cv2.boundingRect(c)
                    aspect = cw / float(max(ch, 1))
                    if 0.65 <= aspect <= 3.0:
                        lcd_crop = roi[y : y + ch, x : x + cw]
                        up = cv2.resize(lcd_crop, (cw * 2, ch * 2), interpolation=cv2.INTER_CUBIC)
                        try:
                            res, _ = self.ocr(up)
                            if res:
                                for item in res:
                                    txt = str(item[1]).strip()
                                    score = float(item[2])
                                    if score < 0.72 or "%" in txt or "m" in txt.lower():
                                        continue
                                    # Require explicit decimal format AND check unit strictly so "- 38" in °F never triggers as Celsius
                                    m = re.search(r"(-?\d{1,2}\.\d)\s*°?\s*([cfCF])?", txt)
                                    if m:
                                        val = float(m.group(1))
                                        explicit_unit = (m.group(2) or "").upper()
                                        active_unit = explicit_unit or temp_unit.upper()
                                        if active_unit == "C":
                                            is_frz = -10.5 <= val <= 0.9
                                        else:
                                            # In Fahrenheit, Freezing is 14.0°F .. 33.7°F (< 33.8°F).
                                            # Never allow negative numbers in °F (prevents scan dash "- 38" -> "-3.8" misread!).
                                            is_frz = 14.0 <= val <= 33.7

                                        if is_frz:
                                            self._handle_cold_non_freezing(
                                                val, active_unit, True, is_simulation
                                            )
                                            found_freezing_in_frame = True
                                            self.freezing_streak += 1
                                            # Require 2 consecutive frames (or explicit C/F unit) to avoid 7-segment 38->28 single-frame glitches
                                            if explicit_unit or self.freezing_streak >= 2:
                                                conf = 0.90 if (explicit_unit and self.freezing_streak >= 2) else 0.79
                                                if self._can_emit("freezing_ocr", 7.0):
                                                    events.append(
                                                        {
                                                            "type": "evidence",
                                                            "source": f"thermometer_tier_{tier}_lcd",
                                                            "evidence": "Freezing Temperatures",
                                                            "state": "confirmed" if conf >= 0.85 else "suspected",
                                                            "confidence": conf,
                                                            "detail": f"Thermometer reading: {val:.1f}°{active_unit} (< 1.0°C / 33.8°F)",
                                                        }
                                                    )
                                                    return events
                                        else:
                                            events.extend(
                                                self._handle_cold_non_freezing(
                                                    val, active_unit, False, is_simulation
                                                )
                                            )
                        except Exception:
                            pass
            if not found_freezing_in_frame:
                self.freezing_streak = 0

        # B) Tier I Analog Mercury Thermometer (vertical beige tube backplate + low red mercury column)
        if tier == 1:
            scale_plate = cv2.inRange(hsv, np.array([10, 12, 140]), np.array([38, 105, 255]))
            cnts, _ = cv2.findContours(scale_plate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                area = cv2.contourArea(c)
                if 1100 <= area <= 28000:
                    x, y, cw, ch = cv2.boundingRect(c)
                    if ch / float(max(cw, 1)) >= 2.2:
                        tube = hsv[y : y + ch, x : x + cw]
                        r1 = cv2.inRange(tube, np.array([0, 135, 95]), np.array([10, 255, 255]))
                        r2 = cv2.inRange(tube, np.array([168, 135, 95]), np.array([180, 255, 255]))
                        red_col = cv2.bitwise_or(r1, r2)
                        red_ys = np.where(red_col > 0)[0]
                        if red_ys.size >= 15:
                            top_mercury_y = float(np.percentile(red_ys, 10))
                            # Mercury top is in the bottom 38% of the scale (< 0°C / 32°F)
                            if (top_mercury_y / float(ch)) >= 0.62:
                                if self._can_emit("freezing_t1_cv", 7.0):
                                    events.append(
                                        {
                                            "type": "evidence",
                                            "source": "thermometer_tier_1_cv",
                                            "evidence": "Freezing Temperatures",
                                            "state": "suspected",
                                            "confidence": 0.78,
                                            "detail": "Tier I Thermometer mercury below 0°C/32°F line",
                                        }
                                    )
                                    return events
        return events

    def _detect_spirit_box_cv(
        self, roi: np.ndarray, tier: int, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects Spirit Box ghost responses in live gameplay and simulation across all 3 tiers:
        Tier 1 (Old AM/FM Radio: isolated white ghost LED next to warm dial, no red LED),
        Tier 2 (P-SB7T: orange backlit LCD with right-side white/dark ghost icon, no red X),
        Tier 3 (SB11-Z: horizontal row of 3+ white response LEDs on dark faceplate, no red LEDs)."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        h, w = roi.shape[:2]
        total_px = max(1, h * w)
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        dark_casing = cv2.inRange(hsv, np.array([0, 0, 8]), np.array([180, 85, 68]))
        white_led = cv2.inRange(hsv, np.array([0, 0, 215]), np.array([180, 55, 255]))
        red1 = cv2.inRange(hsv, np.array([0, 160, 175]), np.array([10, 255, 255]))
        red2 = cv2.inRange(hsv, np.array([170, 160, 175]), np.array([180, 255, 255]))
        red_led = cv2.bitwise_or(red1, red2)
        orange_lcd = cv2.inRange(hsv, np.array([9, 175, 180]), np.array([22, 255, 255]))

        dark_ratio = float(np.count_nonzero(dark_casing)) / float(total_px)
        orange_ratio = float(np.count_nonzero(orange_lcd)) / float(total_px)

        matched_tier: Optional[int] = None

        # --- Tier 3: SB11-Z row of >= 3 white response LEDs on dark casing ---
        if tier == 3 or is_simulation:
            w_cnts, _ = cv2.findContours(white_led, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            w_pts: List[Tuple[float, float]] = []
            for c in w_cnts:
                area = cv2.contourArea(c)
                if 8 <= area <= 420:
                    perim = cv2.arcLength(c, True)
                    circ = (4.0 * math.pi * area / (perim * perim)) if perim > 0 else 0.0
                    if circ < 0.45:
                        continue
                    m = cv2.moments(c)
                    if m["m00"] > 0:
                        wx = m["m10"] / m["m00"]
                        wy = m["m01"] / m["m00"]
                        ix, iy = int(round(wx)), int(round(wy))
                        patch = dark_casing[max(0, iy - 18) : min(h, iy + 18), max(0, ix - 18) : min(w, ix + 18)]
                        if patch.size > 0 and (float(np.count_nonzero(patch)) / float(patch.size)) >= 0.45:
                            w_pts.append((wx, wy))

            for _, wy0 in w_pts:
                row = sorted((p for p in w_pts if abs(p[1] - wy0) <= 14.0), key=lambda p: p[0])
                if len(row) < 3:
                    continue
                # Find any contiguous run of >= 3 collinear LEDs with realistic spacing
                run: List[Tuple[float, float]] = [row[0]]
                for pt in row[1:]:
                    dx = pt[0] - run[-1][0]
                    if 8.0 <= dx <= 90.0:
                        run.append(pt)
                    elif dx > 90.0:
                        if len(run) >= 3 and 28.0 <= (run[-1][0] - run[0][0]) <= 240.0:
                            break
                        run = [pt]
                if len(run) >= 3 and 28.0 <= (run[-1][0] - run[0][0]) <= 240.0:
                    y_mid = int(round(sum(p[1] for p in run) / len(run)))
                    x_lo = max(0, int(run[0][0]) - 20)
                    x_hi = min(w, int(run[-1][0]) + 20)
                    band_red = int(
                        np.count_nonzero(red_led[max(0, y_mid - 18) : min(h, y_mid + 19), x_lo:x_hi])
                    )
                    if band_red < 15:
                        matched_tier = 3
                        break

        # --- Tier 2: P-SB7T orange backlit LCD with right-side Ghost response icon ---
        if matched_tier is None and (tier == 2 or is_simulation):
            o_cnts, _ = cv2.findContours(orange_lcd, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in o_cnts:
                area = cv2.contourArea(c)
                if 900 <= area <= 28000:
                    x, y, cw, ch = cv2.boundingRect(c)
                    aspect = cw / float(max(ch, 1))
                    solidity = area / float(max(1, cw * ch))
                    if 1.15 <= aspect <= 3.6 and solidity >= 0.60:
                        pad = 24
                        bx1, by1 = max(0, x - pad), max(0, y - pad)
                        bx2, by2 = min(w, x + cw + pad), min(h, y + ch + pad)
                        outer_area = (bx2 - bx1) * (by2 - by1) - (cw * ch)
                        if outer_area > 0:
                            sub_dark = dark_casing[by1:by2, bx1:bx2].copy()
                            sub_dark[(y - by1) : (y + ch - by1), (x - bx1) : (x + cw - bx1)] = 0
                            if (float(np.count_nonzero(sub_dark)) / float(outer_area)) < 0.25:
                                continue
                        icon_roi = gray[
                            y + int(ch * 0.12) : y + int(ch * 0.78),
                            x + int(cw * 0.58) : x + int(cw * 0.94),
                        ]
                        if icon_roi.size > 0:
                            icon_fill = float(
                                np.count_nonzero((icon_roi < 110) | (icon_roi > 225))
                            ) / float(icon_roi.size)
                            lcd_red = int(np.count_nonzero(red_led[y : y + ch, x : x + cw]))
                            if 0.08 <= icon_fill <= 0.55 and lcd_red < 20:
                                matched_tier = 2
                                break
            if matched_tier is None and is_simulation and 0.015 <= orange_ratio <= 0.06 and dark_ratio > 0.25:
                matched_tier = 2

        # --- Tier 1: Old AM/FM Radio isolated white LED next to warm dial ---
        if matched_tier is None and (tier == 1 or is_simulation):
            if dark_ratio >= 0.28 and int(np.count_nonzero(red_led)) < 12:
                amber_dial = cv2.inRange(hsv, np.array([9, 140, 130]), np.array([26, 255, 255]))
                amber_px = int(np.count_nonzero(amber_dial))
                if 50 <= amber_px <= 1800:
                    w_cnts, _ = cv2.findContours(white_led, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    t1_blobs = 0
                    for c in w_cnts:
                        area = cv2.contourArea(c)
                        if 14 <= area <= 340:
                            perim = cv2.arcLength(c, True)
                            circ = (4.0 * math.pi * area / (perim * perim)) if perim > 0 else 0.0
                            if circ >= 0.62:
                                m = cv2.moments(c)
                                if m["m00"] > 0:
                                    ix = int(round(m["m10"] / m["m00"]))
                                    iy = int(round(m["m01"] / m["m00"]))
                                    patch = dark_casing[
                                        max(0, iy - 20) : min(h, iy + 20),
                                        max(0, ix - 20) : min(w, ix + 20),
                                    ]
                                    if patch.size > 0 and (float(np.count_nonzero(patch)) / float(patch.size)) >= 0.55:
                                        t1_blobs += 1
                    if 1 <= t1_blobs <= 2:
                        matched_tier = 1

        if matched_tier is not None:
            self.spirit_box_streak += 1
            if is_simulation or self.spirit_box_streak >= 2:
                conf = 0.86 if (is_simulation or self.spirit_box_streak >= 3) else 0.78
                if is_simulation or self._can_emit("spirit_box_cv", 8.0):
                    events.append(
                        {
                            "type": "evidence",
                            "source": f"spirit_box_tier_{matched_tier}_cv",
                            "evidence": "Spirit Box",
                            "state": "confirmed" if conf >= 0.85 else "suspected",
                            "confidence": conf,
                            "detail": f"Tier {matched_tier} Spirit Box response indicator lit",
                        }
                    )
        else:
            self.spirit_box_streak = 0
        return events

    def _detect_smudge_and_crucifix(
        self, roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects Smudge/Incense lighter ignition and Crucifix burned state in handheld or floor view."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

        # EMF meter exclusion: If green/amber LEDs from EMF reader are present, reject smudge/crucifix
        green_leds = cv2.inRange(hsv, np.array([36, 175, 185]), np.array([78, 255, 255]))
        if int(np.count_nonzero(green_leds)) >= 18:
            return events

        # Smudge ignition: bright lighter flame flash (Hue 8..24, Sat >= 185, Val >= 210)
        flame_mask = cv2.inRange(hsv, np.array([8, 185, 210]), np.array([24, 255, 255]))
        flame_px = int(np.count_nonzero(flame_mask))
        if 80 <= flame_px <= 4500:
            cnts, _ = cv2.findContours(flame_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            has_tall_flame = False
            for c in cnts:
                if cv2.contourArea(c) >= 120:
                    _, _, cw, ch = cv2.boundingRect(c)
                    # Lighter flame is vertically elongated (aspect ratio ch/cw >= 1.3)
                    if ch >= 14 and (ch / max(1, cw)) >= 1.3:
                        has_tall_flame = True
                        break
            if has_tall_flame:
                if is_simulation or self._can_emit("smudge_ignition_cv", 15.0):
                    events.append(
                        {
                            "type": "smudge_timer",
                            "source": "smudge_cv",
                            "timestamp": round(time.time(), 3),
                            "confidence": 0.88,
                            "detail": "Incense ignition detected! Starting 60s Demon, 90s Standard, and 180s Spirit countdown.",
                        }
                    )

        # Crucifix burn: charred black cross contour with glowing ember core (Hue 4..18, Sat >= 170, Val >= 190)
        now = time.time()
        in_truck = (now - self.last_truck_seen_ts) < 8.0
        # In live gameplay: reject if player is in lobby or in truck (crucifixes never burn in lobby or truck)
        if not is_simulation and (self.in_lobby_or_menu or in_truck):
            self.crucifix_burn_streak = 0
            return events

        ember_mask = cv2.inRange(hsv, np.array([4, 170, 190]), np.array([18, 255, 255]))
        cnts, _ = cv2.findContours(ember_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        has_crucifix_ember = False
        for c in cnts:
            area = cv2.contourArea(c)
            if 25 <= area <= 650:
                x, y, cw, ch = cv2.boundingRect(c)
                aspect = float(cw) / float(max(1, ch))
                if 0.35 <= aspect <= 2.8:
                    # Check for surrounding charred cross material (Val <= 55, Sat <= 85)
                    x0, y0 = max(0, x - 24), max(0, y - 24)
                    x1, y1 = min(roi.shape[1], x + cw + 24), min(roi.shape[0], y + ch + 24)
                    surround = hsv[y0:y1, x0:x1]
                    if surround.size > 0:
                        char_mask = (surround[:, :, 2] <= 55) & (surround[:, :, 1] <= 85)
                        char_px = int(np.count_nonzero(char_mask))
                        if char_px >= max(80, int(area * 0.75)):
                            has_crucifix_ember = True
                            break

        if has_crucifix_ember:
            self.crucifix_burn_streak += 1
            if is_simulation or self.crucifix_burn_streak >= 2:
                if is_simulation or self._can_emit("crucifix_burned_cv", 25.0):
                    events.append(
                        {
                            "type": "crucifix_burned",
                            "source": "crucifix_cv",
                            "timestamp": round(now, 3),
                            "confidence": 0.88,
                            "detail": "Crucifix burn detected! A ghost hunt was successfully blocked.",
                        }
                    )
        else:
            self.crucifix_burn_streak = 0

        return events

    def _detect_cursed_possessions(
        self, frame: np.ndarray, hand_roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects all 7 Phasmophobia Cursed Possessions and their Cursed Hunt triggers:
        1. Tarot Cards (Death card skull contour -> Cursed Hunt)
        2. Haunted Mirror (Golden oval frame, shattered glass cracks -> Cursed Hunt)
        3. Music Box (Golden cylinder brass box, dropped/hunt trigger -> Cursed Hunt)
        4. Ouija Board (Wooden board + planchette fracture -> Cursed Hunt)
        5. Summoning Circle (5 red candles on floor, 5th flame lit -> Cursed Hunt)
        6. Monkey Paw (Mummified paw + curled claw wish gesture)
        7. Tortured Voodoo Doll (Burlap doll, heart pin inserted -> Cursed Hunt)"""
        events: List[Dict[str, Any]] = []
        now = time.time()
        in_truck = (now - self.last_truck_seen_ts) < 8.0
        if not is_simulation and (self.in_lobby_or_menu or in_truck):
            return events

        # 1. Handheld Cursed Possessions (Tarot, Mirror, Music Box, Monkey Paw, Voodoo)
        if hand_roi.size > 0:
            h_hand, w_hand = hand_roi.shape[:2]
            hsv_hand = cv2.cvtColor(hand_roi, cv2.COLOR_BGR2HSV)

            gold_border = cv2.inRange(hsv_hand, np.array([18, 120, 140]), np.array([32, 255, 255]))
            white_face = cv2.inRange(hsv_hand, np.array([0, 0, 195]), np.array([180, 50, 255]))
            crimson_skull1 = cv2.inRange(hsv_hand, np.array([0, 160, 160]), np.array([10, 255, 255]))
            crimson_skull2 = cv2.inRange(hsv_hand, np.array([170, 160, 160]), np.array([180, 255, 255]))
            red_sigil = cv2.bitwise_or(crimson_skull1, crimson_skull2)

            # A) Tarot Cards: Ornate card backing with gold border and white card face + crimson skull
            cnts_gold, _ = cv2.findContours(gold_border, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cg in cnts_gold:
                ag = cv2.contourArea(cg)
                if 400 <= ag <= 65000:
                    xg, yg, wg, hg = cv2.boundingRect(cg)
                    aspect = float(hg) / float(max(1, wg))
                    if 1.15 <= aspect <= 2.4:
                        card_patch = white_face[yg : yg + hg, xg : xg + wg]
                        if card_patch.size > 0 and (float(np.count_nonzero(card_patch)) / float(card_patch.size)) >= 0.15:
                            sigil_patch = red_sigil[yg + int(hg * 0.2) : yg + int(hg * 0.8), xg + int(wg * 0.2) : xg + int(wg * 0.8)]
                            if sigil_patch.size > 0 and 30 <= np.count_nonzero(sigil_patch) <= 3000:
                                if is_simulation or self._can_emit("cursed_tarot_death", 30.0):
                                    events.append({
                                        "type": "cursed_hunt_trigger",
                                        "possession": "Tarot Cards",
                                        "action": "death_card",
                                        "source": "cursed_possession_cv",
                                        "timestamp": round(now, 3),
                                        "confidence": 0.90,
                                        "detail": "Death Tarot card drawn! Cursed Hunt triggered (+20s duration, 1s grace).",
                                        "duration_bump": 20.0,
                                    })
                                    return events

            # B) Haunted Mirror: Oval gold frame enclosing cracked glass pane
            oval_cnts, _ = cv2.findContours(gold_border, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for co in oval_cnts:
                ao = cv2.contourArea(co)
                if 900 <= ao <= 60000:
                    xo, yo, wo, ho = cv2.boundingRect(co)
                    aspect_o = float(ho) / float(max(1, wo))
                    if 1.10 <= aspect_o <= 2.2:
                        perim = cv2.arcLength(co, True)
                        circ = (4.0 * np.pi * ao / (perim * perim)) if perim > 0 else 0.0
                        if circ >= 0.50:
                            glass_roi = hand_roi[yo + int(ho * 0.2) : yo + int(ho * 0.8), xo + int(wo * 0.2) : xo + int(wo * 0.8)]
                            if glass_roi.size > 0:
                                gray_glass = cv2.cvtColor(glass_roi, cv2.COLOR_BGR2GRAY)
                                lap = cv2.Laplacian(gray_glass, cv2.CV_64F)
                                crack_variance = float(lap.var())
                                card_patch = white_face[yo : yo + ho, xo : xo + wo]
                                white_pct = (float(np.count_nonzero(card_patch)) / float(card_patch.size)) if card_patch.size > 0 else 0.0
                                if crack_variance >= 380.0 and white_pct < 0.10:
                                    if is_simulation or self._can_emit("cursed_mirror_shattered", 30.0):
                                        events.append({
                                            "type": "cursed_hunt_trigger",
                                            "possession": "Haunted Mirror",
                                            "action": "mirror_shattered",
                                            "source": "cursed_possession_cv",
                                            "timestamp": round(now, 3),
                                            "confidence": 0.89,
                                            "detail": "Haunted Mirror shattered! Cursed Hunt triggered (+20s duration, 1s grace).",
                                            "duration_bump": 20.0,
                                        })
                                        return events

            # C) Music Box: Brass box with winding key and rotating cylinder
            brass_mask = cv2.inRange(hsv_hand, np.array([20, 110, 130]), np.array([36, 255, 255]))
            cnts_brass, _ = cv2.findContours(brass_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cb in cnts_brass:
                ab = cv2.contourArea(cb)
                if 3500 <= ab <= 60000:
                    xb, yb, wb, hb = cv2.boundingRect(cb)
                    if wb >= 60 and hb >= 60:
                        aspect_b = float(wb) / float(max(1, hb))
                        if 0.75 <= aspect_b <= 1.45:
                            cylinder_roi = hand_roi[yb + int(hb * 0.2) : yb + int(hb * 0.8), xb + int(wb * 0.2) : xb + int(wb * 0.8)]
                            if cylinder_roi.size > 0:
                                if is_simulation or self._can_emit("cursed_music_box", 30.0):
                                    events.append({
                                        "type": "cursed_hunt_trigger",
                                        "possession": "Music Box",
                                        "action": "music_box_hunt",
                                        "source": "cursed_possession_cv",
                                        "timestamp": round(now, 3),
                                        "confidence": 0.88,
                                        "detail": "Music Box ghost proximity triggered! Cursed Hunt triggered (+20s duration, 1s grace).",
                                        "duration_bump": 20.0,
                                    })
                                    return events

            # D) Monkey Paw: Dark fur paw with golden claws
            paw_fur = cv2.inRange(hsv_hand, np.array([10, 35, 25]), np.array([28, 180, 110]))
            golden_claws = cv2.inRange(hsv_hand, np.array([22, 130, 130]), np.array([38, 255, 255]))
            cnts_claws, _ = cv2.findContours(golden_claws, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            elongated_claws = [c for c in cnts_claws if cv2.contourArea(c) >= 50 and (cv2.boundingRect(c)[3] / float(max(1, cv2.boundingRect(c)[2]))) >= 1.6]
            if np.count_nonzero(paw_fur) >= 450 and len(elongated_claws) >= 3:
                if is_simulation or self._can_emit("cursed_monkey_paw", 25.0):
                    events.append({
                        "type": "cursed_possession_action",
                        "possession": "Monkey Paw",
                        "action": "wish_granted",
                        "source": "cursed_possession_cv",
                        "timestamp": round(now, 3),
                        "confidence": 0.86,
                        "detail": "Monkey Paw wish invoked! Finger curled.",
                    })
                    return events

            # E) Tortured Voodoo Doll: Burlap doll with center red heart pin
            burlap = cv2.inRange(hsv_hand, np.array([14, 45, 55]), np.array([28, 200, 160]))
            cnts_doll, _ = cv2.findContours(burlap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cd in cnts_doll:
                ad = cv2.contourArea(cd)
                if 700 <= ad <= 60000:
                    xd, yd, wd, hd = cv2.boundingRect(cd)
                    chest_roi = red_sigil[yd + int(hd * 0.35) : yd + int(hd * 0.65), xd + int(wd * 0.35) : xd + int(wd * 0.65)]
                    if chest_roi.size > 0 and np.count_nonzero(chest_roi) >= 18:
                        if is_simulation or self._can_emit("cursed_voodoo_heart", 30.0):
                            events.append({
                                "type": "cursed_hunt_trigger",
                                "possession": "Tortured Voodoo Doll",
                                "action": "heart_pin_forced",
                                "source": "cursed_possession_cv",
                                "timestamp": round(now, 3),
                                "confidence": 0.90,
                                "detail": "Voodoo Doll heart pin triggered! Cursed Hunt triggered (+20s duration, 1s grace).",
                                "duration_bump": 20.0,
                            })
                            return events

        # 2. Environmental / Floor Cursed Possessions (Summoning Circle, Ouija Board)
        if frame.size > 0:
            h_f, w_f = frame.shape[:2]
            floor_roi = frame[int(h_f * 0.30) : int(h_f * 0.94), int(w_f * 0.15) : int(w_f * 0.85)]
            if floor_roi.size > 0:
                hsv_floor = cv2.cvtColor(floor_roi, cv2.COLOR_BGR2HSV)

                # A) Summoning Circle: 5 red candles with active flame points
                red_c1 = cv2.inRange(hsv_floor, np.array([0, 145, 140]), np.array([10, 255, 255]))
                red_c2 = cv2.inRange(hsv_floor, np.array([170, 145, 140]), np.array([180, 255, 255]))
                red_candles = cv2.bitwise_or(red_c1, red_c2)
                flame_pts = cv2.inRange(hsv_floor, np.array([10, 160, 205]), np.array([28, 255, 255]))

                cnts_candles, _ = cv2.findContours(red_candles, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cnts_flames, _ = cv2.findContours(flame_pts, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                valid_flames = [c for c in cnts_flames if 8 <= cv2.contourArea(c) <= 650]
                if len(valid_flames) >= 5 and np.count_nonzero(red_candles) >= 300:
                    if is_simulation or self._can_emit("cursed_summoning_circle", 30.0):
                        events.append({
                            "type": "cursed_hunt_trigger",
                            "possession": "Summoning Circle",
                            "action": "circle_summoned",
                            "source": "cursed_possession_cv",
                            "timestamp": round(now, 3),
                            "confidence": 0.92,
                            "detail": "Summoning Circle 5th candle lit! Cursed Hunt triggered (+20s duration, 1s grace).",
                            "duration_bump": 20.0,
                        })
                        return events

                # B) Ouija Board: Wooden board with triangular planchette
                wood_board = cv2.inRange(hsv_floor, np.array([12, 70, 60]), np.array([28, 230, 200]))
                cnts_ouija, _ = cv2.findContours(wood_board, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for co in cnts_ouija:
                    ao = cv2.contourArea(co)
                    if 1200 <= ao <= 120000:
                        xo, yo, wo, ho = cv2.boundingRect(co)
                        aspect_w = float(wo) / float(max(1, ho))
                        if 1.15 <= aspect_w <= 2.2:
                            if is_simulation or self._can_emit("cursed_ouija", 30.0):
                                events.append({
                                    "type": "cursed_hunt_trigger",
                                    "possession": "Ouija Board",
                                    "action": "ouija_break",
                                    "source": "cursed_possession_cv",
                                    "timestamp": round(now, 3),
                                    "confidence": 0.89,
                                    "detail": "Ouija Board planchette shattered! Cursed Hunt triggered (+20s duration, 1s grace).",
                                    "duration_bump": 20.0,
                                })
                                return events

        return events

    def _detect_uv(
        self, roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects UV handprints on walls/doors/windows and UV footprints on the ground
        by finding glowing green fluorescent contours illuminated by a local purple/violet UV beam.
        Explicitly rejects D.O.T.S. laser matrices (many small green dots) and dark-blue room shadows."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        h, w = roi.shape[:2]
        total_px = max(1, h * w)

        # True Violet/Purple UV flashlight or glowstick beam (Hue 128..164, Sat >= 85, Val >= 42)
        # Excludes dark-blue unlit room shadows (Hue 100..124)
        uv_purple = cv2.inRange(hsv, np.array([128, 85, 42]), np.array([164, 255, 255]))
        # Glowing chartreuse/neon-green UV handprint or footprint (Hue 42..86, Sat >= 115, Val >= 105)
        neon_green = cv2.inRange(hsv, np.array([42, 115, 105]), np.array([86, 255, 255]))

        green_ratio = np.count_nonzero(neon_green) / total_px
        if green_ratio <= 0.0004 or green_ratio > 0.065:
            self.uv_streak = 0
            return events

        cnts, _ = cv2.findContours(neon_green, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # D.O.T.S. Projector Rejection: D.O.T.S. creates a grid of 10+ scattered green laser points.
        # A UV handprint or footprint is only 1 to 7 contiguous glowing shapes.
        small_dot_count = sum(1 for c in cnts if 3 <= cv2.contourArea(c) <= 90)
        if small_dot_count >= 9 or len(cnts) >= 12:
            self.uv_streak = 0
            return events

        uv_prints: List[Tuple[int, float, int, int, int, int, np.ndarray]] = []
        fingertip_pts: List[Tuple[int, float, float]] = []

        for idx, c in enumerate(cnts):
            area = cv2.contourArea(c)
            x, y, cw, ch = cv2.boundingRect(c)
            pad = 55
            nx1, ny1 = max(0, x - pad), max(0, y - pad)
            nx2, ny2 = min(w, x + cw + pad), min(h, y + ch + pad)
            local_purple = uv_purple[ny1:ny2, nx1:nx2]
            local_purple_ratio = np.count_nonzero(local_purple) / max(1, local_purple.size)
            if local_purple_ratio < 0.10:
                continue

            if 12 <= area <= 650:
                m = cv2.moments(c)
                if m["m00"] > 0:
                    fingertip_pts.append((idx, m["m10"] / m["m00"], m["m01"] / m["m00"]))

            if 110 <= area <= 24000:
                solidity = area / float(max(1, cw * ch))
                if solidity >= 0.22:
                    uv_prints.append((idx, area, x, y, cw, ch, c))

        uv_print_found = len(uv_prints) > 0
        salt_footprint_found = any(
            110 <= area <= 4500
            and (y + ch * 0.5) >= (h * 0.62)
            and (cw / float(max(ch, 1))) >= 1.25
            for _, area, x, y, cw, ch, _ in uv_prints
        )

        six_finger_found = False
        for pidx, area, px, py, pw, ph, pcnt in uv_prints:
            if 400 <= area <= 18000:
                nearby_tips = [
                    (fx, fy)
                    for fidx, fx, fy in fingertip_pts
                    if fidx != pidx
                    and (px - 65) <= fx <= (px + pw + 65)
                    and (py - 95) <= fy <= (py + 15)
                ]
                if len(nearby_tips) >= 6:
                    six_finger_found = True
                    break
            if area >= 2200:
                try:
                    hull = cv2.convexHull(pcnt, returnPoints=False)
                    if hull is not None and len(hull) >= 4:
                        defects = cv2.convexityDefects(pcnt, hull)
                        if defects is not None and defects.size >= 4:
                            deep_defects = sum(
                                1
                                for d in defects.reshape(-1, 4)
                                if (float(d[3]) / 256.0) >= 6.0
                            )
                            if deep_defects >= 5:
                                six_finger_found = True
                                break
                except cv2.error:
                    pass

        if uv_print_found:
            self.uv_streak += 1
            if is_simulation:
                conf = 0.88
            else:
                # Start as Suspected (78%), only auto-confirm (88%) if sustained for 3+ consecutive captures
                conf = 0.88 if self.uv_streak >= 3 else 0.78
            if is_simulation or self._can_emit("uv_cv", 6.5):
                events.append(
                    {
                        "type": "evidence",
                        "source": "uv_fluorescence_cv",
                        "evidence": "Ultraviolet",
                        "state": "confirmed" if conf >= 0.85 else "suspected",
                        "confidence": conf,
                        "detail": "UV fluorescent handprint/footprint detected on surface",
                    }
                )
            if salt_footprint_found and (
                is_simulation or self._can_emit("salt_stepped_cv", 12.0)
            ):
                events.append(
                    {
                        "type": "ghost_behavior",
                        "source": "uv_salt_footprint_cv",
                        "behavior_id": "salt_stepped",
                        "confidence": 0.88,
                        "detail": "UV footprint in salt detected on floor (rules out Wraith)",
                    }
                )
            if six_finger_found and (
                is_simulation or self._can_emit("obake_six_finger_cv", 15.0)
            ):
                events.append(
                    {
                        "type": "ghost_behavior",
                        "source": "obake_six_finger_cv",
                        "ghost": "Obake",
                        "behavior_id": "obake_six_finger",
                        "confidence": 0.92,
                        "detail": "6-finger UV handprint detected! (Obake / The Mimic)",
                    }
                )
        else:
            self.uv_streak = 0
        return events

    def _detect_ghost_orbs(
        self, roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        # Fast gray & luminance gate: reject bright/daylight rooms before doing HSV conversion
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        mean_lum = float(np.mean(gray))
        if mean_lum > 95:
            return events

        # Orbs only appear on monochrome / low-saturation Night Vision feeds (mean_sat < 70, mean_lum < 95)
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        mean_sat = float(np.mean(hsv[:, :, 1]))
        if mean_sat > 70:
            return events

        # Flashlight beam rejection: In dark rooms, a flashlight casts a large illuminated cone
        # (> 3500 pixels with lum > 130). Real Ghost Orbs are strictly invisible in visible flashlight light.
        if int(np.count_nonzero(gray > 130)) > 3500:
            return events

        _, thresh = cv2.threshold(gray, 235, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # If there are many bright contours (e.g. text characters or room lights), it's not an isolated Ghost Orb
        if len(contours) > 3:
            return events

        candidate_centroids: List[Tuple[float, float]] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 18 <= area <= 180:
                perim = cv2.arcLength(cnt, True)
                if perim > 0:
                    circularity = 4 * np.pi * area / (perim * perim)
                    if circularity >= 0.78:
                        m = cv2.moments(cnt)
                        if m["m00"] > 0:
                            cx = m["m10"] / m["m00"]
                            cy = m["m01"] / m["m00"]

                            # Annulus local contrast test:
                            # A real Ghost Orb floats in dark air (annulus lum <= 85).
                            # A specular reflection on a door/wall illuminated by a flashlight has bright surroundings (> 100).
                            y_min, y_max = max(0, int(cy - 18)), min(gray.shape[0], int(cy + 19))
                            x_min, x_max = max(0, int(cx - 18)), min(gray.shape[1], int(cx + 19))
                            patch = gray[y_min:y_max, x_min:x_max]
                            py_ind, px_ind = np.ogrid[y_min - cy : y_max - cy, x_min - cx : x_max - cx]
                            r_sq = px_ind**2 + py_ind**2
                            annulus = (r_sq >= 100) & (r_sq <= 324)
                            annulus_lum = float(np.mean(patch[annulus])) if np.any(annulus) else 255.0
                            if annulus_lum > 88.0:
                                continue  # Flashlight specular reflection on a surface, not an orb!

                            candidate_centroids.append((cx, cy))

        now = time.time()
        self.orb_tracks = [
            (px, py, pt) for (px, py, pt) in self.orb_tracks if (now - pt) <= 2.5
        ]

        matched_moving_track = False
        for cx, cy in candidate_centroids:
            for px, py, pt in self.orb_tracks:
                dt = now - pt
                dist = math.hypot(cx - px, cy - py)
                if 0.08 <= dt <= 2.5 and 2.0 <= dist <= 65.0:
                    matched_moving_track = True
                    break
            if matched_moving_track:
                break

        for cx, cy in candidate_centroids:
            self.orb_tracks.append((cx, cy, now))
        self.orb_tracks = self.orb_tracks[-24:]

        if 1 <= len(candidate_centroids) <= 2:
            conf = 0.86 if is_simulation else (0.88 if matched_moving_track else 0.75)
            cd_key = "orb_cv_confirmed" if matched_moving_track else "orb_cv"
            if is_simulation or self._can_emit(cd_key, 9.0):
                if matched_moving_track:
                    self.cooldowns["orb_cv"] = now
                events.append(
                    {
                        "type": "evidence",
                        "source": "nightvision_orb_tracker",
                        "evidence": "Ghost Orb",
                        "state": "confirmed" if conf >= 0.85 else "suspected",
                        "confidence": conf,
                        "detail": (
                            "Night-vision drifting Ghost Orb track confirmed (Check for The Mimic!)"
                            if matched_moving_track
                            else "Night-vision floating Ghost Orb particle detected (Check for The Mimic!)"
                        ),
                    }
                )
        return events

    def _detect_dots(
        self, roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        # Fast rejection: green laser dots require bright pixels (np.max >= 140)
        if not is_simulation and np.max(roi) < 140:
            self.prev_dots_gray = None
            return events

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        dots_green = cv2.inRange(hsv, np.array([54, 150, 150]), np.array([82, 255, 255]))
        green_ratio = np.count_nonzero(dots_green) / max(1, roi.shape[0] * roi.shape[1])

        # Skip expensive 2D FFT Phase Correlation entirely if D.O.T.S. lasers are not present
        min_green = 0.06 if is_simulation else 0.085
        if green_ratio < min_green:
            self.prev_dots_gray = None
            return events

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray_small = cv2.resize(gray, (160, 120))

        motion_score = 0.0
        if self.prev_dots_gray is not None and self.prev_dots_gray.shape == gray_small.shape:
            # Estimate global camera pan / ego-motion and subtract it before computing D.O.T.S motion
            shift, _ = cv2.phaseCorrelate(
                np.float32(self.prev_dots_gray), np.float32(gray_small)
            )
            dx, dy = float(shift[0]), float(shift[1])
            ego_shift = math.hypot(dx, dy)
            if ego_shift > 28.0 and not is_simulation:
                self.prev_dots_gray = gray_small
                return events
            if ego_shift >= 0.5:
                warp_mat = np.float32([[1.0, 0.0, dx], [0.0, 1.0, dy]])
                aligned_prev = cv2.warpAffine(
                    self.prev_dots_gray,
                    warp_mat,
                    (gray_small.shape[1], gray_small.shape[0]),
                    borderMode=cv2.BORDER_REPLICATE,
                )
            else:
                aligned_prev = self.prev_dots_gray
            diff = cv2.absdiff(gray_small, aligned_prev)
            motion_score = float(np.mean(diff > 32))
        self.prev_dots_gray = gray_small

        if (green_ratio > 0.085 and 0.025 < motion_score < 0.25) or (
            is_simulation and green_ratio > 0.06
        ):
            conf = 0.77 if not is_simulation else 0.87
            if is_simulation or self._can_emit("dots_cv", 9.0):
                events.append(
                    {
                        "type": "evidence",
                        "source": "dots_silhouette_cv",
                        "evidence": "D.O.T.S Projector",
                        "state": "confirmed" if conf >= 0.85 else "suspected",
                        "confidence": conf,
                        "detail": "D.O.T.S. Projector laser silhouette motion detected",
                    }
                )
        return events

    def _detect_ghost_writing(
        self, roi: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Detects Ghost Writing inside an open parchment Ghost Writing Book in the lower center viewport."""
        events: List[Dict[str, Any]] = []
        if roi.size == 0:
            return events

        h, w = roi.shape[:2]
        book_zone = roi[int(h * 0.35) :, :]
        if book_zone.size == 0:
            return events

        # Fast rejection: bright parchment paper requires bright pixels (np.max >= 140)
        if not is_simulation and np.max(book_zone) < 140:
            self.writing_streak = 0
            return events

        hsv_zone = cv2.cvtColor(book_zone, cv2.COLOR_BGR2HSV)
        gray_zone = cv2.cvtColor(book_zone, cv2.COLOR_BGR2GRAY)
        parchment = cv2.inRange(hsv_zone, np.array([10, 8, 145]), np.array([38, 95, 250]))
        cnts, _ = cv2.findContours(parchment, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        writing_found = False
        for c in cnts:
            area = cv2.contourArea(c)
            if 3500 <= area <= 65000:
                x, y, cw, ch = cv2.boundingRect(c)
                rect_area = cw * ch
                # Open book rectangularity: two rectangular pages have high rectangularity
                if (area / float(max(1, rect_area))) < 0.65:
                    continue

                aspect = cw / float(max(ch, 1))
                if cw >= 40 and ch >= 25 and 1.2 <= aspect <= 2.9:
                    left_page = gray_zone[
                        y + int(ch * 0.15) : y + int(ch * 0.85),
                        x + int(cw * 0.12) : x + int(cw * 0.46),
                    ]
                    right_page = gray_zone[
                        y + int(ch * 0.15) : y + int(ch * 0.85),
                        x + int(cw * 0.54) : x + int(cw * 0.88),
                    ]
                    if left_page.size == 0 or right_page.size == 0:
                        continue

                    # Central spine crease test:
                    # In an open Ghost Writing book, a dark central spine crease line divides the two pages.
                    # A flashlight pool or continuous wooden floor has no dark center spine line!
                    mid_x = x + cw // 2
                    spine_stripe = gray_zone[
                        y + int(ch * 0.15) : y + int(ch * 0.85),
                        max(0, mid_x - 3) : min(gray_zone.shape[1], mid_x + 3),
                    ]
                    if spine_stripe.size == 0:
                        continue
                    spine_median = float(np.median(spine_stripe))
                    page_median = (float(np.median(left_page)) + float(np.median(right_page))) / 2.0
                    if spine_median > (page_median * 0.88):
                        continue

                    l_thresh = max(35.0, float(np.median(left_page)) * 0.60)
                    r_thresh = max(35.0, float(np.median(right_page)) * 0.60)
                    l_ink = (left_page < l_thresh).astype(np.uint8) * 255
                    r_ink = (right_page < r_thresh).astype(np.uint8) * 255
                    left_ink_ratio = float(np.count_nonzero(l_ink)) / float(l_ink.size)
                    right_ink_ratio = float(np.count_nonzero(r_ink)) / float(r_ink.size)
                    if 0.035 <= left_ink_ratio <= 0.30 and 0.035 <= right_ink_ratio <= 0.30:
                        l_cnts, _ = cv2.findContours(
                            l_ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                        )
                        r_cnts, _ = cv2.findContours(
                            r_ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                        )
                        if (len(l_cnts) + len(r_cnts)) >= 6:
                            writing_found = True
                            break

        if writing_found:
            self.writing_streak += 1
            min_streak = 1 if is_simulation else (4 if self.camera_moving else 3)
            if self.writing_streak >= min_streak:
                conf = 0.86 if (is_simulation or self.writing_streak >= (min_streak + 1)) else 0.78
                if is_simulation or self._can_emit("ghost_writing_cv", 9.0):
                    events.append(
                        {
                            "type": "evidence",
                            "source": "ghost_writing_cv",
                            "evidence": "Ghost Writing",
                            "state": "confirmed" if conf >= 0.85 else "suspected",
                            "confidence": conf,
                            "detail": "Ghost Writing ink scribbles detected inside open book",
                        }
                    )
        else:
            self.writing_streak = 0
        return events

    def _detect_hunt_blink(
        self, roi: np.ndarray, hunt_active: bool, is_simulation: bool = False
    ) -> List[Dict[str, Any]]:
        """Samples center-viewport silhouette visibility across a hunt to distinguish
        mostly-visible Oni/Deogen blinks from long-invisible Phantom blinks."""
        events: List[Dict[str, Any]] = []
        if not hunt_active or roi.size == 0:
            self.hunt_blink_samples.clear()
            return events

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        y1, y2 = int(h * 0.15), int(h * 0.85)
        center_strip = gray[y1:y2, int(w * 0.35) : int(w * 0.65)]
        left_strip = gray[y1:y2, int(w * 0.05) : int(w * 0.25)]
        right_strip = gray[y1:y2, int(w * 0.75) : int(w * 0.95)]
        if center_strip.size == 0 or left_strip.size == 0 or right_strip.size == 0:
            return events

        bg_mean = 0.5 * (float(np.mean(left_strip)) + float(np.mean(right_strip)))
        center_mean = float(np.mean(center_strip))
        edge_score = float(np.mean(cv2.Canny(center_strip, 45, 130)))
        is_vis = abs(center_mean - bg_mean) >= 18.0 or edge_score >= 12.0

        now = time.time()
        self.hunt_blink_samples = [
            (ts, vis) for (ts, vis) in self.hunt_blink_samples if (now - ts) <= 4.5
        ]
        self.hunt_blink_samples.append((now, is_vis))

        if len(self.hunt_blink_samples) >= 8:
            vis_count = sum(1 for _, vis in self.hunt_blink_samples if vis)
            vis_ratio = vis_count / float(len(self.hunt_blink_samples))
            max_invis_run = 0
            cur_invis = 0
            for _, vis in self.hunt_blink_samples:
                if not vis:
                    cur_invis += 1
                    if cur_invis > max_invis_run:
                        max_invis_run = cur_invis
                else:
                    cur_invis = 0

            if vis_ratio >= 0.62 and (is_simulation or self._can_emit("blink_oni_cv", 15.0)):
                events.append(
                    {
                        "type": "ghost_behavior",
                        "source": "hunt_blink_cv",
                        "ghost": "Oni",
                        "behavior_id": "blink_oni",
                        "confidence": 0.85,
                        "detail": f"Hunt blink duty cycle {int(round(vis_ratio * 100))}% visible (Oni/Deogen pattern, rules out Phantom)",
                    }
                )
            elif (
                vis_ratio <= 0.28
                and max_invis_run >= 4
                and (is_simulation or self._can_emit("blink_phantom_cv", 15.0))
            ):
                events.append(
                    {
                        "type": "ghost_behavior",
                        "source": "hunt_blink_cv",
                        "ghost": "Phantom",
                        "behavior_id": "blink_phantom",
                        "confidence": 0.85,
                        "detail": f"Long invisible hunt blink gaps ({max_invis_run} frames invisible, rules out Oni/Deogen)",
                    }
                )
        return events

    def _detect_truck_activity_board(
        self, frame: np.ndarray, is_simulation: bool
    ) -> List[Dict[str, Any]]:
        """Analyzes the Truck Activity Monitor red polyline for +5 EMF jumps and Twins double-kinks."""
        events: List[Dict[str, Any]] = []
        if frame.size == 0:
            return events

        h, w = frame.shape[:2]
        board = frame[int(h * 0.12) : int(h * 0.65), int(w * 0.18) : int(w * 0.82)]
        if board.size == 0:
            return events

        gray_board = cv2.cvtColor(board, cv2.COLOR_BGR2GRAY)
        if float(np.mean(gray_board)) > 75.0:
            return events

        hsv_board = cv2.cvtColor(board, cv2.COLOR_BGR2HSV)
        r1 = cv2.inRange(hsv_board, np.array([0, 150, 160]), np.array([8, 255, 255]))
        r2 = cv2.inRange(hsv_board, np.array([172, 150, 160]), np.array([180, 255, 255]))
        red_mask = cv2.bitwise_or(r1, r2)
        red_px = int(np.count_nonzero(red_mask))
        if red_px < 120 or red_px > 6500:
            return events

        bh, bw = red_mask.shape[:2]
        col_pts: List[Tuple[int, float]] = []
        for col in range(bw):
            ys = np.where(red_mask[:, col] > 0)[0]
            if 1 <= ys.size <= 24:
                col_pts.append((col, float(np.median(ys))))

        if len(col_pts) < 90:
            return events

        self.last_truck_seen_ts = time.time()

        # Keep the longest horizontally contiguous trace
        runs: List[List[Tuple[int, float]]] = [[col_pts[0]]]
        for pt in col_pts[1:]:
            if pt[0] - runs[-1][-1][0] <= 8:
                runs[-1].append(pt)
            else:
                runs.append([pt])
        trace = max(runs, key=lambda r: r[-1][0] - r[0][0])
        if len(trace) < 90 or (trace[-1][0] - trace[0][0]) < 120:
            return events

        xs = np.array([p[0] for p in trace], dtype=np.float32)
        ys_trace = np.array([p[1] for p in trace], dtype=np.float32)

        # Compute upward step height dy across an ~8-column window (positive dy = jump UP on monitor)
        step_candidates: List[Tuple[int, int, float]] = []  # (i, j, dy)
        j = 0
        for i in range(len(xs)):
            while j + 1 < len(xs) and (xs[j] - xs[i]) < 8.0:
                j += 1
            dx = xs[j] - xs[i]
            if 6.0 <= dx <= 12.0:
                dy = float(ys_trace[i] - ys_trace[j])
                if dy >= 16.0:
                    step_candidates.append((i, j, dy))

        # Non-maximum clustering: merge adjacent columns belonging to the same step edge
        peaks: List[Tuple[int, int, float]] = []
        for cand in step_candidates:
            if not peaks or (xs[cand[0]] - xs[peaks[-1][0]]) >= 12.0:
                peaks.append(cand)
            elif cand[2] > peaks[-1][2]:
                peaks[-1] = cand

        # A) Double-slope Twins kink: two 16..42px jumps separated by a short 12..48col plateau
        for p_idx in range(len(peaks) - 1):
            i1, j1, dy1 = peaks[p_idx]
            i2, _, dy2 = peaks[p_idx + 1]
            gap_cols = float(xs[i2] - xs[j1])
            if 16.0 <= dy1 <= 42.0 and 16.0 <= dy2 <= 42.0 and 12.0 <= gap_cols <= 48.0:
                mid_vals = ys_trace[j1 : i2 + 1]
                if mid_vals.size >= 4 and float(np.std(mid_vals)) <= 2.5:
                    if is_simulation or self._can_emit("truck_twins_cv", 12.0):
                        events.append(
                            {
                                "type": "ghost_behavior",
                                "source": "truck_activity_cv",
                                "ghost": "The Twins",
                                "behavior_id": "twins_double",
                                "confidence": 0.82,
                                "detail": "Truck Activity Graph showed a Twins double-slope step jump",
                            }
                        )
                    return events

        # B) Clean +5 EMF jump: single large 45..95px upward step between flat plateaus
        for i1, j1, dy in peaks:
            if 45.0 <= dy <= 95.0 and i1 >= 20 and (len(ys_trace) - j1) >= 20:
                before_std = float(np.std(ys_trace[max(0, i1 - 24) : i1 + 1]))
                after_std = float(np.std(ys_trace[j1 : min(len(ys_trace), j1 + 24)]))
                if before_std <= 2.5 and after_std <= 2.5:
                    if is_simulation or self._can_emit("truck_emf5_cv", 10.0):
                        events.append(
                            {
                                "type": "evidence",
                                "source": "truck_activity_cv",
                                "evidence": "EMF Level 5",
                                "state": "suspected",
                                "confidence": 0.78,
                                "detail": "Truck Activity Monitor +5 clean step jump detected (Suspected EMF 5)",
                            }
                        )
                    break

        return events
