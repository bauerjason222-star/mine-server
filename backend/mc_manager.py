"""Minecraft server management: download jars, run java processes, console, mods, backups."""
import os
import re
import glob
import json
import time
import shutil
import zipfile
import threading
import subprocess
from pathlib import Path
from collections import deque
from datetime import datetime, timezone

import requests

SERVERS_DIR = Path("/app/servers")
SERVERS_DIR.mkdir(parents=True, exist_ok=True)

JAVA17 = "/usr/lib/jvm/java-17-openjdk-arm64/bin/java"
_j21 = glob.glob("/app/runtimes/jdk-*/bin/java")
JAVA21 = _j21[0] if _j21 else JAVA17

UA = {"User-Agent": "MineHost/1.0 (minecraft-host-panel)"}

# In-memory runtime state per server (lost on backend restart -> servers are stopped)
RUNTIME = {}
_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Java selection
# ---------------------------------------------------------------------------
def java_bin(mc_version: str) -> str:
    """Pick a JDK based on the Minecraft version. New (date-based) versions -> Java 21."""
    m = re.match(r"^1\.(\d+)(?:\.(\d+))?", mc_version or "")
    if m:
        minor = int(m.group(1))
        patch = int(m.group(2) or 0)
        if minor < 20 or (minor == 20 and patch < 5):
            return JAVA17
        return JAVA21
    # date-based / unknown -> newest
    return JAVA21


# ---------------------------------------------------------------------------
# Version listings
# ---------------------------------------------------------------------------
def get_versions(server_type: str):
    try:
        if server_type == "vanilla":
            data = requests.get(
                "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
                headers=UA, timeout=20).json()
            return [v["id"] for v in data["versions"] if v["type"] == "release"]
        if server_type == "paper":
            data = requests.get("https://fill.papermc.io/v3/projects/paper",
                                headers=UA, timeout=20).json()
            out = []
            for _major, vers in data.get("versions", {}).items():
                out.extend(vers)
            # keep only clean release ids (no rc/pre/snapshot)
            out = [v for v in out if re.match(r"^[\d.]+$", v)]
            return out
        if server_type == "fabric":
            data = requests.get("https://meta.fabricmc.net/v2/versions/game",
                                headers=UA, timeout=20).json()
            return [v["version"] for v in data if v.get("stable")]
        if server_type == "forge":
            data = requests.get(
                "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
                headers=UA, timeout=20).json()
            promos = data.get("promos", {})
            seen = []
            for key in promos.keys():  # e.g. "1.20.1-latest"
                mc = key.rsplit("-", 1)[0]
                if mc not in seen:
                    seen.append(mc)
            return seen
    except Exception as e:
        print("get_versions error", server_type, e)
    return []


def _forge_build(mc_version: str):
    data = requests.get(
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
        headers=UA, timeout=20).json()
    promos = data.get("promos", {})
    return promos.get(f"{mc_version}-recommended") or promos.get(f"{mc_version}-latest")


# ---------------------------------------------------------------------------
# Runtime helpers
# ---------------------------------------------------------------------------
def _ensure_runtime(server_id: str):
    if server_id not in RUNTIME:
        RUNTIME[server_id] = {
            "status": "stopped",
            "process": None,
            "logs": deque(maxlen=4000),
            "log_counter": 0,
            "players": set(),
            "thread": None,
            "message": "",
        }
    return RUNTIME[server_id]


def _log(server_id: str, line: str):
    rt = _ensure_runtime(server_id)
    rt["log_counter"] += 1
    rt["logs"].append({"i": rt["log_counter"], "text": line.rstrip("\n")})


def get_status(server_id: str) -> str:
    rt = RUNTIME.get(server_id)
    return rt["status"] if rt else "stopped"


def get_state(server_id: str):
    rt = RUNTIME.get(server_id)
    if not rt:
        return {"status": "stopped", "players": [], "message": ""}
    return {"status": rt["status"], "players": sorted(rt["players"]), "message": rt.get("message", "")}


def get_logs(server_id: str, since: int = 0):
    rt = RUNTIME.get(server_id)
    if not rt:
        return {"lines": [], "last": 0, "status": "stopped"}
    lines = [l for l in list(rt["logs"]) if l["i"] > since]
    last = rt["log_counter"]
    return {"lines": lines, "last": last, "status": rt["status"]}


def get_metrics(server_id: str):
    rt = RUNTIME.get(server_id)
    if not rt or not rt.get("process"):
        return {"cpu": 0, "memory_mb": 0}
    try:
        import psutil
        p = psutil.Process(rt["process"].pid)
        mem = p.memory_info().rss / (1024 * 1024)
        cpu = p.cpu_percent(interval=0.0)
        return {"cpu": round(cpu, 1), "memory_mb": round(mem)}
    except Exception:
        return {"cpu": 0, "memory_mb": 0}


# ---------------------------------------------------------------------------
# server.properties
# ---------------------------------------------------------------------------
def write_properties(server_dir: Path, properties: dict, port: int):
    props = dict(properties or {})
    props["server-port"] = str(port)
    props["query.port"] = str(port)
    lines = ["#Minecraft server properties", f"#{datetime.now(timezone.utc).isoformat()}"]
    for k, v in props.items():
        if isinstance(v, bool):
            v = "true" if v else "false"
        lines.append(f"{k}={v}")
    (server_dir / "server.properties").write_text("\n".join(lines) + "\n")


def write_eula(server_dir: Path):
    (server_dir / "eula.txt").write_text("eula=true\n")


# ---------------------------------------------------------------------------
# Install (download jars)
# ---------------------------------------------------------------------------
def _download(url: str, dest: Path, server_id: str = None, label: str = ""):
    if server_id:
        _log(server_id, f"[installer] downloading {label} ...")
    with requests.get(url, headers=UA, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 16):
                f.write(chunk)
    if server_id:
        _log(server_id, f"[installer] {label} downloaded ({dest.stat().st_size // 1024} KB)")


def install_server(server: dict):
    """Runs in a background thread. Downloads the correct jar and sets up the server dir."""
    sid = server["id"]
    rt = _ensure_runtime(sid)
    rt["status"] = "installing"
    rt["message"] = "Installing..."
    stype = server["type"]
    mcv = server["mc_version"]
    sdir = SERVERS_DIR / sid
    sdir.mkdir(parents=True, exist_ok=True)
    (sdir / "mods").mkdir(exist_ok=True)
    (sdir / "plugins").mkdir(exist_ok=True)
    try:
        _log(sid, f"=== Installing {stype} {mcv} ===")
        if stype == "vanilla":
            manifest = requests.get(
                "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
                headers=UA, timeout=20).json()
            entry = next(v for v in manifest["versions"] if v["id"] == mcv)
            vjson = requests.get(entry["url"], headers=UA, timeout=20).json()
            url = vjson["downloads"]["server"]["url"]
            _download(url, sdir / "server.jar", sid, "server.jar")
            server["jar"] = "server.jar"
            server["start_type"] = "jar"

        elif stype == "paper":
            b = requests.get(
                f"https://fill.papermc.io/v3/projects/paper/versions/{mcv}/builds/latest",
                headers=UA, timeout=20).json()
            dl = b["downloads"]["server:default"]
            _download(dl["url"], sdir / "server.jar", sid, dl["name"])
            server["jar"] = "server.jar"
            server["start_type"] = "jar"

        elif stype == "fabric":
            loaders = requests.get("https://meta.fabricmc.net/v2/versions/loader",
                                   headers=UA, timeout=20).json()
            loader = next(l["version"] for l in loaders if l.get("stable"))
            installers = requests.get("https://meta.fabricmc.net/v2/versions/installer",
                                      headers=UA, timeout=20).json()
            installer = next(i["version"] for i in installers if i.get("stable"))
            url = (f"https://meta.fabricmc.net/v2/versions/loader/"
                   f"{mcv}/{loader}/{installer}/server/jar")
            _download(url, sdir / "server.jar", sid, "fabric-server-launcher.jar")
            server["jar"] = "server.jar"
            server["loader_version"] = loader
            server["start_type"] = "jar"

        elif stype == "forge":
            build = _forge_build(mcv)
            if not build:
                raise RuntimeError(f"No Forge build found for {mcv}")
            full = f"{mcv}-{build}"
            inst_url = (f"https://maven.minecraftforge.net/net/minecraftforge/forge/"
                        f"{full}/forge-{full}-installer.jar")
            inst_path = sdir / "forge-installer.jar"
            _download(inst_url, inst_path, sid, "forge-installer.jar")
            _log(sid, "[installer] running Forge installServer (this can take a while)...")
            jbin = java_bin(mcv)
            proc = subprocess.run([jbin, "-jar", str(inst_path), "--installServer"],
                                  cwd=str(sdir), capture_output=True, text=True, timeout=600)
            for ln in (proc.stdout or "").splitlines()[-20:]:
                _log(sid, "[forge] " + ln)
            args_files = glob.glob(str(sdir / "libraries/net/minecraftforge/forge/*/unix_args.txt"))
            if args_files:
                server["forge_args"] = os.path.relpath(args_files[0], sdir)
                server["start_type"] = "forge"
            else:
                srv_jars = glob.glob(str(sdir / f"forge-{full}*.jar"))
                srv_jars = [j for j in srv_jars if "installer" not in j]
                if srv_jars:
                    server["jar"] = os.path.basename(srv_jars[0])
                    server["start_type"] = "jar"
                else:
                    raise RuntimeError("Forge install finished but no runnable file found")
            server["loader_version"] = build

        else:
            raise RuntimeError(f"Unknown server type {stype}")

        write_eula(sdir)
        write_properties(sdir, server.get("properties", {}), server["port"])
        rt["status"] = "stopped"
        rt["message"] = "Ready"
        _log(sid, "=== Installation complete. Server is ready to start. ===")
        return {"ok": True, "server": server}
    except Exception as e:
        rt["status"] = "error"
        rt["message"] = f"Install failed: {e}"
        _log(sid, f"[installer] ERROR: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Start / stop / console
# ---------------------------------------------------------------------------
_JOIN_RE = re.compile(r"\]: (\w+) joined the game")
_LEFT_RE = re.compile(r"\]: (\w+) left the game")
_DONE_RE = re.compile(r'\]: Done \(', re.IGNORECASE)


def _reader_thread(server_id: str, proc):
    rt = _ensure_runtime(server_id)
    for raw in iter(proc.stdout.readline, ""):
        if raw == "":
            break
        line = raw.rstrip("\n")
        _log(server_id, line)
        if _DONE_RE.search(line):
            rt["status"] = "running"
            rt["message"] = "Running"
        m = _JOIN_RE.search(line)
        if m:
            rt["players"].add(m.group(1))
        m = _LEFT_RE.search(line)
        if m:
            rt["players"].discard(m.group(1))
    proc.wait()
    rt["status"] = "stopped"
    rt["players"] = set()
    rt["process"] = None
    rt["message"] = "Stopped"
    _log(server_id, "=== Server process exited. ===")


def start_server(server: dict):
    sid = server["id"]
    rt = _ensure_runtime(sid)
    if rt["status"] in ("starting", "running"):
        return {"ok": False, "error": "Server already running"}
    sdir = SERVERS_DIR / sid
    if not sdir.exists():
        return {"ok": False, "error": "Server files missing"}

    write_eula(sdir)
    write_properties(sdir, server.get("properties", {}), server["port"])

    ram = int(server.get("ram_mb", 1024))
    jbin = java_bin(server["mc_version"])
    start_type = server.get("start_type", "jar")

    if start_type == "forge" and server.get("forge_args"):
        (sdir / "user_jvm_args.txt").write_text(f"-Xmx{ram}M\n-Xms{ram}M\n")
        cmd = [jbin, "@user_jvm_args.txt", "@" + server["forge_args"], "nogui"]
    else:
        jar = server.get("jar", "server.jar")
        cmd = [jbin, f"-Xms{ram}M", f"-Xmx{ram}M", "-jar", jar, "nogui"]

    rt["status"] = "starting"
    rt["message"] = "Starting..."
    rt["players"] = set()
    _log(sid, f"=== Starting server: {' '.join(cmd)} ===")
    try:
        proc = subprocess.Popen(
            cmd, cwd=str(sdir),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
    except Exception as e:
        rt["status"] = "error"
        rt["message"] = str(e)
        _log(sid, f"[start] ERROR: {e}")
        return {"ok": False, "error": str(e)}
    rt["process"] = proc
    t = threading.Thread(target=_reader_thread, args=(sid, proc), daemon=True)
    t.start()
    rt["thread"] = t
    return {"ok": True}


def send_command(server_id: str, command: str):
    rt = RUNTIME.get(server_id)
    if not rt or not rt.get("process") or rt["status"] not in ("running", "starting"):
        return {"ok": False, "error": "Server not running"}
    try:
        rt["process"].stdin.write(command + "\n")
        rt["process"].stdin.flush()
        _log(server_id, f"> {command}")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def stop_server(server_id: str):
    rt = RUNTIME.get(server_id)
    if not rt or not rt.get("process"):
        return {"ok": False, "error": "Server not running"}
    rt["status"] = "stopping"
    rt["message"] = "Stopping..."
    _log(server_id, "=== Stopping server... ===")
    proc = rt["process"]
    try:
        proc.stdin.write("stop\n")
        proc.stdin.flush()
    except Exception:
        pass

    def _killer():
        try:
            proc.wait(timeout=30)
        except Exception:
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                proc.kill()

    threading.Thread(target=_killer, daemon=True).start()
    return {"ok": True}


def delete_server_files(server_id: str):
    rt = RUNTIME.get(server_id)
    if rt and rt.get("process"):
        try:
            rt["process"].kill()
        except Exception:
            pass
    RUNTIME.pop(server_id, None)
    sdir = SERVERS_DIR / server_id
    if sdir.exists():
        shutil.rmtree(sdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Mods (Modrinth)
# ---------------------------------------------------------------------------
def _mod_dir(server: dict) -> Path:
    sub = "plugins" if server["type"] == "paper" else "mods"
    d = SERVERS_DIR / server["id"] / sub
    d.mkdir(parents=True, exist_ok=True)
    return d


def modrinth_search(query: str, loader: str, mc_version: str, project_type: str):
    facets = [[f"project_type:{project_type}"]]
    if loader:
        facets.append([f"categories:{loader}"])
    if mc_version:
        facets.append([f"versions:{mc_version}"])
    params = {
        "query": query or "",
        "limit": 30,
        "index": "relevance",
        "facets": json.dumps(facets),
    }
    r = requests.get("https://api.modrinth.com/v2/search", params=params,
                     headers=UA, timeout=20)
    r.raise_for_status()
    hits = r.json().get("hits", [])
    return [{
        "project_id": h["project_id"],
        "slug": h["slug"],
        "title": h["title"],
        "description": h["description"],
        "author": h["author"],
        "downloads": h["downloads"],
        "icon_url": h.get("icon_url"),
        "categories": h.get("categories", []),
    } for h in hits]


def modrinth_install(server: dict, project_id: str):
    loader = {"paper": "paper", "fabric": "fabric", "forge": "forge"}.get(server["type"])
    mcv = server["mc_version"]
    params = {"loaders": json.dumps([loader]) if loader else None,
              "game_versions": json.dumps([mcv])}
    params = {k: v for k, v in params.items() if v}
    r = requests.get(f"https://api.modrinth.com/v2/project/{project_id}/version",
                     params=params, headers=UA, timeout=20)
    r.raise_for_status()
    versions = r.json()
    if not versions:
        # relax filters -> any version
        r = requests.get(f"https://api.modrinth.com/v2/project/{project_id}/version",
                         headers=UA, timeout=20)
        versions = r.json()
    if not versions:
        return {"ok": False, "error": "No compatible file found for this server"}
    ver = versions[0]
    primary = next((f for f in ver["files"] if f.get("primary")), ver["files"][0])
    dest = _mod_dir(server) / primary["filename"]
    _download(primary["url"], dest)
    return {"ok": True, "filename": primary["filename"], "version": ver.get("version_number")}


def list_mods(server: dict):
    d = _mod_dir(server)
    out = []
    for f in sorted(d.glob("*.jar")):
        out.append({"filename": f.name, "size_kb": f.stat().st_size // 1024})
    return out


def remove_mod(server: dict, filename: str):
    # prevent path traversal
    safe = os.path.basename(filename)
    f = _mod_dir(server) / safe
    if f.exists():
        f.unlink()
        return {"ok": True}
    return {"ok": False, "error": "File not found"}


# ---------------------------------------------------------------------------
# Backups
# ---------------------------------------------------------------------------
def _backup_dir(server_id: str) -> Path:
    d = SERVERS_DIR / server_id / "_backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_backup(server: dict, level_name: str = "world"):
    sid = server["id"]
    sdir = SERVERS_DIR / sid
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"backup-{stamp}.zip"
    dest = _backup_dir(sid) / name
    targets = [t for t in (level_name, f"{level_name}_nether", f"{level_name}_the_end")
               if (sdir / t).exists()]
    if not targets:
        return {"ok": False, "error": "No world folder found yet. Start the server once."}
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for t in targets:
            base = sdir / t
            for root, _dirs, files in os.walk(base):
                for fn in files:
                    fp = Path(root) / fn
                    z.write(fp, os.path.relpath(fp, sdir))
    return {"ok": True, "name": name, "size_kb": dest.stat().st_size // 1024}


def list_backups(server_id: str):
    d = _backup_dir(server_id)
    out = []
    for f in sorted(d.glob("*.zip"), reverse=True):
        out.append({
            "name": f.name,
            "size_kb": f.stat().st_size // 1024,
            "created": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat(),
        })
    return out


def delete_backup(server_id: str, name: str):
    f = _backup_dir(server_id) / os.path.basename(name)
    if f.exists():
        f.unlink()
        return {"ok": True}
    return {"ok": False, "error": "Not found"}


def restore_backup(server: dict, name: str, level_name: str = "world"):
    sid = server["id"]
    if get_status(sid) in ("running", "starting"):
        return {"ok": False, "error": "Stop the server before restoring"}
    sdir = SERVERS_DIR / sid
    f = _backup_dir(sid) / os.path.basename(name)
    if not f.exists():
        return {"ok": False, "error": "Backup not found"}
    for t in (level_name, f"{level_name}_nether", f"{level_name}_the_end"):
        if (sdir / t).exists():
            shutil.rmtree(sdir / t, ignore_errors=True)
    with zipfile.ZipFile(f, "r") as z:
        z.extractall(sdir)
    return {"ok": True}
