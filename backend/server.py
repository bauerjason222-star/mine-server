from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import os
import asyncio
import logging
import uuid
import threading
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone

import mc_manager as mc
import scheduler as sched_mod
from properties_schema import PROPERTY_SCHEMA, GROUP_ORDER, default_properties

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
# Synchronous client for use inside background threads (avoids cross-event-loop errors)
sync_db = MongoClient(mongo_url)[os.environ['DB_NAME']]

app = FastAPI(title="MineHost API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ServerCreate(BaseModel):
    name: str
    type: str  # vanilla | paper | fabric | forge
    mc_version: str
    ram_mb: int = 1024
    port: Optional[int] = None


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    ram_mb: Optional[int] = None
    auto_restart: Optional[bool] = None


class PlayerActionBody(BaseModel):
    name: str
    reason: Optional[str] = ""


class DiscordConfig(BaseModel):
    enabled: Optional[bool] = None
    bot_token: Optional[str] = None
    channel_id: Optional[str] = None
    notify_deaths: Optional[bool] = None
    notify_advancements: Optional[bool] = None


class ScheduleCreate(BaseModel):
    action: str          # restart | backup
    mode: str = "daily"  # daily | interval
    time: Optional[str] = "04:00"
    interval_hours: Optional[int] = 6
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    time: Optional[str] = None
    interval_hours: Optional[int] = None


class PropertiesUpdate(BaseModel):
    properties: Dict[str, str]


class CommandBody(BaseModel):
    command: str


class ModInstallBody(BaseModel):
    project_id: str


class BackupRestoreBody(BaseModel):
    name: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def public_server(s: dict) -> dict:
    state = mc.get_state(s["id"])
    return {
        "id": s["id"],
        "name": s["name"],
        "type": s["type"],
        "mc_version": s["mc_version"],
        "loader_version": s.get("loader_version"),
        "ram_mb": s.get("ram_mb", 1024),
        "port": s["port"],
        "auto_restart": s.get("auto_restart", False),
        "created_at": s.get("created_at"),
        "properties": s.get("properties", {}),
        "status": state["status"],
        "players": state["players"],
        "message": state["message"],
    }


async def get_server_or_404(server_id: str) -> dict:
    s = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Server not found")
    return s


async def next_port() -> int:
    ports = [s["port"] async for s in db.servers.find({}, {"_id": 0, "port": 1})]
    p = 25565
    while p in ports:
        p += 1
    return p


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "MineHost API", "java_ready": True}


@api_router.get("/versions/{server_type}")
async def versions(server_type: str):
    if server_type not in ("vanilla", "paper", "fabric", "forge"):
        raise HTTPException(400, "Invalid server type")
    return {"versions": mc.get_versions(server_type)}


@api_router.get("/property-schema")
async def property_schema():
    return {"schema": PROPERTY_SCHEMA, "groups": GROUP_ORDER}


@api_router.get("/servers")
async def list_servers():
    servers = await db.servers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_server(s) for s in servers]


@api_router.post("/servers")
async def create_server(body: ServerCreate):
    if body.type not in ("vanilla", "paper", "fabric", "forge"):
        raise HTTPException(400, "Invalid server type")
    port = body.port or await next_port()
    server = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "type": body.type,
        "mc_version": body.mc_version,
        "ram_mb": max(512, int(body.ram_mb)),
        "port": port,
        "properties": default_properties(),
        "auto_restart": False,
        "discord": {"enabled": False, "bot_token": "", "channel_id": "",
                    "notify_deaths": True, "notify_advancements": True},
        "schedules": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "jar": None,
        "start_type": "jar",
    }
    await db.servers.insert_one(dict(server))

    def _do_install():
        result = mc.install_server(server)
        if result.get("ok"):
            sync_db.servers.update_one(
                {"id": server["id"]},
                {"$set": {"jar": server.get("jar"),
                          "start_type": server.get("start_type"),
                          "forge_args": server.get("forge_args"),
                          "loader_version": server.get("loader_version")}})

    threading.Thread(target=_do_install, daemon=True).start()
    return public_server(server)


@api_router.get("/servers/{server_id}")
async def get_server(server_id: str):
    s = await get_server_or_404(server_id)
    return public_server(s)


@api_router.put("/servers/{server_id}")
async def update_server(server_id: str, body: ServerUpdate):
    s = await get_server_or_404(server_id)
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.ram_mb is not None:
        updates["ram_mb"] = max(512, int(body.ram_mb))
    if body.auto_restart is not None:
        updates["auto_restart"] = bool(body.auto_restart)
        rt = mc.RUNTIME.get(server_id)
        if rt:
            rt["auto_restart"] = bool(body.auto_restart)
    if updates:
        await db.servers.update_one({"id": server_id}, {"$set": updates})
        s.update(updates)
    return public_server(s)


@api_router.delete("/servers/{server_id}")
async def delete_server(server_id: str):
    await get_server_or_404(server_id)
    sched_mod.remove_server(server_id)
    mc.delete_server_files(server_id)
    await db.servers.delete_one({"id": server_id})
    return {"ok": True}


# --- properties ---
@api_router.get("/servers/{server_id}/properties")
async def get_properties(server_id: str):
    s = await get_server_or_404(server_id)
    props = default_properties()
    props.update(s.get("properties", {}))
    return {"properties": props}


@api_router.put("/servers/{server_id}/properties")
async def save_properties(server_id: str, body: PropertiesUpdate):
    s = await get_server_or_404(server_id)
    props = default_properties()
    props.update(s.get("properties", {}))
    props.update(body.properties)
    await db.servers.update_one({"id": server_id}, {"$set": {"properties": props}})
    return {"ok": True, "properties": props}


# --- lifecycle ---
@api_router.post("/servers/{server_id}/start")
async def start(server_id: str):
    s = await get_server_or_404(server_id)
    if mc.get_status(server_id) == "installing":
        raise HTTPException(400, "Server is still installing")
    res = mc.start_server(s)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return {"ok": True}


@api_router.post("/servers/{server_id}/stop")
async def stop(server_id: str):
    await get_server_or_404(server_id)
    res = mc.stop_server(server_id)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return {"ok": True}


@api_router.post("/servers/{server_id}/restart")
async def restart(server_id: str):
    s = await get_server_or_404(server_id)
    mc.stop_server(server_id)

    def _wait_start():
        import time
        for _ in range(40):
            if mc.get_status(server_id) == "stopped":
                break
            time.sleep(1)
        mc.start_server(s)

    threading.Thread(target=_wait_start, daemon=True).start()
    return {"ok": True}


@api_router.get("/servers/{server_id}/console")
async def console(server_id: str, since: int = 0):
    await get_server_or_404(server_id)
    data = mc.get_logs(server_id, since)
    data["metrics"] = mc.get_metrics(server_id)
    data["players"] = mc.get_state(server_id)["players"]
    return data


@api_router.post("/servers/{server_id}/command")
async def command(server_id: str, body: CommandBody):
    await get_server_or_404(server_id)
    res = mc.send_command(server_id, body.command)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return {"ok": True}


# --- players (whitelist / ops / bans) ---
@api_router.get("/servers/{server_id}/players")
async def players_list(server_id: str):
    s = await get_server_or_404(server_id)
    return mc.get_player_lists(s)


@api_router.post("/servers/{server_id}/players/{list_type}")
async def players_add(server_id: str, list_type: str, body: PlayerActionBody):
    if list_type not in ("whitelist", "ops", "banned"):
        raise HTTPException(400, "Invalid list type")
    s = await get_server_or_404(server_id)
    res = mc.player_action(s, list_type, body.name, "add", body.reason or "")
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return mc.get_player_lists(s)


@api_router.delete("/servers/{server_id}/players/{list_type}/{name}")
async def players_remove(server_id: str, list_type: str, name: str):
    if list_type not in ("whitelist", "ops", "banned"):
        raise HTTPException(400, "Invalid list type")
    s = await get_server_or_404(server_id)
    res = mc.player_action(s, list_type, name, "remove")
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return mc.get_player_lists(s)


@api_router.post("/servers/{server_id}/players/kick/{name}")
async def players_kick(server_id: str, name: str):
    await get_server_or_404(server_id)
    res = mc.kick_player(server_id, name)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return {"ok": True}


# --- realtime console over WebSocket ---
@api_router.websocket("/servers/{server_id}/ws")
async def console_ws(websocket: WebSocket, server_id: str):
    await websocket.accept()
    since = 0
    try:
        while True:
            data = mc.get_logs(server_id, since)
            if data["lines"]:
                since = data["last"]
            state = mc.get_state(server_id)
            await websocket.send_json({
                "lines": data["lines"],
                "last": data["last"],
                "status": data["status"],
                "metrics": mc.get_metrics(server_id),
                "players": state["players"],
                "message": state["message"],
            })
            await asyncio.sleep(0.4)
    except WebSocketDisconnect:
        return
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
        return


# --- Discord notifications ---
@api_router.get("/servers/{server_id}/discord")
async def discord_get(server_id: str):
    s = await get_server_or_404(server_id)
    dc = s.get("discord", {}) or {}
    return {
        "enabled": dc.get("enabled", False),
        "channel_id": dc.get("channel_id", ""),
        "notify_deaths": dc.get("notify_deaths", True),
        "notify_advancements": dc.get("notify_advancements", True),
        "has_token": bool(dc.get("bot_token")),
    }


@api_router.put("/servers/{server_id}/discord")
async def discord_save(server_id: str, body: DiscordConfig):
    s = await get_server_or_404(server_id)
    dc = s.get("discord", {}) or {}
    if body.enabled is not None:
        dc["enabled"] = body.enabled
    if body.channel_id is not None:
        dc["channel_id"] = body.channel_id.strip()
    if body.notify_deaths is not None:
        dc["notify_deaths"] = body.notify_deaths
    if body.notify_advancements is not None:
        dc["notify_advancements"] = body.notify_advancements
    # Only overwrite token if a non-empty value was supplied
    if body.bot_token:
        dc["bot_token"] = body.bot_token.strip()
    await db.servers.update_one({"id": server_id}, {"$set": {"discord": dc}})
    rt = mc.RUNTIME.get(server_id)
    if rt and rt.get("server"):
        rt["server"]["discord"] = dc
    return {"ok": True, "has_token": bool(dc.get("bot_token"))}


@api_router.post("/servers/{server_id}/discord/test")
async def discord_test(server_id: str):
    s = await get_server_or_404(server_id)
    dc = s.get("discord", {}) or {}
    if not dc.get("bot_token") or not dc.get("channel_id"):
        raise HTTPException(400, "Set a bot token and channel ID first")
    res = mc.send_discord_message(dc["bot_token"], dc["channel_id"],
                                  f":white_check_mark: MineHost is connected to **{s['name']}**!")
    if not res["ok"]:
        raise HTTPException(400, f"Discord error ({res['status']}): {res['body']}")
    return {"ok": True}


# --- Scheduled tasks ---
@api_router.get("/servers/{server_id}/schedules")
async def schedules_list(server_id: str):
    s = await get_server_or_404(server_id)
    return {"schedules": s.get("schedules", [])}


@api_router.post("/servers/{server_id}/schedules")
async def schedules_add(server_id: str, body: ScheduleCreate):
    if body.action not in ("restart", "backup"):
        raise HTTPException(400, "Invalid action")
    if body.mode not in ("daily", "interval"):
        raise HTTPException(400, "Invalid mode")
    s = await get_server_or_404(server_id)
    schedules = s.get("schedules", [])
    entry = {
        "id": str(uuid.uuid4()),
        "action": body.action,
        "mode": body.mode,
        "time": body.time or "04:00",
        "interval_hours": int(body.interval_hours or 6),
        "enabled": body.enabled,
    }
    schedules.append(entry)
    await db.servers.update_one({"id": server_id}, {"$set": {"schedules": schedules}})
    sched_mod.reload_server(server_id)
    return {"ok": True, "schedules": schedules}


@api_router.put("/servers/{server_id}/schedules/{sched_id}")
async def schedules_update(server_id: str, sched_id: str, body: ScheduleUpdate):
    s = await get_server_or_404(server_id)
    schedules = s.get("schedules", [])
    found = False
    for e in schedules:
        if e["id"] == sched_id:
            found = True
            if body.enabled is not None:
                e["enabled"] = body.enabled
            if body.time is not None:
                e["time"] = body.time
            if body.interval_hours is not None:
                e["interval_hours"] = int(body.interval_hours)
    if not found:
        raise HTTPException(404, "Schedule not found")
    await db.servers.update_one({"id": server_id}, {"$set": {"schedules": schedules}})
    sched_mod.reload_server(server_id)
    return {"ok": True, "schedules": schedules}


@api_router.delete("/servers/{server_id}/schedules/{sched_id}")
async def schedules_delete(server_id: str, sched_id: str):
    s = await get_server_or_404(server_id)
    schedules = [e for e in s.get("schedules", []) if e["id"] != sched_id]
    await db.servers.update_one({"id": server_id}, {"$set": {"schedules": schedules}})
    sched_mod.reload_server(server_id)
    return {"ok": True, "schedules": schedules}


# --- mods ---
@api_router.get("/servers/{server_id}/mods/search")
async def mods_search(server_id: str, q: str = "", ):
    s = await get_server_or_404(server_id)
    loader = {"paper": "paper", "fabric": "fabric", "forge": "forge"}.get(s["type"], "")
    ptype = "plugin" if s["type"] == "paper" else "mod"
    try:
        results = mc.modrinth_search(q, loader, s["mc_version"], ptype)
    except Exception as e:
        raise HTTPException(502, f"Modrinth error: {e}")
    return {"results": results, "type": ptype}


@api_router.get("/servers/{server_id}/mods")
async def mods_list(server_id: str):
    s = await get_server_or_404(server_id)
    return {"mods": mc.list_mods(s), "kind": "plugin" if s["type"] == "paper" else "mod"}


@api_router.post("/servers/{server_id}/mods")
async def mods_install(server_id: str, body: ModInstallBody):
    s = await get_server_or_404(server_id)
    try:
        res = mc.modrinth_install(s, body.project_id)
    except Exception as e:
        raise HTTPException(502, f"Install error: {e}")
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return res


@api_router.delete("/servers/{server_id}/mods/{filename}")
async def mods_remove(server_id: str, filename: str):
    s = await get_server_or_404(server_id)
    res = mc.remove_mod(s, filename)
    if not res["ok"]:
        raise HTTPException(404, res["error"])
    return res


# --- backups ---
@api_router.get("/servers/{server_id}/backups")
async def backups_list(server_id: str):
    await get_server_or_404(server_id)
    return {"backups": mc.list_backups(server_id)}


@api_router.post("/servers/{server_id}/backups")
async def backups_create(server_id: str):
    s = await get_server_or_404(server_id)
    level = s.get("properties", {}).get("level-name", "world")
    res = mc.create_backup(s, level)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return res


@api_router.post("/servers/{server_id}/backups/restore")
async def backups_restore(server_id: str, body: BackupRestoreBody):
    s = await get_server_or_404(server_id)
    level = s.get("properties", {}).get("level-name", "world")
    res = mc.restore_backup(s, body.name, level)
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    return res


@api_router.delete("/servers/{server_id}/backups/{name}")
async def backups_delete(server_id: str, name: str):
    await get_server_or_404(server_id)
    res = mc.delete_backup(server_id, name)
    if not res["ok"]:
        raise HTTPException(404, res["error"])
    return res


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _start_scheduler():
    try:
        sched_mod.start()
        logger.info("Scheduler started")
    except Exception as e:
        logger.error(f"Scheduler start failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
