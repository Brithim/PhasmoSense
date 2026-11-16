import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "phasmosense_history.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at REAL NOT NULL,
                ended_at REAL NOT NULL,
                duration_sec REAL NOT NULL,
                map_name TEXT DEFAULT 'Unknown Map',
                difficulty TEXT DEFAULT 'Professional',
                predicted_ghost TEXT,
                actual_ghost TEXT,
                is_win INTEGER DEFAULT 0,
                perfect_game INTEGER DEFAULT 0,
                evidence_count INTEGER DEFAULT 3,
                sanity_start REAL DEFAULT 100.0,
                sanity_end REAL DEFAULT 50.0,
                hunt_count INTEGER DEFAULT 0,
                max_ghost_speed REAL DEFAULT 1.70
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS match_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                timestamp REAL NOT NULL,
                event_type TEXT NOT NULL,
                detail TEXT,
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS match_objectives (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                objective_text TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_ended_at ON matches(ended_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obj_match ON match_objectives(match_id)")
        conn.commit()


def save_match(match_data: Dict[str, Any]) -> int:
    init_db()
    started_at = float(match_data.get("started_at", time.time() - 300.0))
    ended_at = float(match_data.get("ended_at", time.time()))
    duration_sec = max(1.0, float(match_data.get("duration_sec", ended_at - started_at)))
    map_name = str(match_data.get("map_name", "6 Tanglewood Drive"))
    difficulty = str(match_data.get("difficulty", "Nightmare"))
    predicted_ghost = str(match_data.get("predicted_ghost", "")).strip() or None
    actual_ghost = str(match_data.get("actual_ghost", "")).strip() or predicted_ghost

    is_win = 1 if (predicted_ghost and actual_ghost and predicted_ghost.lower() == actual_ghost.lower()) else 0
    objectives = match_data.get("objectives", [])
    all_obj_done = len(objectives) >= 3 and all(bool(o.get("completed")) for o in objectives)
    perfect_game = 1 if (is_win == 1 and all_obj_done) else 0

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (
                started_at, ended_at, duration_sec, map_name, difficulty,
                predicted_ghost, actual_ghost, is_win, perfect_game,
                evidence_count, sanity_start, sanity_end, hunt_count, max_ghost_speed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                started_at,
                ended_at,
                duration_sec,
                map_name,
                difficulty,
                predicted_ghost,
                actual_ghost,
                is_win,
                perfect_game,
                int(match_data.get("evidence_count", 2)),
                float(match_data.get("sanity_start", 100.0)),
                float(match_data.get("sanity_end", 40.0)),
                int(match_data.get("hunt_count", 0)),
                float(match_data.get("max_ghost_speed", 1.70)),
            ),
        )
        match_id = cursor.lastrowid

        for obj in objectives:
            text = str(obj.get("text") or obj.get("objective_text") or "Objective")
            done = 1 if obj.get("completed") else 0
            cursor.execute(
                "INSERT INTO match_objectives (match_id, objective_text, completed) VALUES (?, ?, ?)",
                (match_id, text, done),
            )

        events = match_data.get("events", [])
        for ev in events:
            ts = float(ev.get("timestamp", ended_at))
            ev_type = str(ev.get("type", "evidence"))
            detail = str(ev.get("detail", ""))
            cursor.execute(
                "INSERT INTO match_events (match_id, timestamp, event_type, detail) VALUES (?, ?, ?, ?)",
                (match_id, ts, ev_type, detail),
            )

        conn.commit()
        return match_id


def get_history(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM matches ORDER BY ended_at DESC LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()
        matches: List[Dict[str, Any]] = []
        for r in rows:
            m = dict(r)
            cursor.execute(
                "SELECT objective_text, completed FROM match_objectives WHERE match_id = ?",
                (m["id"],),
            )
            m["objectives"] = [dict(o) for o in cursor.fetchall()]
            matches.append(m)
        return matches


def get_analytics_summary() -> Dict[str, Any]:
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), SUM(is_win), SUM(perfect_game), AVG(duration_sec) FROM matches")
        row = cursor.fetchone()
        total_matches = int(row[0] or 0)
        total_wins = int(row[1] or 0)
        perfect_games = int(row[2] or 0)
        avg_duration = round(float(row[3] or 0.0), 1)
        accuracy_pct = round((total_wins / float(total_matches)) * 100.0, 1) if total_matches > 0 else 0.0

        # Ghost encounters
        cursor.execute(
            """
            SELECT actual_ghost, COUNT(*) as cnt, SUM(is_win) as wins
            FROM matches
            WHERE actual_ghost IS NOT NULL AND actual_ghost != ''
            GROUP BY actual_ghost
            ORDER BY cnt DESC
            LIMIT 15
            """
        )
        ghost_distribution = [
            {"ghost": str(r["actual_ghost"]), "count": int(r["cnt"]), "wins": int(r["wins"] or 0)}
            for r in cursor.fetchall()
        ]

        # Map breakdown
        cursor.execute(
            """
            SELECT map_name, COUNT(*) as cnt, SUM(is_win) as wins, AVG(duration_sec) as avg_time
            FROM matches
            GROUP BY map_name
            ORDER BY cnt DESC
            """
        )
        map_records = [
            {
                "map": str(r["map_name"]),
                "count": int(r["cnt"]),
                "wins": int(r["wins"] or 0),
                "win_rate": round((float(r["wins"] or 0) / float(r["cnt"])) * 100.0, 1) if r["cnt"] > 0 else 0.0,
                "avg_time": round(float(r["avg_time"] or 0.0), 1),
            }
            for r in cursor.fetchall()
        ]

        # Recent 8 matches
        recent = get_history(limit=8, offset=0)

        return {
            "total_matches": total_matches,
            "wins": total_wins,
            "losses": total_matches - total_wins,
            "accuracy_pct": accuracy_pct,
            "perfect_games": perfect_games,
            "avg_duration_sec": avg_duration,
            "ghost_distribution": ghost_distribution,
            "map_records": map_records,
            "recent_matches": recent,
        }
