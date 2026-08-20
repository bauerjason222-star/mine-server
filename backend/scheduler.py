"""APScheduler-based scheduled tasks (auto-restart / backups) per server."""
import os
import time
from pathlib import Path
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pymongo import MongoClient

import mc_manager as mc

load_dotenv(Path(__file__).parent / ".env")
_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
scheduler = BackgroundScheduler()


def _job_id(server_id: str, sched_id: str) -> str:
    return f"{server_id}:{sched_id}"


def _run_action(server_id: str, action: str):
    server = _db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        return
    mc._log(server_id, f"[scheduler] Running scheduled task: {action}")
    if action == "backup":
        level = server.get("properties", {}).get("level-name", "world")
        res = mc.create_backup(server, level)
        mc._log(server_id, f"[scheduler] Backup result: {res}")
    elif action == "restart":
        if mc.get_status(server_id) in ("running", "starting"):
            mc.stop_server(server_id)
            for _ in range(45):
                if mc.get_status(server_id) == "stopped":
                    break
                time.sleep(1)
        mc.start_server(server, manual=True)


def _add_job(server_id: str, sched: dict):
    if not sched.get("enabled", True):
        return
    mode = sched.get("mode", "daily")
    jid = _job_id(server_id, sched["id"])
    if mode == "interval":
        trigger = IntervalTrigger(hours=max(1, int(sched.get("interval_hours", 6))))
    else:
        parts = str(sched.get("time", "04:00")).split(":")
        hh = int(parts[0]) if parts and parts[0] != "" else 4
        mm = int(parts[1]) if len(parts) > 1 and parts[1] != "" else 0
        trigger = CronTrigger(hour=hh, minute=mm)
    scheduler.add_job(_run_action, trigger, args=[server_id, sched["action"]],
                      id=jid, replace_existing=True)


def reload_server(server_id: str):
    for job in scheduler.get_jobs():
        if job.id.startswith(f"{server_id}:"):
            try:
                scheduler.remove_job(job.id)
            except Exception:
                pass
    server = _db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        return
    for sched in server.get("schedules", []):
        _add_job(server_id, sched)


def remove_server(server_id: str):
    for job in scheduler.get_jobs():
        if job.id.startswith(f"{server_id}:"):
            try:
                scheduler.remove_job(job.id)
            except Exception:
                pass


def start():
    if not scheduler.running:
        scheduler.start()
    for server in _db.servers.find({}, {"_id": 0}):
        for sched in server.get("schedules", []):
            _add_job(server["id"], sched)
