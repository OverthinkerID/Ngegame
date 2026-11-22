import json
import os
import signal
import sys
from typing import Any, Callable, Dict

from worker.handlers.controller import (
    handle_controller_diagnostics,
    handle_controller_emergency_stop,
    handle_controller_execute,
    handle_controller_pause,
    handle_controller_release_all,
    handle_controller_reset_emergency,
    handle_controller_resume,
    handle_controller_status,
)
from worker.handlers.health import handle_echo, handle_health_check, handle_ping
from worker.handlers.vision import (
    handle_capture_frame,
    handle_list_windows,
    handle_vision_capabilities,
)
from worker.logger import create_logger
from worker.protocol import make_error_response, make_success_response

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = create_logger("ngegame.worker", LOG_LEVEL)

CommandHandler = Callable[[Dict[str, Any]], Dict[str, Any]]

HANDLERS: Dict[str, CommandHandler] = {
    "ping": handle_ping,
    "health_check": handle_health_check,
    "echo": handle_echo,
    "vision_capabilities": handle_vision_capabilities,
    "list_windows": handle_list_windows,
    "capture_frame": handle_capture_frame,
    "controller_status": handle_controller_status,
    "controller_diagnostics": handle_controller_diagnostics,
    "controller_execute": handle_controller_execute,
    "controller_pause": handle_controller_pause,
    "controller_resume": handle_controller_resume,
    "controller_release_all": handle_controller_release_all,
    "controller_emergency_stop": handle_controller_emergency_stop,
    "controller_reset_emergency": handle_controller_reset_emergency,
}


def process_line(raw_line: str) -> Dict[str, Any]:
    try:
        request = json.loads(raw_line)
    except json.JSONDecodeError as exc:
        return make_error_response(
            request_id="unknown",
            code="INVALID_JSON",
            message="Failed to parse JSON request",
            details=str(exc),
        )

    if not isinstance(request, dict):
        return make_error_response(
            request_id="unknown",
            code="INVALID_REQUEST",
            message="Request must be a JSON object",
        )

    request_id = str(request.get("id", "unknown"))
    command = request.get("command")
    payload = request.get("payload") or {}

    if not isinstance(command, str) or not command:
        return make_error_response(
            request_id=request_id,
            code="MISSING_COMMAND",
            message="Field 'command' must be a non-empty string",
        )

    if not isinstance(payload, dict):
        return make_error_response(
            request_id=request_id,
            code="INVALID_PAYLOAD",
            message="Field 'payload' must be a JSON object",
        )

    if command == "shutdown":
        return make_success_response(request_id, {"shuttingDown": True})

    handler = HANDLERS.get(command)
    if handler is None:
        return make_error_response(
            request_id=request_id,
            code="UNKNOWN_COMMAND",
            message=f"Unknown command: {command}",
        )

    try:
        result = handler(payload)
        return make_success_response(request_id, result)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unhandled error while executing command '%s'", command)
        return make_error_response(
            request_id=request_id,
            code="HANDLER_ERROR",
            message=str(exc),
        )


def emit_response(response: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    running = True

    def handle_signal(signum: int, _frame: Any) -> None:
        nonlocal running
        logger.info("Received signal %s, shutting down worker", signum)
        running = False

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    logger.info("Python worker started (pid=%s)", os.getpid())

    while running:
        line = sys.stdin.readline()
        if not line:
            # EOF reached (parent closed stdin)
            break

        stripped = line.strip()
        if not stripped:
            continue

        response = process_line(stripped)
        emit_response(response)

        if response.get("ok") and isinstance(response.get("data"), dict):
            if response["data"].get("shuttingDown"):
                break

    logger.info("Python worker exited cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
