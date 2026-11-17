import time
from typing import Any, Dict, List, Optional, Tuple


class GhostAdvisor:
    """Intelligent passive-trait ghost behavior analyzer for Phasmophobia.
    Correlates acoustic telemetry (footstep BPM, LoS acceleration), visual OCR/CV
    (room temp, salt piles, light switch state, smudge timing, hunt gaps), and
    maintains multi-round history to deduce high-confidence ghost identities."""

    def __init__(self, config_manager: Any) -> None:
        self.config_manager = config_manager
        # Multi-hunt speed history: [{"hunt_id": 1, "avg_speed": 2.75, "ts": 123.4}, ...]
        self.hunt_history: List[Dict[str, Any]] = []
        self.current_hunt_id: int = 0
        self.last_hunt_end_ts: float = 0.0
        self.last_smudge_ts: float = 0.0
        self.last_salt_step_ts: float = 0.0
        self.uv_scanned_after_salt: bool = False
        self.last_light_on_ts: float = 0.0
        self.current_room_temp: float = 18.0
        self.cooldowns: Dict[str, float] = {}

    def _can_emit(self, key: str, cd: float) -> bool:
        now = time.time()
        if now - self.cooldowns.get(key, 0.0) >= cd:
            self.cooldowns[key] = now
            return True
        return False

    def on_hunt_start(self, is_cursed: bool = False) -> List[Dict[str, Any]]:
        """Evaluates hunt start timing relative to previous hunt and smudge timers."""
        events: List[Dict[str, Any]] = []
        now = time.time()
        self.current_hunt_id += 1

        # 1. Demon 20-second Hunt Cooldown Check (Standard minimum cooldown is 25s)
        if self.last_hunt_end_ts > 0:
            hunt_gap = now - self.last_hunt_end_ts
            if 19.5 <= hunt_gap <= 24.5 and not is_cursed:
                if self._can_emit("demon_cooldown", 40.0):
                    events.append({
                        "type": "advisor_trait",
                        "ghost": "Demon",
                        "trait_id": "demon_cooldown",
                        "badge": "⏱️ Demon: 20s Cooldown",
                        "title": "Demon 20-Second Hunt Cooldown",
                        "confidence": 0.94,
                        "reasoning": f"Hunt started {hunt_gap:.1f}s after previous hunt ended. Standard minimum cooldown is 25s; only Demon can hunt at 20s.",
                        "suggested_action": "confirm",
                    })

        # 2. Demon 60-second Smudge Check (Standard smudge prevents hunts for 90s)
        if self.last_smudge_ts > 0:
            smudge_gap = now - self.last_smudge_ts
            if 59.0 <= smudge_gap <= 88.5 and not is_cursed:
                if self._can_emit("demon_smudge", 40.0):
                    events.append({
                        "type": "advisor_trait",
                        "ghost": "Demon",
                        "trait_id": "demon_smudge",
                        "badge": "🔥 Demon: 60s Smudge Window",
                        "title": "Demon 60s Smudge Block Expired",
                        "confidence": 0.92,
                        "reasoning": f"Hunt started {smudge_gap:.1f}s after Incense smudge. Standard smudge duration is 90s; only Demon has a 60s smudge window.",
                        "suggested_action": "confirm",
                    })

        return events

    def on_hunt_end(self, hunt_speeds: List[float]) -> List[Dict[str, Any]]:
        """Evaluates average hunt speed upon hunt completion to detect Thaye aging decay."""
        events: List[Dict[str, Any]] = []
        now = time.time()
        self.last_hunt_end_ts = now

        if hunt_speeds:
            avg_speed = float(sum(hunt_speeds) / len(hunt_speeds))
            self.hunt_history.append({
                "hunt_id": self.current_hunt_id,
                "avg_speed": round(avg_speed, 2),
                "ts": now,
            })

            # Thaye Aging Detection:
            # An active Thaye begins very fast (~2.75 m/s) and gradually ages down toward 1.0 m/s
            # If speed drops by >= 0.35 m/s compared to the initial recorded hunt
            if len(self.hunt_history) >= 2:
                early_speed = self.hunt_history[0]["avg_speed"]
                latest_speed = self.hunt_history[-1]["avg_speed"]
                speed_drop = early_speed - latest_speed

                if early_speed >= 2.10 and speed_drop >= 0.35:
                    if self._can_emit("thaye_aging", 30.0):
                        events.append({
                            "type": "advisor_trait",
                            "ghost": "Thaye",
                            "trait_id": "thaye_aging",
                            "badge": f"⚡ Thaye: -{speed_drop:.2f} m/s Decay",
                            "title": "Thaye Aging Decay Observed",
                            "confidence": 0.90,
                            "reasoning": f"Ghost average speed decayed from {early_speed:.2f} m/s in early hunt to {latest_speed:.2f} m/s (-{speed_drop:.2f} m/s). Characteristic of Thaye aging near players.",
                            "suggested_action": "confirm",
                        })

        return events

    def on_temperature_update(self, temp_c: float) -> None:
        self.current_room_temp = temp_c

    def on_footstep_speed(self, speed_mps: float, los_accel: bool) -> List[Dict[str, Any]]:
        """Evaluates Hantu cold acceleration when ghost is fast without Line of Sight in freezing rooms."""
        events: List[Dict[str, Any]] = []
        if speed_mps >= 2.20 and not los_accel and self.current_room_temp <= 3.0:
            if self._can_emit("hantu_cold_accel", 25.0):
                events.append({
                    "type": "advisor_trait",
                    "ghost": "Hantu",
                    "trait_id": "hantu_cold_accel",
                    "badge": "❄️ Hantu: Cold Acceleration",
                    "title": "Hantu Cold-Room Acceleration",
                    "confidence": 0.88,
                    "reasoning": f"Ghost clocked at {speed_mps:.2f} m/s in freezing/cold room ({self.current_room_temp:.1f}°C) with zero Line of Sight acceleration. Signature Hantu cold sprint.",
                    "suggested_action": "confirm",
                })
        return events

    def on_salt_stepped(self) -> None:
        self.last_salt_step_ts = time.time()
        self.uv_scanned_after_salt = False

    def on_uv_footprint_seen(self) -> None:
        # A footprint was seen, ruling out Wraith
        self.last_salt_step_ts = 0.0

    def check_wraith_salt(self, uv_active: bool) -> List[Dict[str, Any]]:
        """If salt was stepped on and player actively scans ground with UV for > 8s with 0 footprints, flag Wraith."""
        events: List[Dict[str, Any]] = []
        now = time.time()
        if self.last_salt_step_ts > 0:
            dt = now - self.last_salt_step_ts
            if uv_active and dt >= 8.0 and dt <= 30.0:
                if self._can_emit("wraith_salt", 35.0):
                    events.append({
                        "type": "advisor_trait",
                        "ghost": "Wraith",
                        "trait_id": "wraith_salt_immunity",
                        "badge": "🧂 Wraith: Salt Footprint Immunity",
                        "title": "Wraith Salt Step Immunity",
                        "confidence": 0.91,
                        "reasoning": "Ghost stepped in salt, but 0 UV fluorescent footprints appeared on the floor after multiple scans. Wraiths never leave footprints in salt.",
                        "suggested_action": "confirm",
                    })
                    self.last_salt_step_ts = 0.0
        return events

    def on_light_switched(self, turned_on: bool) -> List[Dict[str, Any]]:
        """Detects Mare immediate light switch turn-off (< 0.4s)."""
        events: List[Dict[str, Any]] = []
        now = time.time()
        if turned_on:
            self.last_light_on_ts = now
        else:
            if self.last_light_on_ts > 0:
                diff = now - self.last_light_on_ts
                if 0.08 <= diff <= 0.45:
                    if self._can_emit("mare_lightswitch", 20.0):
                        events.append({
                            "type": "advisor_trait",
                            "ghost": "Mare",
                            "trait_id": "mare_lightswitch",
                            "badge": "💡 Mare: Instant Lightswitch Rejection",
                            "title": "Mare Light Switch Rejection",
                            "confidence": 0.86,
                            "reasoning": f"Room light switch was instantly flipped back off ({diff*1000:.0f}ms after being turned on). Rare, characteristic Mare ability.",
                            "suggested_action": "confirm",
                        })
                self.last_light_on_ts = 0.0
        return events

    def on_smudge_ignited(self) -> None:
        self.last_smudge_ts = time.time()
