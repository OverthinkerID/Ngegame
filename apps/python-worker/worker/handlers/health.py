import os
import platform
import sys
from typing import Any, Dict


def handle_ping(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "pong": True,
        "pid": os.getpid(),
        "echo": payload.get("message", "pong"),
    }


def handle_health_check(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "status": "healthy",
        "pid": os.getpid(),
        "pythonVersion": sys.version.split()[0],
        "platform": platform.system(),
        "platformRelease": platform.release(),
        "arch": platform.machine(),
    }


def handle_echo(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "received": payload,
    }
