import glob
import json
import os
import urllib.request
import zipfile
from pathlib import Path


def ensure_electron_binary() -> None:
    root_dir = Path(__file__).resolve().parent.parent
    electron_dir = root_dir / "overlay" / "node_modules" / "electron"
    dist_dir = electron_dir / "dist"
    electron_exe = dist_dir / "electron.exe"

    if electron_exe.exists():
        print("[Setup] Electron runtime verified:", electron_exe)
        return

    pkg_json = electron_dir / "package.json"
    version = "33.4.11"
    if pkg_json.exists():
        try:
            version = json.loads(pkg_json.read_text(encoding="utf-8")).get(
                "version", version
            )
        except Exception:
            pass

    dist_dir.mkdir(parents=True, exist_ok=True)

    # 1. Check if @electron/get already cached the zip in %LOCALAPPDATA%\electron\Cache
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    cached_zip = None
    if local_app_data:
        pattern = os.path.join(
            local_app_data,
            "electron",
            "Cache",
            "**",
            f"electron-v{version}-win32-x64.zip",
        )
        matches = glob.glob(pattern, recursive=True)
        if matches:
            cached_zip = Path(matches[0])

    # 2. If not cached, download directly from official Electron GitHub Releases
    if cached_zip is None or not cached_zip.exists():
        url = f"https://github.com/electron/electron/releases/download/v{version}/electron-v{version}-win32-x64.zip"
        cached_zip = dist_dir / f"electron-v{version}-win32-x64.zip"
        print(f"[Setup] Downloading Electron v{version} runtime...")
        urllib.request.urlretrieve(url, str(cached_zip))

    print(f"[Setup] Extracting {cached_zip.name} -> {dist_dir} ...")
    with zipfile.ZipFile(cached_zip, "r") as zf:
        zf.extractall(dist_dir)

    (electron_dir / "path.txt").write_text("electron.exe", encoding="utf-8")
    print("[Setup] Electron runtime extracted successfully!")


if __name__ == "__main__":
    ensure_electron_binary()
