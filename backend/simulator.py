import time
from typing import Any, Dict, List

import cv2
import numpy as np


class SimulationDeck:
    """Generates realistic synthetic Phasmophobia video frames and audio buffers
    for testing & calibrating the CV, OCR, and Audio DSP pipelines."""

    @staticmethod
    def generate_frame(scenario: str) -> np.ndarray:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        frame[:] = (18, 20, 22)  # Dark indoor ambient

        if scenario == "emf_5":
            # Draw Tier II EMF Reader in the bottom-right hand ROI with all 5 LEDs lit (including Red #5)
            cv2.rectangle(frame, (780, 420), (1060, 690), (45, 48, 52), -1)
            cv2.rectangle(frame, (800, 440), (1040, 560), (28, 30, 34), -1)
            led_colors = [
                (40, 240, 40),    # LED 1 Green
                (40, 255, 140),   # LED 2 Light Green
                (0, 245, 255),    # LED 3 Yellow
                (0, 140, 255),    # LED 4 Orange
                (15, 15, 255),    # LED 5 Bright Red (BGR)
            ]
            for i, col in enumerate(led_colors):
                cx = 825 + i * 46
                cy = 500
                cv2.circle(frame, (cx, cy), 16, col, -1)
            cv2.putText(
                frame,
                "EMF READER K-II",
                (820, 610),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (190, 190, 190),
                2,
            )

        elif scenario == "emf_5_t3":
            # Draw Tier III EMF ParaMeter handheld with backlit screen, 3 slots, 5 level bars & red peak alert
            cv2.rectangle(frame, (780, 400), (1060, 635), (32, 34, 38), -1)
            cv2.rectangle(frame, (810, 430), (1030, 600), (140, 185, 155), -1)
            # 3 stacked signal slot divider bars
            for sy in (485, 535, 585):
                cv2.rectangle(frame, (820, sy), (1020, sy + 3), (35, 45, 40), -1)
            # 5 horizontal Level-5 dashes in slot 1 + bright red Level-5 alert badge
            for bi in range(5):
                bx = 828 + bi * 30
                cv2.rectangle(frame, (bx, 455), (bx + 20, 464), (25, 35, 30), -1)
            cv2.rectangle(frame, (988, 446), (1018, 470), (15, 15, 250), -1)

        elif scenario == "spirit_box_t3":
            # Draw Tier III SB11-Z Spirit Box casing with horizontal row of 4 bright white response LEDs
            cv2.rectangle(frame, (770, 410), (1060, 650), (32, 34, 38), -1)
            for cx in (840, 885, 930, 975):
                cv2.circle(frame, (cx, 510), 9, (250, 250, 250), -1)

        elif scenario == "ghost_writing":
            # Draw open two-page parchment Ghost Writing Book in lower center viewport with ink scribbles
            cv2.rectangle(frame, (470, 400), (810, 575), (195, 218, 232), -1)
            cv2.line(frame, (640, 404), (640, 571), (95, 105, 115), 2)
            # Separate dark cursive scribble strokes across both left and right pages
            for row_idx, ry in enumerate((435, 460, 485, 510, 535)):
                cv2.line(frame, (505, ry), (560, ry - 6 + (row_idx % 2) * 10), (22, 24, 28), 3)
                cv2.line(frame, (570, ry + 4), (618, ry - 4), (22, 24, 28), 3)
                cv2.line(frame, (662, ry - 4), (715, ry + 5), (22, 24, 28), 3)
                cv2.line(frame, (725, ry + 3), (775, ry - 5), (22, 24, 28), 3)

        elif scenario == "freezing_thermo":
            # Draw Tier II Digital Thermometer reading -3.4 C in hand ROI
            cv2.rectangle(frame, (760, 400), (1080, 680), (40, 42, 48), -1)
            cv2.rectangle(frame, (790, 430), (1050, 560), (160, 210, 190), -1)
            cv2.putText(
                frame,
                "-3.4 C",
                (815, 518),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.8,
                (15, 25, 20),
                4,
            )

        elif scenario == "journal_sync":
            # Draw open Phasmophobia Journal with "EVIDENCE", circled "EMF Level 5", and struck-through "Spirit Box"
            cv2.rectangle(frame, (240, 70), (1040, 650), (205, 220, 232), -1)
            cv2.putText(
                frame,
                "EVIDENCE",
                (520, 140),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.4,
                (25, 25, 25),
                3,
            )
            # Confirmed (circled) EMF Level 5
            cv2.putText(
                frame,
                "EMF Level 5",
                (340, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (30, 30, 30),
                2,
            )
            cv2.rectangle(frame, (316, 194), (532, 264), (20, 20, 20), 4)

            # Ruled out (strikethrough) Spirit Box
            cv2.putText(
                frame,
                "Spirit Box",
                (340, 330),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (30, 30, 30),
                2,
            )
            cv2.line(frame, (330, 320), (520, 320), (15, 15, 15), 5)

        elif scenario == "truck_sanity":
            # Draw Truck Sanity Monitor + Contract Map board
            cv2.rectangle(frame, (220, 110), (1060, 610), (30, 42, 36), -1)
            cv2.putText(
                frame,
                "AVERAGE SANITY: 44%",
                (330, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.4,
                (90, 245, 130),
                3,
            )
            cv2.putText(
                frame,
                "6 Tanglewood Drive - Nightmare",
                (330, 360),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.1,
                (220, 235, 220),
                2,
            )

        elif scenario == "uv_handprint":
            # Draw UV purple cone + bright neon-green fluorescent handprint in center viewport
            cv2.circle(frame, (640, 360), 220, (180, 60, 130), -1)  # BGR Violet
            cv2.circle(frame, (640, 360), 48, (40, 250, 60), -1)    # BGR Neon green palm
            for dx in (-35, -18, 0, 18, 35):
                cv2.circle(frame, (640 + dx, 290), 10, (40, 250, 60), -1)

        elif scenario == "obake_six_finger":
            # Draw UV purple cone + neon-green palm + 6 distinct green fingertip marks
            cv2.circle(frame, (640, 360), 220, (180, 60, 130), -1)  # BGR Violet
            cv2.circle(frame, (640, 360), 48, (40, 250, 60), -1)    # BGR Neon green palm
            for dx in (-50, -30, -10, 10, 30, 50):
                cv2.circle(frame, (640 + dx, 285), 6, (40, 250, 60), -1)

        elif scenario == "truck_activity_emf5":
            # Dark truck activity monitor with a clean +5 step jump (dy = 65px)
            cv2.rectangle(frame, (220, 110), (1060, 560), (20, 26, 22), -1)
            pts = np.array([[360, 420], [460, 420], [464, 355], [580, 355]], dtype=np.int32)
            cv2.polylines(frame, [pts], False, (20, 20, 245), 3)

        elif scenario == "truck_activity_twins":
            # Dark truck activity monitor with a Twins double-slope step jump
            cv2.rectangle(frame, (220, 110), (1060, 560), (20, 26, 22), -1)
            pts = np.array(
                [[360, 420], [420, 420], [424, 392], [455, 392], [459, 364], [540, 364]],
                dtype=np.int32,
            )
            cv2.polylines(frame, [pts], False, (20, 20, 245), 3)

        elif scenario == "ghost_orb":
            # Night vision monochrome dark feed with floating circular bright Ghost Orb
            frame[:] = (28, 36, 28)
            cv2.circle(frame, (610, 320), 6, (250, 255, 250), -1)
            cv2.circle(frame, (680, 270), 5, (245, 255, 245), -1)

        elif scenario == "truck_objectives":
            # Draw Truck Whiteboard with 3 Contract Objectives
            cv2.rectangle(frame, (200, 100), (1080, 620), (235, 238, 240), -1)
            cv2.putText(frame, "OBJECTIVES", (420, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 3)
            cv2.putText(frame, "1. Discover what type of Ghost we are dealing with", (230, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (25, 25, 25), 2)
            cv2.putText(frame, "2. Cleanse the area near the ghost using Incense", (230, 320), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (25, 25, 25), 2)
            cv2.putText(frame, "3. Detect a ghost presence with a Motion Sensor", (230, 400), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (25, 25, 25), 2)
            cv2.putText(frame, "4. Get the ghost to walk in Salt", (230, 480), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (25, 25, 25), 2)

        elif scenario == "parabolic_mic":
            # Parabolic Mic handheld in equipment ROI with signal readout
            cv2.rectangle(frame, (760, 410), (1060, 650), (28, 30, 34), -1)
            cv2.rectangle(frame, (830, 470), (990, 560), (18, 48, 22), -1)
            cv2.putText(frame, "PARABOLIC 2.4", (840, 525), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (40, 250, 60), 2)

        elif scenario == "smudge_ignition":
            # Handheld lighter ignition flash + incense smoke
            cv2.rectangle(frame, (780, 420), (1040, 640), (32, 34, 38), -1)
            # Bright orange lighter flame
            cv2.ellipse(frame, (880, 470), (25, 45), 0, 0, 360, (15, 140, 255), -1)
            cv2.circle(frame, (880, 465), 14, (60, 225, 255), -1)

        elif scenario == "crucifix_burned":
            # Handheld charred cross with glowing ember core
            cv2.rectangle(frame, (780, 420), (1040, 640), (24, 26, 28), -1)
            cv2.circle(frame, (880, 510), 12, (15, 120, 245), -1)
            cv2.circle(frame, (880, 510), 5, (80, 210, 255), -1)

        elif scenario == "dots_silhouette":
            # Green D.O.T.S laser grid + shifting bright green silhouette
            for gx in range(380, 900, 26):
                for gy in range(180, 540, 26):
                    cv2.circle(frame, (gx, gy), 3, (30, 240, 50), -1)
            cv2.ellipse(
                frame, (640, 360), (65, 135), 0, 0, 360, (45, 255, 70), -1
            )

        elif scenario == "cursed_tarot_death":
            # Handheld Tarot Cards: dark card back with ornate gold border and white card face + crimson Death skull
            cv2.rectangle(frame, (800, 420), (1020, 680), (32, 28, 45), -1)
            cv2.rectangle(frame, (810, 430), (1010, 670), (25, 175, 220), 4)  # Gold border
            cv2.rectangle(frame, (825, 450), (995, 650), (240, 240, 245), -1)  # White card face
            cv2.circle(frame, (910, 545), 24, (20, 20, 240), -1)  # Crimson Death skull center

        elif scenario == "cursed_mirror_shattered":
            # Handheld Haunted Mirror: Oval gold frame enclosing cracked glass pane
            cv2.ellipse(frame, (910, 530), (85, 125), 0, 0, 360, (25, 185, 230), 8)  # Gold frame
            cv2.ellipse(frame, (910, 530), (75, 115), 0, 0, 360, (28, 30, 32), -1)   # Glass pane
            # Jagged crack lines across glass
            cv2.line(frame, (860, 460), (960, 600), (220, 225, 235), 2)
            cv2.line(frame, (950, 480), (880, 580), (210, 215, 225), 2)

        elif scenario == "cursed_music_box":
            # Handheld Music Box: Brass metallic box with winding key and cylinder
            cv2.rectangle(frame, (810, 450), (1010, 650), (35, 175, 215), -1)  # Brass body
            cv2.rectangle(frame, (840, 480), (980, 620), (55, 195, 235), -1)  # Inner chamber
            cv2.circle(frame, (910, 550), 20, (30, 140, 180), -1)             # Rotating cylinder

        elif scenario == "cursed_ouija":
            # Wooden Ouija Board on floor with semi-circle letters & planchette
            cv2.rectangle(frame, (450, 380), (830, 620), (35, 85, 135), -1)   # Wood board
            cv2.ellipse(frame, (640, 500), (130, 70), 0, 180, 360, (185, 205, 215), 3)  # Letter arch
            # Planchette triangle
            pts = np.array([[640, 480], [615, 540], [665, 540]], np.int32)
            cv2.fillPoly(frame, [pts], (210, 215, 220))

        elif scenario == "cursed_circle":
            # Floor Summoning Circle: 5 red candle stands with lit flame tips
            for cx, cy in ((540, 420), (740, 420), (480, 550), (800, 550), (640, 640)):
                cv2.circle(frame, (cx, cy), 16, (20, 20, 210), -1)   # Red candle stand
                cv2.circle(frame, (cx, cy - 8), 7, (20, 195, 255), -1) # Lit flame tip

        elif scenario == "cursed_monkey_paw":
            # Handheld Monkey Paw: Dark fur paw with golden claws
            cv2.rectangle(frame, (830, 460), (990, 650), (35, 65, 75), -1)  # Dark fur
            for fx in (855, 885, 915, 945, 970):
                cv2.ellipse(frame, (fx, 450), (6, 22), 0, 0, 360, (25, 185, 235), -1) # Golden claws

        elif scenario == "cursed_voodoo_heart":
            # Handheld Tortured Voodoo Doll: Burlap doll with center red heart pin
            cv2.rectangle(frame, (820, 440), (1000, 660), (45, 95, 115), -1)  # Burlap body
            cv2.circle(frame, (910, 550), 12, (20, 20, 240), -1)              # Crimson heart pin

        return frame

    @staticmethod
    def run_audio_scenario(audio_engine: Any, scenario: str, speed_mult: float = 1.0) -> List[Dict[str, Any]]:
        sr = 44100
        events: List[Dict[str, Any]] = []

        if scenario in (
            "footsteps_normal",
            "footsteps_fast",
            "footsteps_slow",
            "footsteps_los",
            "footsteps_gravel",
            "footsteps_concrete",
            "footsteps_player_moving_panned",
            "footsteps_missed_step",
        ):
            # Simulate footsteps at target cadence
            target_mps = {
                "footsteps_normal": 1.70,
                "footsteps_fast": 2.75,   # e.g. Revenant / Moroi / Hantu cold
                "footsteps_slow": 1.05,   # e.g. Deogen close / Old Thaye / Hantu warm
                "footsteps_los": 1.70,
                "footsteps_gravel": 1.70,
                "footsteps_concrete": 1.70,
                "footsteps_player_moving_panned": 1.70,
                "footsteps_missed_step": 1.70,
            }[scenario]

            now = time.time()
            audio_engine.onset_times.clear()
            audio_engine.bpm_history.clear()
            audio_engine.cooldowns.pop("footstep_speed_update", None)

            if scenario == "footsteps_gravel":
                audio_engine.last_onset_band = "gravel"
                audio_engine.footstep_direction = "RIGHT"
                audio_engine.footstep_pan = 0.52
                audio_engine.spectrum_bars = [0.10, 0.12, 0.15, 0.20, 0.35, 0.50, 0.72, 0.88, 0.82, 0.65, 0.40, 0.22, 0.15, 0.08, 0.05, 0.02]
            elif scenario == "footsteps_concrete":
                audio_engine.last_onset_band = "concrete"
                audio_engine.footstep_direction = "LEFT"
                audio_engine.footstep_pan = -0.48
                audio_engine.spectrum_bars = [0.25, 0.40, 0.70, 0.85, 0.65, 0.45, 0.30, 0.20, 0.15, 0.10, 0.08, 0.05, 0.04, 0.02, 0.02, 0.01]
            elif scenario == "footsteps_player_moving_panned":
                audio_engine.player_moving = True
                audio_engine.footstep_direction = "RIGHT"
                audio_engine.footstep_pan = 0.45
                audio_engine.spectrum_bars = [0.65, 0.80, 0.60, 0.35, 0.20, 0.15, 0.12, 0.18, 0.30, 0.20, 0.12, 0.08, 0.05, 0.04, 0.02, 0.01]
            else:
                audio_engine.last_onset_band = "wood"
                audio_engine.footstep_direction = "CENTER"
                audio_engine.footstep_pan = 0.0
                audio_engine.spectrum_bars = [0.75, 0.88, 0.62, 0.35, 0.20, 0.15, 0.12, 0.18, 0.42, 0.55, 0.30, 0.15, 0.10, 0.08, 0.05, 0.04]

            # A LoS chase ramps over several seconds, so simulate a longer run for it
            steps = 14 if scenario == "footsteps_los" else 8
            t_cursor = now - 0.5 * steps
            for i in range(steps):
                # If missed_step scenario, drop step #4 to test harmonic 2T interpolation
                if scenario == "footsteps_missed_step" and i == 4:
                    continue
                step_mps = target_mps + (0.08 * i if scenario == "footsteps_los" else 0.0)
                bpm = (step_mps / 1.70) * 115.0 * speed_mult
                ioi = 60.0 / bpm
                t_cursor += ioi
                if i == steps - 1:
                    # Let the final footstep emit a speed update that reflects the whole run
                    audio_engine.cooldowns.pop("footstep_speed_update", None)
                evt = audio_engine.RegisterFootstepOnset(
                    t_cursor, speed_mult, events, is_simulation=True
                )
            return events

        elif scenario == "emf5_t3_beep":
            # Synthesize Tier 3 ParaMeter 4-burst pulsed 2850 Hz alarm beep
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            env = np.zeros_like(t, dtype=np.float32)
            win_len = 2048 // 8
            for wi in range(8):
                env[wi * win_len : (wi + 1) * win_len] = 1.0 if (wi % 2 == 0) else 0.05
            tone = (0.48 * np.sin(2 * np.pi * 2850 * t) * env).astype(np.float32)
            return audio_engine.analyze_samples(tone, sr, is_simulation=True)

        elif scenario == "myling_footsteps_test":
            # Populate 4 recent footsteps and feed clean sub-bass thud with zero flicker static
            now = time.time()
            audio_engine.onset_times.clear()
            for dt in (1.8, 1.35, 0.9, 0.45):
                audio_engine.onset_times.append(now - dt)
            audio_engine.last_onset_time = now - 0.45
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            thud = (0.35 * np.sin(2 * np.pi * 100 * t)).astype(np.float32)
            return audio_engine.analyze_samples(thud, sr, is_simulation=True)

        elif scenario == "multiplayer_voice":
            # Synthesize human vowel formants (F1=500Hz, F2=1500Hz, F3=2100Hz) continuous speech
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            speech = (
                0.35 * np.sin(2 * np.pi * 480 * t)
                + 0.45 * np.sin(2 * np.pi * 1150 * t)
                + 0.25 * np.sin(2 * np.pi * 1850 * t)
            ).astype(np.float32)
            return audio_engine.analyze_samples(speech, sr, is_simulation=True)

        elif scenario == "emf5_beep":
            # Synthesize 2850 Hz narrow-band EMF 5 harmonic tone
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            tone = (0.45 * np.sin(2 * np.pi * 2850 * t)).astype(np.float32)
            return audio_engine.analyze_samples(tone, sr, is_simulation=True)

        elif scenario == "banshee_scream":
            # Synthesize high-energy Banshee parabolic wail around 1650 Hz
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            wail = (
                0.55 * np.sin(2 * np.pi * 1550 * t)
                + 0.45 * np.sin(2 * np.pi * 1820 * t)
            ).astype(np.float32)
            return audio_engine.analyze_samples(wail, sr, is_simulation=True)

        elif scenario == "spirit_box_audio":
            # Synthesize Spirit Box ghost vocal formants + high-frequency radio sweep carrier
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            sb = (
                0.28 * np.sin(2 * np.pi * 450 * t)
                + 0.25 * np.sin(2 * np.pi * 880 * t)
                + 0.22 * np.sin(2 * np.pi * 2650 * t)
                + 0.18 * np.sin(2 * np.pi * 3450 * t)
                + 0.14 * np.sin(2 * np.pi * 4150 * t)
            ).astype(np.float32)
            return audio_engine.analyze_samples(sb, sr, is_simulation=True)

        elif scenario == "deogen_breath":
            # Synthesize heavy low bull-breathing + turbulent hiss
            t = np.linspace(0, 2048 / sr, 2048, endpoint=False)
            breath = (
                0.40 * np.sin(2 * np.pi * 240 * t)
                + 0.35 * np.sin(2 * np.pi * 380 * t + 0.7)
                + 0.20 * np.sin(2 * np.pi * 1750 * t + 1.9)
                + 0.15 * np.sin(2 * np.pi * 2250 * t + 3.1)
            ).astype(np.float32)
            return audio_engine.analyze_samples(breath, sr, is_simulation=True)

        return events
