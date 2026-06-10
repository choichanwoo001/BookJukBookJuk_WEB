"""rosbridge v2로 /verso/command 발행 (제스처 → 로봇)."""

from __future__ import annotations

import json
import os
from typing import Any

VERSO_COMMAND_TOPIC = "/verso/command"
DEFAULT_ROSBRIDGE_URL = "ws://127.0.0.1:9090"


def get_rosbridge_url() -> str:
    return os.environ.get("VERSO_ROSBRIDGE_URL", DEFAULT_ROSBRIDGE_URL).strip()


def build_publish_envelope(payload: dict[str, Any]) -> str:
    json_string = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(
        {
            "op": "publish",
            "topic": VERSO_COMMAND_TOPIC,
            "msg": {"data": json_string},
        },
        separators=(",", ":"),
    )


def publish_verso_command(payload: dict[str, Any]) -> bool:
    """WebSocket으로 명령 1회 발행. 실패 시 False, 터미널 경고."""
    try:
        import websocket
    except ImportError:
        print("[VERSO] websocket-client 패키지가 필요합니다: pip install websocket-client", flush=True)
        return False

    url = get_rosbridge_url()
    envelope = build_publish_envelope(payload)
    try:
        ws = websocket.create_connection(url, timeout=3)
        ws.send(envelope)
        ws.close()
        return True
    except Exception as exc:
        print(f"[VERSO] publish failed ({url}): {exc}", flush=True)
        return False
