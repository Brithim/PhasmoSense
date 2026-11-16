import json
import os
from pathlib import Path
from typing import Dict, Any

CONFIG_PATH = Path(__file__).parent / "user_config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "monitor_index": 1,
    "capture_fps": 8,
    "temperature_unit": "C",  # "C" or "F"
    "equipment_tiers": {
        "emf": 3,          # 1, 2, or 3
        "thermometer": 3,  # 1, 2, or 3
        "spirit_box": 3,   # 1, 2, or 3
        "uv": 3,           # 1, 2, or 3
        "dots": 3,         # 1, 2, or 3
        "video_cam": 3     # 1, 2, or 3
    },
    "difficulty": {
        "preset_name": "Professional",
        "evidence_count": 3,        # 0, 1, 2, or 3
        "ghost_speed_multiplier": 1.0,  # 0.5, 0.75, 1.0, 1.25, 1.5
        "sanity_pill_restore": 25
    },
    "confidence_thresholds": {
        "auto_apply": 0.85,
        "suspected": 0.52
    },
    "detectors_enabled": {
        "vision_engine_enabled": True,
        "audio_engine_enabled": True,
        "phasmophobia_audio_only": True,
        "journal_ocr": True,
        "truck_sanity_ocr": True,
        "equipment_cv": True,
        "environmental_cv": True,
        "audio_footsteps": True,
        "audio_equipment": True,
        "audio_ghost_signatures": True,
        "voice_isolation": True,
        "ignore_player_wasd_steps": True,
        "auto_reset_lobby": True
    },
    # Normalized ROI regions (x, y, w, h in 0.0..1.0 central 16:9 coordinates)
    "rois": {
        "equipment_hand": {"x": 0.42, "y": 0.42, "w": 0.50, "h": 0.52},
        "center_viewport": {"x": 0.22, "y": 0.18, "w": 0.56, "h": 0.64},
        "journal_page": {"x": 0.18, "y": 0.10, "w": 0.64, "h": 0.80},
        "truck_sanity": {"x": 0.15, "y": 0.15, "w": 0.70, "h": 0.70}
    },
    "hotkeys": {
        "toggle_overlay": "Alt+Q",
        "undo_detection": "Alt+Z",
        "toggle_smudge_timer": "Alt+S",
        "toggle_objectives": "Alt+O",
        "toggle_hud_layout": "Alt+L",
        "toggle_audio": "Alt+M",
        "toggle_vision": "Alt+V",
        "tap_bpm": "Alt+B",
        "reset_match": "Alt+R"
    },
    "hud_position": "top-right",  # "top-right", "top-left", "bottom-right", "bottom-left"
    "theme": "modern",           # "modern", "journal", "crt", "oled"
    "accent_color": "sky",        # "sky", "cyan", "emerald", "violet", "amber", "crimson"
    "hud_layout": "vertical",     # "vertical" or "horizontal"
    "ui_scale": 1.0,              # 0.75 .. 1.50
    "hud_opacity": 0.88,          # 0.40 .. 1.0
    "crt_scanlines": True,
    "ui_sound": True,
    "streamer_mode": False,
    "chroma_key": False,
    "target_display": 0
}


class ConfigManager:
    def __init__(self) -> None:
        self.config: Dict[str, Any] = self._load()

    def _load(self) -> Dict[str, Any]:
        if CONFIG_PATH.exists():
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                merged = json.loads(json.dumps(DEFAULT_CONFIG))
                self._deep_update(merged, saved)
                return merged
            except Exception:
                pass
        return json.loads(json.dumps(DEFAULT_CONFIG))

    def _deep_update(self, target: Dict[str, Any], src: Dict[str, Any]) -> None:
        for k, v in src.items():
            if isinstance(v, dict) and isinstance(target.get(k), dict):
                self._deep_update(target[k], v)
            else:
                target[k] = v

    def save(self) -> None:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(self.config, f, indent=2)

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._deep_update(self.config, patch)
        self.save()
        return self.config
