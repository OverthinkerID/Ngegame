from typing import Any, Dict

from worker.controller.manager import ControllerManager

_controller_manager = ControllerManager()


def handle_controller_status(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.get_status()


def handle_controller_diagnostics(payload: Dict[str, Any]) -> Dict[str, Any]:
    expected_game = payload.get("expectedGameTitle")
    return _controller_manager.get_diagnostics(
        expected_game=str(expected_game) if isinstance(expected_game, str) and expected_game.strip() else None
    )


def handle_controller_execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.execute_action(payload)


def handle_controller_pause(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.pause()


def handle_controller_resume(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.resume()


def handle_controller_release_all(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.release_all()


def handle_controller_emergency_stop(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.emergency_stop()


def handle_controller_reset_emergency(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return _controller_manager.reset_emergency()
