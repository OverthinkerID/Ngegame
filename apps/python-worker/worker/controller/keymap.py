from typing import Any, Dict, Tuple

ALLOWED_KEYS = {
    "w",
    "a",
    "s",
    "d",
    "up",
    "down",
    "left",
    "right",
    "e",
    "f",
    "space",
    "enter",
    "escape",
    "1",
    "2",
    "3",
    "4",
    "5",
}

ALLOWED_ACTIONS = {
    "OBSERVE_ONLY",
    "WAIT",
    "MOVE_DIRECTION",
    "LOOK_AT",
    "INTERACT",
    "USE_ITEM",
    "SELECT_OPTION",
    "NAVIGATE_WAYPOINT",
    "PAUSE_MENU",
}


def map_action_to_input(
    action_type: str, parameters: Dict[str, Any]
) -> Tuple[str, str, str]:
    """
    Maps a high-level AIActionType into a safe allowlisted input tuple:
    (kind: 'key' | 'mouse' | 'noop', token: str, human_label: str)
    """
    if action_type not in ALLOWED_ACTIONS:
        raise ValueError(f"Action '{action_type}' is not in the controller allowlist")

    if action_type in ("OBSERVE_ONLY", "WAIT"):
        return ("noop", "none", "No-op (Observe/Wait)")

    if action_type == "MOVE_DIRECTION":
        direction = str(parameters.get("direction", "w")).lower()
        dir_map = {"up": "w", "forward": "w", "down": "s", "back": "s", "left": "a", "right": "d"}
        key = dir_map.get(direction, direction)
        if key not in ALLOWED_KEYS:
            key = "w"
        return ("key", key, f"Key '{key}'")

    if action_type == "NAVIGATE_WAYPOINT":
        return ("key", "w", "Key 'w' (Navigate)")

    if action_type == "INTERACT":
        return ("key", "e", "Key 'e' (Interact)")

    if action_type == "USE_ITEM":
        slot = str(parameters.get("slot", "1"))
        key = slot if slot in {"1", "2", "3", "4", "5"} else "1"
        return ("key", key, f"Key '{key}' (Use Item)")

    if action_type == "SELECT_OPTION":
        return ("key", "enter", "Key 'enter' (Select)")

    if action_type == "PAUSE_MENU":
        return ("key", "escape", "Key 'escape' (Pause Menu)")

    if action_type == "LOOK_AT":
        return ("mouse", "move", "Mouse Look")

    return ("noop", "none", "No-op")
