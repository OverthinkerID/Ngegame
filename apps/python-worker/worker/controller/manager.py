from collections import deque
from datetime import datetime, timezone
import time
from typing import Any, Deque, Dict, Optional

from worker.controller.input_driver import InputDriver, detect_controller_backend
from worker.controller.keymap import map_action_to_input
from worker.vision.window_detector import (
    focus_game_window,
    get_platform_diagnostics,
    list_visible_windows,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ControllerManager:
    def __init__(self) -> None:
        self.paused = False
        self.emergency_stopped = False
        self.dry_run = True
        self.driver = InputDriver()
        self.queue: Deque[Dict[str, Any]] = deque(maxlen=50)
        self.last_action_at: Optional[str] = None
        self.last_action_ts_by_type: Dict[str, float] = {}

    def get_status(self) -> Dict[str, Any]:
        return {
            "paused": self.paused,
            "emergencyStopped": self.emergency_stopped,
            "dryRun": self.dry_run,
            "backend": detect_controller_backend(self.dry_run),
            "pressedKeys": sorted(self.driver.pressed_keys),
            "queueLength": len(self.queue),
            "activeWindow": self._get_active_window_summary(),
            "lastActionAt": self.last_action_at,
            "lastError": self.driver.last_error,
        }

    def get_diagnostics(self, expected_game: Optional[str] = None) -> Dict[str, Any]:
        diag = get_platform_diagnostics(expected_game=expected_game)
        diag["controller"] = self.get_status()
        diag["liveBackend"] = detect_controller_backend(dry_run=False)
        return diag

    @staticmethod
    def _get_active_window_summary() -> Optional[str]:
        windows = list_visible_windows()
        if not windows:
            return None
        focused = next((w for w in windows if w.get("focused")), windows[0])
        return f"{focused.get('owner', '')}: {focused.get('title', '')}".strip(": ")

    def pause(self) -> Dict[str, Any]:
        self.paused = True
        self.driver.release_all()
        return self.get_status()

    def resume(self) -> Dict[str, Any]:
        if not self.emergency_stopped:
            self.paused = False
        return self.get_status()

    def release_all(self) -> Dict[str, Any]:
        self.driver.release_all()
        return self.get_status()

    def emergency_stop(self) -> Dict[str, Any]:
        self.emergency_stopped = True
        self.paused = True
        self.queue.clear()
        self.driver.release_all()
        return self.get_status()

    def reset_emergency(self) -> Dict[str, Any]:
        self.emergency_stopped = False
        self.paused = False
        return self.get_status()

    def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        action_type = str(payload.get("actionType") or "")
        parameters = payload.get("parameters") or {}
        if not isinstance(parameters, dict):
            parameters = {}

        raw_duration = payload.get("durationMs", 300)
        try:
            duration_ms = min(max(int(raw_duration), 50), 2000)
        except (TypeError, ValueError):
            duration_ms = 300

        cooldown_ms = 0
        try:
            cooldown_ms = max(0, int(payload.get("cooldownMs", 0)))
        except (TypeError, ValueError):
            cooldown_ms = 0

        dry_run = bool(payload.get("dryRun", True))
        auto_focus = bool(payload.get("autoFocus", True))
        self.dry_run = dry_run
        expected_game = payload.get("expectedGameTitle")
        active_window = self._get_active_window_summary() or "Unknown Window"
        now_iso = _utc_now()

        if self.emergency_stopped:
            return {
                "ok": False,
                "actionType": action_type or "OBSERVE_ONLY",
                "mappedInput": "none",
                "durationMs": 0,
                "dryRun": dry_run,
                "activeWindow": active_window,
                "status": "blocked",
                "reason": "Emergency Stop aktif — seluruh input diblokir.",
                "executedAt": now_iso,
            }

        if self.paused:
            return {
                "ok": False,
                "actionType": action_type or "OBSERVE_ONLY",
                "mappedInput": "none",
                "durationMs": 0,
                "dryRun": dry_run,
                "activeWindow": active_window,
                "status": "blocked",
                "reason": "Controller sedang dalam status pause.",
                "executedAt": now_iso,
            }

        now_mono = time.monotonic()
        if cooldown_ms > 0 and action_type in self.last_action_ts_by_type:
            elapsed_ms = (now_mono - self.last_action_ts_by_type[action_type]) * 1000.0
            if elapsed_ms < cooldown_ms:
                return {
                    "ok": False,
                    "actionType": action_type,
                    "mappedInput": "none",
                    "durationMs": 0,
                    "dryRun": dry_run,
                    "activeWindow": active_window,
                    "status": "blocked",
                    "reason": f"Cooldown aktif ({int(cooldown_ms - elapsed_ms)}ms tersisa).",
                    "executedAt": now_iso,
                }

        try:
            kind, token, label = map_action_to_input(action_type, parameters)
        except ValueError as exc:
            return {
                "ok": False,
                "actionType": action_type or "OBSERVE_ONLY",
                "mappedInput": "none",
                "durationMs": 0,
                "dryRun": dry_run,
                "activeWindow": active_window,
                "status": "rejected",
                "reason": str(exc),
                "executedAt": now_iso,
            }

        if not dry_run and isinstance(expected_game, str) and expected_game.strip():
            if expected_game.lower() not in active_window.lower() and auto_focus:
                focus_res = focus_game_window(expected_game.strip())
                if focus_res.get("focused"):
                    time.sleep(0.12)
                    active_window = self._get_active_window_summary() or active_window

            if expected_game.lower() not in active_window.lower():
                self.driver.release_all()
                return {
                    "ok": False,
                    "actionType": action_type,
                    "mappedInput": label,
                    "durationMs": 0,
                    "dryRun": False,
                    "activeWindow": active_window,
                    "status": "blocked",
                    "reason": f"Game target '{expected_game}' tidak aktif di jendela depan (aktif: '{active_window}').",
                    "executedAt": now_iso,
                }

        self.queue.append({"actionType": action_type, "token": token, "at": now_iso})
        try:
            if kind == "key":
                self.driver.execute_key_hold(token, duration_ms, dry_run=dry_run)
            elif kind == "multi_key":
                self.driver.execute_multi_key_hold(token.split("+"), duration_ms, dry_run=dry_run)
            elif kind == "mouse":
                raw_x = parameters.get("x")
                raw_y = parameters.get("y")
                x = int(raw_x) if isinstance(raw_x, (int, float)) else None
                y = int(raw_y) if isinstance(raw_y, (int, float)) else None
                self.driver.execute_mouse_action(token, x, y, dry_run=dry_run)
        except (PermissionError, RuntimeError) as exc:
            return {
                "ok": False,
                "actionType": action_type,
                "mappedInput": label,
                "durationMs": 0,
                "dryRun": dry_run,
                "activeWindow": active_window,
                "status": "blocked",
                "reason": str(exc),
                "executedAt": now_iso,
            }
        finally:
            if self.queue:
                self.queue.pop()
            self.driver.release_all()

        self.last_action_at = now_iso
        self.last_action_ts_by_type[action_type] = time.monotonic()
        return {
            "ok": True,
            "actionType": action_type,
            "mappedInput": label,
            "durationMs": duration_ms,
            "dryRun": dry_run,
            "activeWindow": active_window,
            "status": "simulated" if dry_run else "executed",
            "reason": "Simulasi aman berhasil (dry-run)" if dry_run else "Input berhasil dikirim",
            "executedAt": now_iso,
        }
