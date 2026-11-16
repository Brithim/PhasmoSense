"""
PhasmoSense Startup Delta Auto-Updater
Queries public GitHub repository commits on application startup via HTTPS.
Downloads only modified/added delta files, runs pip if requirements.txt changed,
and stores pending changelog notes for the in-app What's New modal.
Completely standalone using Python standard library (no pip dependencies required).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT_DIR / "version.json"
BACKEND_DIR = ROOT_DIR / "backend"
REQ_FILE = BACKEND_DIR / "requirements.txt"

DEFAULT_REPO = "Brithim/PhasmoSense"
TIMEOUT_SEC = 2.5


def load_version_info() -> Dict[str, Any]:
    if VERSION_FILE.exists():
        try:
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "version": "2.1.0",
        "github_repo": DEFAULT_REPO,
        "commit_sha": "initial",
        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pending_changelog": None,
    }


def save_version_info(info: Dict[str, Any]) -> None:
    try:
        with open(VERSION_FILE, "w", encoding="utf-8") as f:
            json.dump(info, f, indent=2)
    except Exception as e:
        print(f"[Updater] Warning: could not write version.json: {e}")


def fetch_json(url: str, timeout: float = TIMEOUT_SEC) -> Optional[Dict[str, Any]]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "PhasmoSense-AutoUpdater/2.1",
            "Accept": "application/vnd.github.v3+json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
    return None


def download_file(url: str, dest_path: Path, timeout: float = 6.0) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "PhasmoSense-AutoUpdater/2.1",
        },
    )
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = dest_path.with_suffix(dest_path.suffix + ".ps_tmp")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            with open(temp_dest, "wb") as out_f:
                out_f.write(resp.read())
        # Atomic replace
        if temp_dest.exists():
            if dest_path.exists():
                dest_path.unlink()
            temp_dest.rename(dest_path)
            return True
    except Exception as e:
        print(f"[Updater] Failed downloading {dest_path.name}: {e}")
        if temp_dest.exists():
            try:
                temp_dest.unlink()
            except Exception:
                pass
    return False


def run_pip_install(req_path: Path) -> None:
    """Updates Python virtualenv packages if requirements.txt was updated."""
    python_exe = sys.executable
    print("[Updater] Updating Python dependencies from requirements.txt...")
    try:
        import subprocess

        cmd = [
            python_exe,
            "-m",
            "pip",
            "install",
            "-r",
            str(req_path),
            "--no-warn-script-location",
            "--quiet",
        ]
        subprocess.run(cmd, timeout=90, check=False)
        print("[Updater] Dependencies up to date.")
    except Exception as e:
        print(f"[Updater] pip install note: {e}")


def check_and_apply_updates() -> bool:
    """
    Checks GitHub for updates. If found, delta-downloads modified files.
    Returns True if an update was applied, False otherwise.
    Never blocks or crashes - falls back to launching immediately if offline.
    """
    ver = load_version_info()
    repo = ver.get("github_repo", DEFAULT_REPO).strip()
    if not repo:
        return False

    print(f"[Updater] Checking for updates ({repo})...")
    commits_url = f"https://api.github.com/repos/{repo}/commits/main"
    latest_commit = fetch_json(commits_url, timeout=TIMEOUT_SEC)

    if not latest_commit or "sha" not in latest_commit:
        print("[Updater] Offline or repository unreachable. Launching local PhasmoSense...")
        return False

    remote_sha = latest_commit["sha"]
    local_sha = ver.get("commit_sha", "")

    if local_sha and local_sha == remote_sha:
        print(f"[Updater] PhasmoSense is up to date (commit: {remote_sha[:7]}).")
        return False

    commit_msg = latest_commit.get("commit", {}).get("message", "Recent updates and improvements.")
    author_name = latest_commit.get("commit", {}).get("author", {}).get("name", "Developer")
    commit_date = latest_commit.get("commit", {}).get("author", {}).get("date", "")

    print(f"[Updater] New update found: {remote_sha[:7]} by {author_name}")
    print(f"[Updater] Notes: {commit_msg.strip().splitlines()[0]}")

    # Determine modified files
    modified_files: List[str] = []
    removed_files: List[str] = []

    if local_sha and local_sha != "initial":
        compare_url = f"https://api.github.com/repos/{repo}/compare/{local_sha}...{remote_sha}"
        diff_data = fetch_json(compare_url, timeout=TIMEOUT_SEC * 1.5)
        if diff_data and "files" in diff_data:
            for item in diff_data["files"]:
                fn = item.get("filename", "")
                st = item.get("status", "")
                if st in ("modified", "added"):
                    modified_files.append(fn)
                elif st == "removed":
                    removed_files.append(fn)

    # Fallback to single-commit files if compare failed or initial
    if not modified_files and "files" in latest_commit:
        for item in latest_commit["files"]:
            fn = item.get("filename", "")
            st = item.get("status", "")
            if st in ("modified", "added"):
                modified_files.append(fn)
            elif st == "removed":
                removed_files.append(fn)

    if not modified_files:
        # Commit had no file changes or full tree sync needed
        ver["commit_sha"] = remote_sha
        save_version_info(ver)
        return False

    print(f"[Updater] Downloading {len(modified_files)} updated file(s)...")
    downloaded_count = 0
    requirements_changed = False

    raw_base = f"https://raw.githubusercontent.com/{repo}/{remote_sha}"

    for rel_path in modified_files:
        # Ignore git / ide files
        if rel_path.startswith(".git") or rel_path.startswith(".gemini"):
            continue
        dest = ROOT_DIR / rel_path.replace("/", os.sep)
        file_url = f"{raw_base}/{rel_path}"
        if download_file(file_url, dest):
            downloaded_count += 1
            if "requirements.txt" in rel_path.lower():
                requirements_changed = True

    # Clean removed files
    for rel_path in removed_files:
        dest = ROOT_DIR / rel_path.replace("/", os.sep)
        if dest.exists() and dest.is_file():
            try:
                dest.unlink()
            except Exception:
                pass

    if requirements_changed and REQ_FILE.exists():
        run_pip_install(REQ_FILE)

    # Record changelog for in-app modal
    ver["commit_sha"] = remote_sha
    ver["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ver["pending_changelog"] = {
        "commit_sha": remote_sha[:7],
        "date": commit_date,
        "author": author_name,
        "message": commit_msg.strip(),
        "files_updated": downloaded_count,
    }
    save_version_info(ver)

    print(f"[Updater] Successfully updated {downloaded_count} files!")
    return True


if __name__ == "__main__":
    check_and_apply_updates()
