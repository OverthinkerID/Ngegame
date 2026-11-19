from datetime import datetime, timezone
from typing import Any, Dict, Optional


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_success_response(request_id: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "id": request_id,
        "ok": True,
        "data": data or {},
        "timestamp": utc_now_iso(),
    }


def make_error_response(
    request_id: str,
    code: str,
    message: str,
    details: Optional[Any] = None,
) -> Dict[str, Any]:
    error_obj: Dict[str, Any] = {
        "code": code,
        "message": message,
    }
    if details is not None:
        error_obj["details"] = details

    return {
        "id": request_id,
        "ok": False,
        "error": error_obj,
        "timestamp": utc_now_iso(),
    }
