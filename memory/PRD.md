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
