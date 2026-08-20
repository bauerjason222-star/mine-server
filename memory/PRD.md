# MineHost — Minecraft Server Host Panel (Linux, Aternos-style)

## Original Problem Statement
Erstelle mir eine Minecraft Host App für Linux, wo ich Server erstellen, bearbeiten, Mods zu Servern hinzufügen und entfernen kann. Also wie Aternos.

## User Choices
- REAL running servers (actual Java Minecraft processes)
- Server types: Vanilla, Paper/Spigot, Fabric, Forge
- No login / no auth
- Mods via Modrinth search/download
- Dark gaming theme, clean, lots of per-server settings

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + `mc_manager.py` (process/download logic) + `properties_schema.py` (settings schema)
- **DB**: MongoDB collection `servers` (metadata). Live status/console/players kept in-memory in `mc_manager.RUNTIME`.
- **Server files on disk**: `/app/servers/{id}/` (world, mods/plugins, backups under `_backups/`).
- **Java runtimes** (aarch64): Java 17 `/usr/lib/jvm/java-17-openjdk-arm64/bin/java`; Java 21 `/app/runtimes/jdk-*/bin/java`. Auto-selected by MC version.
- **Frontend**: React + Tailwind + shadcn/ui, dark theme (slate + emerald), fonts Cabinet Grotesk / Outfit / JetBrains Mono. Pages: Dashboard, ServerDetail (Console/Settings/Mods/Backups tabs).
- **Sources**: Vanilla (Mojang manifest), Paper (fill.papermc.io v3), Fabric (meta.fabricmc.net), Forge (installer + promotions_slim), Mods (Modrinth API).

## Implemented (2026-08-20)
- Create/list/delete servers; background jar install with live installer logs.
- Real start/stop/restart of Java servers; console streaming (polling) + interactive command input; live RAM/CPU metrics + online player list.
- server.properties editor: 32 grouped settings (Gameplay/World/Players/Performance/Network) + RAM allocation slider.
- Mods/Plugins: Modrinth search (filtered by loader + MC version), install, list, remove.
- World backups: create (zip world dirs), list, restore, delete.
- Verified E2E: Paper 1.21.4 install → start ("Done!") → command → mods → stop → delete. Backend 18/18 pytest passed.

## Update (2026-08-20 #2)
- **Player Management tab**: whitelist / operators / banned players UI per server. Add by name (Mojang UUID lookup with offline-UUID fallback), remove, kick online players. Edits live via server commands when running, or edits whitelist.json/ops.json/banned-players.json directly when stopped. Verified: real Mojang UUIDs resolved (Notch, jeb_).
- **Crash detection + auto-restart**: `_reader_thread` distinguishes intentional stop vs crash (exit code). Shows "crashed" status + banner. Per-server `auto_restart` toggle auto-recovers up to 3 attempts (5s backoff), resets on successful "Done". Verified E2E by killing the java process.
- **Realtime console via WebSocket**: `GET /api/servers/{id}/ws` streams logs/status/metrics/players every 400ms (in-process, no HTTP round-trips). Frontend shows LIVE indicator; falls back to REST polling if WS closes. Verified WS handshake + messages.

## Update (2026-08-20 #3)
- **Scheduled tasks** (Automation tab): per-server auto-restart & backup schedules via APScheduler (`scheduler.py`). Modes: daily at HH:MM (CronTrigger) or every N hours (IntervalTrigger). Jobs persisted in `server.schedules`, reloaded on startup. Endpoints: GET/POST/PUT/DELETE `/api/servers/{id}/schedules`. Verified endpoints + scheduler boot.
- **Discord notifications** (Automation tab): user pastes Bot Token + Channel ID in-app (stored per server, token masked in GET via `has_token`). Backend posts to `POST discord.com/api/v10/channels/{id}/messages` with `Authorization: Bot <token>`. Reader thread detects deaths (phrase list) and advancements (regex) and posts `:skull:` / `:trophy:` messages. Endpoints: GET/PUT `/api/servers/{id}/discord`, POST `/discord/test`. Verified config save/mask + test endpoint path. NOTE: live death→Discord message not E2E-tested (needs user's real bot token).

## Update (2026-08-20 #4)
- **Discord server-status + join/leave events**: reader thread now posts to Discord on server starting (:yellow_circle:), online (:green_circle:), stopped (:red_circle:), crashed (:boom:), and player join (:inbox_tray:) / leave (:outbox_tray:). Two new per-server toggles `notify_status` and `notify_joins` (defaults true) alongside deaths/advancements. UI: 4 toggles in Discord card. Verified config persistence; live posting requires user's real bot token.

## Update (2026-08-20 #5)
- **Two-way Discord chat bridge**: (a) in-game chat → Discord via `_CHAT_RE` (`<player> msg`) posting `:speech_balloon:` (toggle `notify_chat`); (b) Discord → in-game via `_bridge_poller` polling `GET /channels/{id}/messages?after=<last_id>` every 3s while running, skipping bot authors, injecting `say [Discord] <user>: <msg>` (toggle `bridge_from_discord`). Poller starts in `start_server` / on discord-save when running; baseline last_id prevents history replay; relayed `say` lines don't match `_CHAT_RE` so no echo loop (regex verified). UI: "Two-way Chat Bridge" section (2 toggles). Needs bot Read Message History + Message Content Intent; live relay needs user's real token (not E2E-tested).

## Known Notes / Limitations
- External players cannot connect through the preview ingress (port 25565 not exposed); the server process genuinely runs — works fully on a real Linux host.
- Status is in-memory; on backend restart running servers show "stopped" (java process is killed by supervisor).
- Forge metadata persistence fixed (sync pymongo write in install thread); Forge live start not yet load-tested.

## Backlog / Next
- P1: Reconcile/crash-state for orphaned java processes after restart (persist pid).
- P2: Modrinth search pagination + caching; unique port index.
- P2: File-upload for custom mods/jars; datapacks; op/whitelist manager UI.
- P2: Live console via WebSocket instead of polling.

## Test Credentials
N/A — the app has no authentication.
