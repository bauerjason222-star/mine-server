"""server.properties schema used by the frontend to render the settings form."""

PROPERTY_SCHEMA = [
    # Gameplay
    {"key": "gamemode", "label": "Gamemode", "type": "select", "group": "Gameplay",
     "options": ["survival", "creative", "adventure", "spectator"], "default": "survival"},
    {"key": "difficulty", "label": "Difficulty", "type": "select", "group": "Gameplay",
     "options": ["peaceful", "easy", "normal", "hard"], "default": "easy"},
    {"key": "hardcore", "label": "Hardcore Mode", "type": "switch", "group": "Gameplay", "default": "false"},
    {"key": "pvp", "label": "PvP Enabled", "type": "switch", "group": "Gameplay", "default": "true"},
    {"key": "force-gamemode", "label": "Force Gamemode", "type": "switch", "group": "Gameplay", "default": "false"},
    {"key": "enable-command-block", "label": "Command Blocks", "type": "switch", "group": "Gameplay", "default": "false"},
    {"key": "allow-flight", "label": "Allow Flight", "type": "switch", "group": "Gameplay", "default": "false"},
    {"key": "spawn-monsters", "label": "Spawn Monsters", "type": "switch", "group": "Gameplay", "default": "true"},
    {"key": "spawn-animals", "label": "Spawn Animals", "type": "switch", "group": "Gameplay", "default": "true"},
    {"key": "spawn-npcs", "label": "Spawn NPCs (Villagers)", "type": "switch", "group": "Gameplay", "default": "true"},

    # World
    {"key": "level-name", "label": "World Name", "type": "text", "group": "World", "default": "world"},
    {"key": "level-seed", "label": "World Seed", "type": "text", "group": "World", "default": ""},
    {"key": "level-type", "label": "World Type", "type": "select", "group": "World",
     "options": ["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified"],
     "default": "minecraft:normal"},
    {"key": "generate-structures", "label": "Generate Structures", "type": "switch", "group": "World", "default": "true"},
    {"key": "allow-nether", "label": "Allow Nether", "type": "switch", "group": "World", "default": "true"},
    {"key": "spawn-protection", "label": "Spawn Protection (blocks)", "type": "number", "group": "World", "default": "16"},
    {"key": "max-world-size", "label": "Max World Size", "type": "number", "group": "World", "default": "29999984"},

    # Players
    {"key": "max-players", "label": "Max Players", "type": "number", "group": "Players", "default": "20"},
    {"key": "motd", "label": "MOTD (Server Description)", "type": "text", "group": "Players",
     "default": "A Minecraft Server hosted with MineHost"},
    {"key": "white-list", "label": "Whitelist", "type": "switch", "group": "Players", "default": "false"},
    {"key": "enforce-whitelist", "label": "Enforce Whitelist", "type": "switch", "group": "Players", "default": "false"},
    {"key": "online-mode", "label": "Online Mode (Auth)", "type": "switch", "group": "Players", "default": "true"},
    {"key": "op-permission-level", "label": "OP Permission Level", "type": "select", "group": "Players",
     "options": ["1", "2", "3", "4"], "default": "4"},
    {"key": "player-idle-timeout", "label": "Idle Timeout (min, 0=off)", "type": "number", "group": "Players", "default": "0"},

    # Performance
    {"key": "view-distance", "label": "View Distance (chunks)", "type": "number", "group": "Performance", "default": "10"},
    {"key": "simulation-distance", "label": "Simulation Distance", "type": "number", "group": "Performance", "default": "10"},
    {"key": "max-tick-time", "label": "Max Tick Time (ms)", "type": "number", "group": "Performance", "default": "60000"},
    {"key": "entity-broadcast-range-percentage", "label": "Entity Broadcast Range %", "type": "number", "group": "Performance", "default": "100"},

    # Network
    {"key": "enable-status", "label": "Enable Server List Ping", "type": "switch", "group": "Network", "default": "true"},
    {"key": "prevent-proxy-connections", "label": "Prevent Proxy Connections", "type": "switch", "group": "Network", "default": "false"},
    {"key": "resource-pack", "label": "Resource Pack URL", "type": "text", "group": "Network", "default": ""},
    {"key": "require-resource-pack", "label": "Require Resource Pack", "type": "switch", "group": "Network", "default": "false"},
]

GROUP_ORDER = ["Gameplay", "World", "Players", "Performance", "Network"]


def default_properties():
    return {f["key"]: f["default"] for f in PROPERTY_SCHEMA}
