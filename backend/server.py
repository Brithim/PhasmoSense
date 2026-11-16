import asyncio
import ctypes
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure runtime directory and DLLs folder are in Windows DLL search path (Python 3.8+)
if hasattr(os, "add_dll_directory"):
    try:
        py_dir = Path(sys.executable).parent
        os.add_dll_directory(str(py_dir))
        dll_sub = py_dir / "DLLs"
        if dll_sub.exists():
            os.add_dll_directory(str(dll_sub))
    except Exception:
        pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

try:
    from config import ConfigManager
    from vision_engine import VisionEngine
    from audio_engine import AudioEngine
    from simulator import SimulationDeck
    import database

    config_manager = ConfigManager()
    vision_engine = VisionEngine(config_manager)
    audio_engine = AudioEngine(config_manager)
except Exception as exc:
    import traceback
    err_text = traceback.format_exc()
    print(f"[FATAL STARTUP ERROR] {err_text}", file=sys.stderr, flush=True)
    try:
        with open(Path(__file__).parent / "backend_crash.log", "w", encoding="utf-8") as f:
            f.write(err_text)
    except Exception:
        pass
    raise
connected_clients: Set[WebSocket] = set()
preview_subscribers: Set[WebSocket] = set()
bg_task: asyncio.Task | None = None
hk_task: asyncio.Task | None = None

SPECIAL_VK_MAP: Dict[str, List[int]] = {
    ".": [0xBE, 0x6E],  # OEM Period and Numpad Decimal
    ",": [0xBC],
    "/": [0xBF, 0x6F],
    ";": [0xBA],
    "'": [0xDE],
    "[": [0xDB],
    "]": [0xDD],
    "\\": [0xDC],
    "-": [0xBD, 0x6D],
    "=": [0xBB, 0x6B],
    "`": [0xC0],
    "~": [0xC0],
    "SPACE": [0x20],
    "TAB": [0x09],
    "BACKSPACE": [0x08],
    "ENTER": [0x0D],
}


def parse_combo_to_vks(combo: str) -> Tuple[List[int], List[int]]:
    """Returns (modifier_vks, main_key_vks) for a hotkey string like 'Alt+Q' or '.'."""
    if not combo:
        return ([], [])
    parts = [p.strip() for p in combo.split("+") if p.strip()]
    mods: List[int] = []
    main_vks: List[int] = []
    for p in parts:
        up = p.upper()
        if up in ("ALT", "MENU"):
            mods.append(0x12)  # VK_MENU
        elif up in ("CTRL", "CONTROL"):
            mods.append(0x11)  # VK_CONTROL
        elif up == "SHIFT":
            mods.append(0x10)  # VK_SHIFT
        elif up in SPECIAL_VK_MAP:
            main_vks = SPECIAL_VK_MAP[up]
        elif up.startswith("F") and up[1:].isdigit():
            fn = int(up[1:])
            if 1 <= fn <= 12:
                main_vks = [0x70 + fn - 1]
        elif len(up) == 1 and ("A" <= up <= "Z" or "0" <= up <= "9"):
            main_vks = [ord(up)]
    return (mods, main_vks)


async def hotkey_poller_loop() -> None:
    """Polls Win32 GetAsyncKeyState at 25Hz so even single-key binds like '.' work inside DirectX/Unity games."""
    prev_pressed: Dict[str, bool] = {}
    user32 = ctypes.windll.user32
    while True:
        try:
            hotkeys = config_manager.config.get("hotkeys", {})
            for action_name, combo_str in hotkeys.items():
                mods, main_vks = parse_combo_to_vks(str(combo_str))
                if not main_vks:
                    continue
                mods_ok = all(bool(user32.GetAsyncKeyState(m) & 0x8000) for m in mods)
                # If no modifiers are required for this hotkey, ensure Alt/Ctrl aren't held down
                if not mods:
                    if (user32.GetAsyncKeyState(0x12) & 0x8000) or (
                        user32.GetAsyncKeyState(0x11) & 0x8000
                    ):
                        mods_ok = False
                main_down = any(bool(user32.GetAsyncKeyState(vk) & 0x8000) for vk in main_vks)
                is_active = mods_ok and main_down
                was_active = prev_pressed.get(action_name, False)
                prev_pressed[action_name] = is_active
                if is_active and not was_active:
                    await broadcast({"kind": "hotkey", "action": action_name})
        except Exception:
            pass
        await asyncio.sleep(0.04)


async def broadcast(payload: Dict[str, Any]) -> None:
    if not connected_clients:
        return
    dead: List[WebSocket] = []
    msg = json.dumps(payload)
    for ws in list(connected_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.discard(ws)
        preview_subscribers.discard(ws)
    if not preview_subscribers:
        vision_engine.preview_enabled = False


async def telemetry_and_vision_loop() -> None:
    audio_engine.start()
    last_capture = 0.0
    while True:
        try:
            loop_start = time.time()
            cfg = config_manager.config
            vision_enabled = cfg.get("detectors_enabled", {}).get("vision_engine_enabled", True)
            fps = max(1, int(cfg.get("capture_fps", 8)))
            hunt_active = audio_engine.hunt_active
            effective_fps = max(fps, 12) if hunt_active else fps
            interval = 1.0 / float(effective_fps)

            events: List[Dict[str, Any]] = []

            if vision_enabled and (loop_start - last_capture >= interval):
                last_capture = loop_start
                frame = await asyncio.to_thread(vision_engine.capture_screen)
                if frame is not None:
                    cv_evts = await asyncio.to_thread(
                        vision_engine.process_frame, frame, False, False, hunt_active
                    )
                    events.extend(cv_evts)
                    audio_engine.last_visual_flicker_ts = vision_engine.last_flicker_ts
                    audio_engine.visual_camera_moving = vision_engine.camera_moving

            audio_evts = audio_engine.pop_events()
            events.extend(audio_evts)

            for evt in events:
                evt["timestamp"] = round(time.time(), 3)
                await broadcast({"kind": "detection", "event": evt})

            telemetry: Dict[str, Any] = {
                "kind": "telemetry",
                "audio": audio_engine.get_telemetry(),
                "vision": {
                    "enabled": vision_enabled,
                    "fps": effective_fps if vision_enabled else 0,
                    "camera_moving": vision_engine.camera_moving if vision_enabled else False,
                },
            }
            if vision_enabled and preview_subscribers and vision_engine.last_frame_b64:
                telemetry["preview_b64"] = vision_engine.last_frame_b64
            await broadcast(telemetry)

            # Smooth dynamic sleep: adaptive based on work done and target FPS
            elapsed = time.time() - loop_start
            if not vision_enabled:
                sleep_target = 0.12  # Pure manual mode / audio-only: gentle 8Hz polling without GPU/CPU capture
            else:
                sleep_target = max(0.008, interval - elapsed)
            await asyncio.sleep(sleep_target)
        except Exception:
            await asyncio.sleep(0.05)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bg_task, hk_task
    bg_task = asyncio.create_task(telemetry_and_vision_loop())
    hk_task = asyncio.create_task(hotkey_poller_loop())
    yield
    audio_engine.stop()
    if bg_task:
        bg_task.cancel()
    if hk_task:
        hk_task.cancel()


app = FastAPI(title="PhasmoSense CV & Audio DSP Sidecar", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "ocr_ready": vision_engine.ocr is not None,
        "audio_device": audio_engine.device_name,
        "config": config_manager.config,
    }


@app.get("/api/config")
async def get_config() -> Dict[str, Any]:
    return config_manager.config


@app.post("/api/config")
async def update_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    updated = config_manager.update(patch)
    await broadcast({"kind": "config_updated", "config": updated})
    return updated


@app.get("/api/history")
async def get_history_summary() -> Dict[str, Any]:
    return database.get_analytics_summary()


VERSION_FILE = Path(__file__).resolve().parent.parent / "version.json"


@app.get("/api/version")
async def get_version_info() -> Dict[str, Any]:
    if VERSION_FILE.exists():
        try:
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "version": "2.1.0",
        "commit_sha": "initial",
        "pending_changelog": None,
    }


@app.post("/api/version/clear-changelog")
async def clear_pending_changelog() -> Dict[str, Any]:
    if VERSION_FILE.exists():
        try:
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["pending_changelog"] = None
            with open(VERSION_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return {"status": "ok"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    return {"status": "ok"}


@app.post("/api/history/match")
async def record_match(body: Dict[str, Any]) -> Dict[str, Any]:
    match_id = database.save_match(body)
    summary = database.get_analytics_summary()
    await broadcast({"kind": "history_updated", "summary": summary})
    return {"status": "ok", "match_id": match_id, "summary": summary}


@app.post("/api/tap-bpm")
async def tap_bpm() -> Dict[str, Any]:
    mult = float(
        config_manager.config.get("difficulty", {}).get("ghost_speed_multiplier", 1.0)
    )
    evt = audio_engine.RegisterFootstepOnset(time.time(), mult)
    if evt:
        evt["timestamp"] = round(time.time(), 3)
        await broadcast({"kind": "detection", "event": evt})
    return {"audio": audio_engine.get_telemetry(), "event": evt}


@app.post("/api/simulate")
async def run_simulation(body: Dict[str, Any]) -> Dict[str, Any]:
    scenario = str(body.get("scenario", "emf_5"))
    emitted: List[Dict[str, Any]] = []

    if scenario in (
        "emf_5",
        "emf_5_t3",
        "freezing_thermo",
        "journal_sync",
        "truck_sanity",
        "uv_handprint",
        "obake_six_finger",
        "ghost_orb",
        "dots_silhouette",
        "spirit_box_t3",
        "ghost_writing",
        "truck_activity_emf5",
        "truck_activity_twins",
    ):
        if scenario == "dots_silhouette":
            # Feed a clean baseline grid frame first so motion differencing triggers accurately
            base_frame = SimulationDeck.generate_frame("ghost_orb")
            await asyncio.to_thread(
                vision_engine.process_frame, base_frame, False, True
            )
        sim_frame = SimulationDeck.generate_frame(scenario)
        evts = await asyncio.to_thread(
            vision_engine.process_frame, sim_frame, True, True
        )
        emitted.extend(evts)
    else:
        mult = float(
            config_manager.config.get("difficulty", {}).get(
                "ghost_speed_multiplier", 1.0
            )
        )
        evts = SimulationDeck.run_audio_scenario(audio_engine, scenario, mult)
        emitted.extend(evts)

    for evt in emitted:
        evt["timestamp"] = round(time.time(), 3)
        evt["simulated"] = True
        await broadcast({"kind": "detection", "event": evt})

    return {
        "scenario": scenario,
        "events": emitted,
        "preview_b64": vision_engine.last_frame_b64,
        "audio": audio_engine.get_telemetry(),
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected_clients.add(ws)
    try:
        await ws.send_text(
            json.dumps(
                {
                    "kind": "init",
                    "config": config_manager.config,
                    "audio": audio_engine.get_telemetry(),
                    "preview_b64": vision_engine.last_frame_b64 if preview_subscribers else None,
                    "history": database.get_analytics_summary(),
                }
            )
        )
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "set_preview":
                if msg.get("enabled", False):
                    preview_subscribers.add(ws)
                else:
                    preview_subscribers.discard(ws)
                vision_engine.preview_enabled = bool(preview_subscribers)
            elif msg.get("action") == "tap_bpm":
                await tap_bpm()
            elif msg.get("action") == "simulate":
                await run_simulation({"scenario": msg.get("scenario", "emf_5")})
            elif msg.get("action") == "save_match":
                match_data = msg.get("match", {})
                database.save_match(match_data)
                summary = database.get_analytics_summary()
                await broadcast({"kind": "history_updated", "summary": summary})
            elif msg.get("action") == "get_history":
                summary = database.get_analytics_summary()
                await ws.send_text(json.dumps({"kind": "history_updated", "summary": summary}))
            elif msg.get("action") == "smudge_triggered":
                await broadcast(
                    {
                        "kind": "detection",
                        "event": {
                            "type": "smudge_timer",
                            "source": "manual_or_cv",
                            "timestamp": round(time.time(), 3),
                            "detail": "Incense burned! Tracking 60s Demon, 90s Standard, and 180s Spirit lockout.",
                        },
                    }
                )
    except WebSocketDisconnect:
        connected_clients.discard(ws)
        preview_subscribers.discard(ws)
        vision_engine.preview_enabled = bool(preview_subscribers)
    except Exception:
        connected_clients.discard(ws)
        preview_subscribers.discard(ws)
        vision_engine.preview_enabled = bool(preview_subscribers)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
