import copy
import time
import unittest.mock

from config import ConfigManager
from vision_engine import VisionEngine
from audio_engine import AudioEngine
from simulator import SimulationDeck


def run_tests() -> None:
    cfg = ConfigManager()
    orig_cfg = copy.deepcopy(cfg.config)
    try:
        _run_tests_inner(cfg)
    finally:
        cfg.config = orig_cfg
        cfg.save()


def _run_tests_inner(cfg: ConfigManager) -> None:
    cfg.config.setdefault("detectors_enabled", {})
    cfg.config["detectors_enabled"]["vision_engine_enabled"] = True
    cfg.config["detectors_enabled"]["audio_engine_enabled"] = True
    ve = VisionEngine(cfg)
    ae = AudioEngine(cfg)

    cv_scenarios = [
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
        "truck_objectives",
        "parabolic_mic",
        "smudge_ignition",
        "crucifix_burned",
    ]
    for sc in cv_scenarios:
        ve.cooldowns.clear()
        if sc == "dots_silhouette":
            ve.process_frame(SimulationDeck.generate_frame("ghost_orb"), False, True)
        evts = ve.process_frame(SimulationDeck.generate_frame(sc), True, True)
        assert len(evts) > 0, f"Expected detection for CV scenario {sc}"
        if sc == "obake_six_finger":
            assert any(e.get("behavior_id") == "obake_six_finger" for e in evts), f"Expected obake_six_finger behavior, got {evts}"
        elif sc == "truck_activity_emf5":
            assert any(e.get("evidence") == "EMF Level 5" for e in evts), f"Expected EMF Level 5 from truck activity, got {evts}"
        elif sc == "truck_activity_twins":
            assert any(e.get("behavior_id") == "twins_double" for e in evts), f"Expected twins_double from truck activity, got {evts}"
        print(f"[PASS] CV {sc}: {[e.get('detail') for e in evts]}")

    audio_scenarios = [
        "footsteps_normal",
        "footsteps_fast",
        "footsteps_slow",
        "footsteps_gravel",
        "footsteps_concrete",
        "footsteps_player_moving_panned",
        "footsteps_missed_step",
        "multiplayer_voice",
        "emf5_beep",
        "emf5_t3_beep",
        "banshee_scream",
        "spirit_box_audio",
        "deogen_breath",
        "myling_footsteps_test",
    ]
    for asc in audio_scenarios:
        ae.cooldowns.clear()
        evts = SimulationDeck.run_audio_scenario(ae, asc, 1.0)
        assert len(evts) > 0, f"Expected detection for Audio scenario {asc}"
        if asc == "deogen_breath":
            assert any(e.get("behavior_id") == "deogen_breath" for e in evts), f"Expected deogen_breath behavior event, got {evts}"
        if asc == "spirit_box_audio":
            assert any(e.get("evidence") == "Spirit Box" for e in evts), f"Expected Spirit Box evidence event, got {evts}"
        if asc == "emf5_t3_beep":
            assert any(e.get("source") == "emf5_t3_audio_dsp" and e.get("evidence") == "EMF Level 5" for e in evts), f"Expected T3 EMF 5 pulsed event, got {evts}"
        if asc == "myling_footsteps_test":
            assert any(e.get("behavior_id") == "steps_before_flicker" for e in evts), f"Expected steps_before_flicker event, got {evts}"
        print(f"[PASS] AUDIO {asc}: {[e.get('detail') for e in evts]}")

    # LoS speed-up must be detected on a ramp, and hunt events must carry footstep timestamps
    ae_los = AudioEngine(cfg)
    los_evts = SimulationDeck.run_audio_scenario(ae_los, "footsteps_los", 1.0)
    assert any(e.get("los_accelerating") for e in los_evts), "Expected LoS speed-up on footsteps_los"
    hunt_evts = [e for e in los_evts if e.get("type") == "hunt_started"]
    assert hunt_evts and "first_footstep_ts" in hunt_evts[0], "hunt_started must include first_footstep_ts"
    print("[PASS] AUDIO footsteps_los: LoS speed-up detected + hunt timestamps present")

    # Regression test 1: ensure HUD text like "1.7 m/s" with Fahrenheit unit NEVER triggers Freezing Temperatures
    import cv2, numpy as np
    hud_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    cv2.putText(hud_frame, "Spirit 1.7 m/s <=50%", (900, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (240, 240, 240), 2)
    false_evts = ve.process_frame(hud_frame, True, False)
    assert len(false_evts) == 0, f"Expected 0 false positives on HUD/Lobby frame, got {false_evts}"
    print("[PASS] REGRESSION 1: 0 false Freezing Temperatures on HUD/Lobby numbers!")

    # Regression test 2: ensure Lobby/Loadout screens with red + green UI buttons on Tier 3 NEVER trigger EMF 5
    cfg.update({"equipment_tiers": {"emf": 3}})
    lobby_frame = np.full((720, 1280, 3), 90, dtype=np.uint8)
    cv2.putText(lobby_frame, "Multiplayer Loadout Ready", (300, 120), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (240, 240, 240), 2)
    cv2.rectangle(lobby_frame, (850, 500), (980, 560), (20, 20, 240), -1)   # Red UI button
    cv2.rectangle(lobby_frame, (850, 580), (980, 640), (40, 230, 40), -1)   # Green UI button
    false_lobby_evts = ve.process_frame(lobby_frame, True, False)
    assert len(false_lobby_evts) == 0, f"Expected 0 false EMF 5 in Lobby on Tier 3, got {false_lobby_evts}"
    print("[PASS] REGRESSION 2: 0 false EMF 5 on Tier 3 Lobby/Loadout UI!")

    # Regression test 3: ensure unmarked Journal Evidence page NEVER pre-confirms EMF 5 or Spirit Box
    unmarked_journal = np.zeros((720, 1280, 3), dtype=np.uint8)
    cv2.rectangle(unmarked_journal, (240, 70), (1040, 650), (205, 220, 232), -1)
    cv2.putText(unmarked_journal, "EVIDENCE", (520, 140), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (25, 25, 25), 3)
    cv2.putText(unmarked_journal, "EMF Level 5", (340, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (30, 30, 30), 2)
    cv2.putText(unmarked_journal, "Spirit Box", (340, 330), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (30, 30, 30), 2)
    cv2.putText(unmarked_journal, "Ultraviolet", (340, 420), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (30, 30, 30), 2)
    false_journal_evts = ve.process_frame(unmarked_journal, True, False)
    assert len(false_journal_evts) == 0, f"Expected 0 false positives on unmarked Journal, got {false_journal_evts}"
    print("[PASS] REGRESSION 3: 0 false positives on unmarked Journal Evidence page!")

    # Regression test 4: ensure UV footprint on the dark ground (y=630) is detected
    ve.in_journal = False
    ve.in_lobby_or_menu = False
    ve.cooldowns.clear()
    ground_uv = np.full((720, 1280, 3), 18, dtype=np.uint8)
    cv2.circle(ground_uv, (640, 615), 95, (145, 25, 115), -1)  # True Violet UV beam on floor (Hue ~145)
    cv2.ellipse(ground_uv, (640, 615), (26, 14), 15, 0, 360, (35, 215, 65), -1)  # Green UV footprint on floor
    ground_uv_evts = ve.process_frame(ground_uv, False, False)
    assert any(e.get("evidence") == "Ultraviolet" for e in ground_uv_evts), f"Expected UV on ground to be detected, got {ground_uv_evts}"
    assert any(e.get("behavior_id") == "salt_stepped" for e in ground_uv_evts), f"Expected salt_stepped auto-tag on floor UV footprint, got {ground_uv_evts}"
    print("[PASS] REGRESSION 4: Ground UV footprint in dark room detected + salt_stepped tagged!")

    # Regression test 5: ensure D.O.T.S. Projector grid in dark room with blue shadows NEVER triggers UV
    ve.cooldowns.clear()
    dots_room = np.full((720, 1280, 3), (45, 28, 18), dtype=np.uint8)  # Dark blue-shadow room
    for gx in range(380, 900, 32):
        for gy in range(180, 540, 32):
            cv2.circle(dots_room, (gx, gy), 3, (30, 240, 50), -1)
    dots_only_evts = ve.process_frame(dots_room, False, False)
    assert not any(e.get("evidence") == "Ultraviolet" for e in dots_only_evts), f"D.O.T.S. falsely triggered UV: {dots_only_evts}"
    print("[PASS] REGRESSION 5: 0 false UV detections when D.O.T.S. laser grid is present!")

    # Regression test 6: ensure 38.0 F (or '- 38.0' scan dash) on Tier 3 Thermometer in Fahrenheit NEVER triggers Freezing
    cfg.update({"temperature_unit": "F", "equipment_tiers": {"thermometer": 3}})
    ve.cooldowns.clear()
    t3_38f = np.full((720, 1280, 3), 18, dtype=np.uint8)
    cv2.rectangle(t3_38f, (790, 430), (1050, 560), (160, 210, 190), -1)
    cv2.putText(t3_38f, "-38.0 F", (810, 518), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (15, 25, 20), 4)
    false_38f_evts = ve.process_frame(t3_38f, True, False)
    assert not any(e.get("evidence") == "Freezing Temperatures" for e in false_38f_evts), f"38F falsely triggered Freezing: {false_38f_evts}"
    print("[PASS] REGRESSION 6: 0 false Freezing detections on 38.0 F / -38.0 F Tier 3 Thermometer!")

    # Regression test 7: ensure 3440x1440 (21:9 Ultrawide) frame properly normalizes and detects held equipment in the central 16:9 pillar
    cfg.update({"temperature_unit": "F", "equipment_tiers": {"thermometer": 3}})
    ve.cooldowns.clear()
    uw_frame = np.full((1440, 3440, 3), 18, dtype=np.uint8)
    # Central 16:9 pillar on 3440x1440 starts at x = 440, width = 2560
    cv2.rectangle(uw_frame, (440 + 1500, 860), (440 + 2100, 1120), (160, 210, 190), -1)
    cv2.putText(uw_frame, "28.4 F", (440 + 1540, 1030), cv2.FONT_HERSHEY_SIMPLEX, 3.2, (15, 25, 20), 7)
    uw_evts = ve.process_frame(uw_frame, True, False)
    assert any(e.get("evidence") == "Freezing Temperatures" for e in uw_evts), f"Expected 3440x1440 Ultrawide Freezing detection, got {uw_evts}"
    print("[PASS] REGRESSION 7: 3440x1440 (21:9 Ultrawide) central 16:9 pillar & 720p normalization verified!")

    # Regression test 8: Stereo spatial center-rejection suppresses player's centered steps while moving,
    # allows off-center panned footsteps while moving, and reports stereo LEFT/RIGHT direction
    ae_st = AudioEngine(cfg)
    sr = 44100
    chunk_n = 4096
    t = np.arange(chunk_n, dtype=np.float32) / sr
    quiet_tone = (0.0004 * np.sin(2.0 * np.pi * 60.0 * t)).astype(np.float32)
    quiet_stereo = np.stack([quiet_tone, quiet_tone], axis=1)
    quiet_mono = np.mean(quiet_stereo, axis=1)
    thud = (np.sin(2.0 * np.pi * 100.0 * t) * np.exp(-((t - 0.03) ** 2) / (2.0 * (0.012 ** 2)))).astype(np.float32)
    centered_stereo = np.stack([0.28 * thud, 0.28 * thud], axis=1)
    left_ghost_stereo = np.stack([0.43 * thud, 0.11 * thud], axis=1)

    with unittest.mock.patch.object(ae_st, "_check_player_movement_keys", return_value=False):
        for _ in range(5):
            ae_st.analyze_samples(quiet_mono, sr, is_simulation=False, stereo_samples=quiet_stereo)

    # While moving: Centered steps (|pan| < 0.14) are rejected
    with unittest.mock.patch.object(ae_st, "_check_player_movement_keys", return_value=True):
        ae_st.analyze_samples(np.mean(centered_stereo, axis=1), sr, is_simulation=False, stereo_samples=centered_stereo)
        assert len(ae_st.onset_times) == 0, f"Expected center step to be blocked while moving, got {ae_st.onset_times}"

    # While moving: Panned ghost steps (|pan| >= 0.14) ARE accepted
    time.sleep(0.16)
    with unittest.mock.patch.object(ae_st, "_check_player_movement_keys", return_value=True):
        for _ in range(3):
            ae_st.analyze_samples(quiet_mono, sr, is_simulation=False, stereo_samples=quiet_stereo)
        ae_st.analyze_samples(np.mean(left_ghost_stereo, axis=1), sr, is_simulation=False, stereo_samples=left_ghost_stereo)
        assert len(ae_st.onset_times) >= 1, "Expected panned ghost step to register even while moving"
        assert ae_st.footstep_direction == "LEFT", f"Expected LEFT footstep direction, got {ae_st.footstep_direction}"
    print("[PASS] REGRESSION 8: Stereo spatial center-rejection during movement + L/R panning verified!")

    # Regression test 9: Multi-frame Ghost Orb tracking upgrades a moving orb to confirmed (0.88)
    ve.in_lobby_or_menu = False
    ve.in_journal = False
    ve.orb_tracks.clear()
    ve.cooldowns.clear()
    orb_f1 = np.full((720, 1280, 3), (28, 36, 28), dtype=np.uint8)
    cv2.circle(orb_f1, (610, 320), 6, (248, 255, 248), -1)
    orb_ev1 = ve.process_frame(orb_f1, False, False)
    assert any(e.get("evidence") == "Ghost Orb" and e.get("state") == "suspected" for e in orb_ev1), f"Expected initial suspected Ghost Orb, got {orb_ev1}"
    time.sleep(0.12)
    orb_f2 = np.full((720, 1280, 3), (28, 36, 28), dtype=np.uint8)
    cv2.circle(orb_f2, (622, 320), 6, (248, 255, 248), -1)
    orb_ev2 = ve.process_frame(orb_f2, False, False)
    assert any(e.get("evidence") == "Ghost Orb" and e.get("state") == "confirmed" and float(e.get("confidence", 0)) >= 0.88 for e in orb_ev2), f"Expected confirmed tracked Ghost Orb >= 0.88, got {orb_ev2}"
    print("[PASS] REGRESSION 9: Multi-frame Ghost Orb tracking confirmation (0.88) verified!")

    # Regression test 10: Hunt Ambient Gate, Hunt Blink Duty Cycle, & Cold Non-Freezing Rule-Out Suggestion
    # 10a) 5 dry footsteps without ambient hunt audio update speed preview but do not trigger hunt_active; 8 sustained steps do
    ae_gate = AudioEngine(cfg)
    t0 = time.time() - 4.0
    step_evts = []
    for i in range(5):
        ae_gate.RegisterFootstepOnset(t0 + i * 0.52, 1.0, step_evts, is_simulation=False)
    assert not ae_gate.hunt_active, "5 steps without hunt ambient audio should not auto-trigger hunt_active"
    assert any(e.get("type") == "footstep_speed" for e in step_evts), f"Expected footstep_speed preview on 5 steps, got {step_evts}"
    for i in range(5, 8):
        ae_gate.RegisterFootstepOnset(t0 + i * 0.52, 1.0, step_evts, is_simulation=False)
    assert ae_gate.hunt_active, "8 tight continuous footsteps should auto-trigger hunt_active"

    ae_gate2 = AudioEngine(cfg)
    t1 = time.time() - 3.0
    ae_gate2.last_hunt_ambient_time = t1 + 1.0
    for i in range(5):
        ae_gate2.RegisterFootstepOnset(t1 + i * 0.52, 1.0, is_simulation=False)
    assert ae_gate2.hunt_active, "5 footsteps alongside recent hunt ambient audio should auto-trigger hunt_active"

    # 10b) Hunt blink duty cycle distinguishes Oni vs Phantom
    ve.cooldowns.clear()
    ve.hunt_blink_samples.clear()
    invis_roi = np.full((360, 640, 3), 20, dtype=np.uint8)
    vis_roi = np.full((360, 640, 3), 20, dtype=np.uint8)
    cv2.ellipse(vis_roi, (320, 180), (45, 110), 0, 0, 360, (190, 200, 195), -1)
    oni_evts = []
    for _ in range(8):
        oni_evts.extend(ve._detect_hunt_blink(vis_roi, True, True))
    assert any(e.get("behavior_id") == "blink_oni" for e in oni_evts), f"Expected blink_oni on mostly-visible frames, got {oni_evts}"

    ve.hunt_blink_samples.clear()
    phantom_evts = []
    for _ in range(2):
        phantom_evts.extend(ve._detect_hunt_blink(vis_roi, True, True))
    for _ in range(6):
        phantom_evts.extend(ve._detect_hunt_blink(invis_roi, True, True))
    assert any(e.get("behavior_id") == "blink_phantom" for e in phantom_evts), f"Expected blink_phantom on mostly-invisible frames, got {phantom_evts}"

    # 10c) Cold non-freezing rule-out suggestion after 6 readings at 1.5 C
    cfg.update({"temperature_unit": "C", "equipment_tiers": {"thermometer": 3}})
    ve.in_lobby_or_menu = False
    ve.in_journal = False
    ve.cooldowns.clear()
    ve.cold_non_freezing_count = 0
    ve.first_cold_non_freezing_ts = 0.0
    cold_frame = np.full((720, 1280, 3), 18, dtype=np.uint8)
    cv2.rectangle(cold_frame, (790, 430), (1050, 560), (160, 210, 190), -1)
    cv2.putText(cold_frame, "1.5 C", (825, 518), cv2.FONT_HERSHEY_SIMPLEX, 1.8, (15, 25, 20), 4)
    cold_evts = []
    for _ in range(6):
        cold_evts = ve.process_frame(cold_frame, True, True)
    assert any(e.get("type") == "rule_out_suggestion" and e.get("evidence") == "Freezing Temperatures" for e in cold_evts), f"Expected rule_out_suggestion for Freezing Temperatures, got {cold_evts}"
    print("[PASS] REGRESSION 10: Hunt ambient gate, Oni/Phantom blink duty-cycle, & Cold non-freezing rule-out verified!")

    # Regression test 11: Multi-Band Surface Detection, Visual Flicker Coincidence, & Harmonic Interval Recovery
    # 11a) Visual flicker coincidence: 5 footsteps alongside recent screen/equipment flicker triggers hunt_active
    ae_flicker = AudioEngine(cfg)
    ae_flicker.last_visual_flicker_ts = time.time()
    t_flick = time.time() - 2.5
    flick_evts = []
    for i in range(5):
        ae_flicker.RegisterFootstepOnset(t_flick + i * 0.50, 1.0, flick_evts, is_simulation=False)
    assert ae_flicker.hunt_active, "5 footsteps coinciding with visual electronic flicker must auto-trigger hunt_active"
    print("[PASS] REGRESSION 11a: Visual flicker coincidence hunt trigger (5 steps) verified!")

    # 11b) Harmonic missed-step recovery: cadence maintained even when a footstep is dropped (2T interval)
    ae_harm = AudioEngine(cfg)
    t_base = time.time() - 4.0
    for i in range(8):
        if i == 4:
            continue  # Drop step 4 (creates 2x interval)
        ae_harm.RegisterFootstepOnset(t_base + i * 0.52, 1.0, is_simulation=True)
    assert ae_harm.current_bpm > 0, "Harmonic tracker must reconstruct cadence across 2T missed step gap"
    assert abs(ae_harm.current_mps - 1.70) < 0.25, f"Expected reconstructed speed ~1.70 m/s, got {ae_harm.current_mps}"
    print("[PASS] REGRESSION 11b: Harmonic missed-step interpolation (2T gap) verified!")

    # 11c) Multi-band surface transient: Gravel/Snow (Band 3 high-freq transient)
    ae_surf = AudioEngine(cfg)
    ae_surf.cooldowns.clear()
    gravel_evts = SimulationDeck.run_audio_scenario(ae_surf, "footsteps_gravel", 1.0)
    assert ae_surf.last_onset_band == "gravel", f"Expected gravel band, got {ae_surf.last_onset_band}"
    print("[PASS] REGRESSION 11c: Multi-band surface detection (Gravel/Snow/Grass) verified!")

    # Regression test 12: Flashlight in dark room immunity for Ghost Writing and Ghost Orbs
    # 12a) Flashlight beam pool on wooden floor with grain lines must NEVER trigger Ghost Writing
    ve.cooldowns.clear()
    ve.writing_streak = 0
    fl_floor = np.full((720, 1280, 3), 18, dtype=np.uint8)
    cv2.ellipse(fl_floor, (640, 520), (180, 110), 0, 0, 360, (140, 180, 220), -1)
    for ly in range(450, 600, 28):
        cv2.line(fl_floor, (480, ly), (800, ly), (45, 60, 80), 2)
    fl_writing_evts = []
    for _ in range(5):
        fl_writing_evts.extend(ve.process_frame(fl_floor, False, False))
    assert not any(e.get("evidence") == "Ghost Writing" for e in fl_writing_evts), f"Flashlight pool falsely triggered Ghost Writing: {fl_writing_evts}"
    print("[PASS] REGRESSION 12a: 0 false Ghost Writing detections on flashlight beam on floor!")

    # 12b) Flashlight specular highlight on illuminated door/wall must NEVER trigger Ghost Orbs
    ve.cooldowns.clear()
    ve.orb_tracks.clear()
    fl_specular = np.full((720, 1280, 3), 18, dtype=np.uint8)
    cv2.circle(fl_specular, (640, 360), 220, (140, 175, 185), -1)  # Flashlight beam
    cv2.circle(fl_specular, (640, 360), 6, (255, 255, 255), -1)     # Specular reflection
    fl_orb_evts = []
    for _ in range(5):
        fl_orb_evts.extend(ve.process_frame(fl_specular, False, False))
    assert not any(e.get("evidence") == "Ghost Orb" for e in fl_orb_evts), f"Flashlight reflection falsely triggered Ghost Orb: {fl_orb_evts}"
    print("[PASS] REGRESSION 12b: 0 false Ghost Orb detections on flashlight specular reflection!")

    # Regression test 13: Master Audio On/Off Switch verification
    # When disabled, live audio analysis must return 0 events, mute telemetry, and zero visualizer spectrum bars
    cfg.config["detectors_enabled"]["audio_engine_enabled"] = False
    ae_mute = AudioEngine(cfg)
    test_samples = np.sin(2 * np.pi * 1050 * np.linspace(0, 0.05, int(44100 * 0.05), dtype=np.float32))
    muted_evts = ae_mute.analyze_samples(test_samples, is_simulation=False)
    assert len(muted_evts) == 0, f"Expected 0 events when audio engine disabled, got {muted_evts}"
    assert ae_mute.telemetry.get("audio_muted") is True, "Expected audio_muted=True in telemetry"
    assert all(b == 0.0 for b in ae_mute.spectrum_bars), "Expected visualizer spectrum bars to be all zeroed out"
    print("[PASS] REGRESSION 13a: Master Audio Switch OFF completely silences DSP and zeroes spectrum!")

    # When toggled back ON, audio analysis resumes immediately
    cfg.config["detectors_enabled"]["audio_engine_enabled"] = True
    ae_mute.analyze_samples(test_samples, is_simulation=False)
    assert ae_mute.telemetry.get("audio_muted") is not True, "Expected audio_muted to be cleared when enabled"
    assert any(b > 0.0 for b in ae_mute.spectrum_bars), "Expected active spectrum bars when audio re-enabled"
    print("[PASS] REGRESSION 13b: Master Audio Switch ON instantly restores live acoustic tracking!")

    # Regression test 14: Master Screen Monitoring / Vision Engine On/Off Switch
    # When disabled, process_frame must return 0 events (pure manual logger mode)
    cfg.config["detectors_enabled"]["vision_engine_enabled"] = False
    ve_mute = VisionEngine(cfg)
    test_frame = SimulationDeck.generate_frame("emf_5")
    muted_cv_evts = ve_mute.process_frame(test_frame, force_ocr=True, is_simulation=False)
    assert len(muted_cv_evts) == 0, f"Expected 0 events when vision engine disabled, got {muted_cv_evts}"
    print("[PASS] REGRESSION 14a: Screen Monitoring OFF completely halts CV/OCR for pure manual logging!")

    # When toggled back ON, process_frame resumes detection immediately
    cfg.config["detectors_enabled"]["vision_engine_enabled"] = True
    active_cv_evts = ve_mute.process_frame(test_frame, force_ocr=True, is_simulation=False)
    assert len(active_cv_evts) > 0, "Expected active CV detections when vision engine re-enabled"
    print("[PASS] REGRESSION 14b: Screen Monitoring ON instantly restores live computer vision tracking!")

    # Regression test 15a: 0 false Crucifix burn detections on orange lightbulbs/ambient walls without charred body, or in truck/lobby
    ve_cruc = VisionEngine(cfg)
    orange_lamp = np.full((720, 1280, 3), 140, dtype=np.uint8)  # Bright warm ambient room
    cv2.circle(orange_lamp, (900, 500), 14, (15, 120, 245), -1)  # Orange light spot on white/tan background
    cruc_evts = []
    for _ in range(5):
        cruc_evts.extend(ve_cruc.process_frame(orange_lamp, is_simulation=False))
    assert not any(e.get("type") == "crucifix_burned" for e in cruc_evts), f"Orange lamp without charred cross falsely triggered Crucifix burn: {cruc_evts}"

    # Also verify truck/lobby immunity
    ve_cruc.last_truck_seen_ts = time.time()
    sim_cruc_frame = SimulationDeck.generate_frame("crucifix_burned")
    truck_cruc_evts = ve_cruc.process_frame(sim_cruc_frame, is_simulation=False)
    assert not any(e.get("type") == "crucifix_burned" for e in truck_cruc_evts), f"Crucifix burn triggered while in truck: {truck_cruc_evts}"
    print("[PASS] REGRESSION 15a: 0 false Crucifix burn detections on lamps/walls or inside truck/lobby!")

    # Regression test 15b: 0 false Spirit Box detections during player movement / footsteps
    ae_walk = AudioEngine(cfg)
    ae_walk.player_moving = True
    ae_walk.last_player_move_time = time.time()
    sr = 44100
    t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
    footstep_chunk = (0.28 * np.sin(2 * np.pi * 380 * t) + 0.18 * np.sin(2 * np.pi * 2400 * t)).astype(np.float32)
    walk_sb_evts = ae_walk.analyze_samples(footstep_chunk, sample_rate=sr, is_simulation=False)
    assert not any(e.get("evidence") == "Spirit Box" for e in walk_sb_evts), f"Footstep during walking falsely triggered Spirit Box: {walk_sb_evts}"
    print("[PASS] REGRESSION 15b: 0 false Spirit Box vocal detections while player is walking!")

    print("All CV, OCR, and Audio DSP pipeline tests passed!")


if __name__ == "__main__":
    run_tests()
