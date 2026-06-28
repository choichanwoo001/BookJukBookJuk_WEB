"""MediaPipe 손 랜드마크 규칙 기반 제스처 분류 (mediapipe/cv2 의존 없음)."""

from __future__ import annotations

import math
from typing import Any, List, Optional

EXTEND_RATIO = 1.08
THUMB_EXTEND_RATIO = 1.05
OK_TOUCH_RATIO = 0.55

MOBILITY_GESTURES: dict[str, dict[str, str]] = {
    "stop": {"type": "command", "action": "stop"},
    "follow_me": {"type": "command", "action": "set_mode", "mode": "guidance"},
    "lead_again": {"type": "command", "action": "set_mode", "mode": "escort"},
}


def _dist(a: Any, b: Any) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def finger_extended(lm: List[Any], tip_id: int, pip_id: int) -> bool:
    w, tip, pip = lm[0], lm[tip_id], lm[pip_id]
    return _dist(w, tip) > _dist(w, pip) * EXTEND_RATIO


def thumb_extended(lm: List[Any]) -> bool:
    w, tip, ip = lm[0], lm[4], lm[3]
    return _dist(w, tip) > _dist(w, ip) * THUMB_EXTEND_RATIO


def _all_fingers(lm: List[Any]) -> dict[str, bool]:
    return {
        "thumb": thumb_extended(lm),
        "index": finger_extended(lm, 8, 6),
        "middle": finger_extended(lm, 12, 10),
        "ring": finger_extended(lm, 16, 14),
        "pinky": finger_extended(lm, 20, 18),
    }


def _is_open_palm(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    f = fingers if fingers is not None else _all_fingers(lm)
    return all(f.values())


def _is_ok_sign(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    f = fingers if fingers is not None else _all_fingers(lm)
    touch = _dist(lm[4], lm[8]) < _dist(lm[5], lm[17]) * OK_TOUCH_RATIO
    return touch and f["middle"] and f["ring"] and f["pinky"]


def _is_thumb_pose_base(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    f = fingers if fingers is not None else _all_fingers(lm)
    return (
        f["thumb"]
        and not f["index"]
        and not f["middle"]
        and not f["ring"]
        and not f["pinky"]
    )


def _is_thumbs_up(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    if not _is_thumb_pose_base(lm, fingers):
        return False
    return lm[4].y < lm[3].y and lm[4].y < lm[0].y


def _is_thumbs_down(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    if not _is_thumb_pose_base(lm, fingers):
        return False
    return lm[4].y > lm[3].y and lm[4].y > lm[0].y


def _is_lead_again(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    """검지+엄지 ㄴ자 — 다시 리드해."""
    f = fingers if fingers is not None else _all_fingers(lm)
    if not (f["index"] and f["thumb"]):
        return False
    if f["middle"] or f["ring"] or f["pinky"]:
        return False
    touch = _dist(lm[4], lm[8]) < _dist(lm[5], lm[17]) * OK_TOUCH_RATIO
    return not touch


def _is_fist(lm: List[Any], fingers: Optional[dict[str, bool]] = None) -> bool:
    """주먹 — 나 따라와."""
    f = fingers if fingers is not None else _all_fingers(lm)
    return not any(f.values())


def classify_one_hand_gesture(lm: List[Any]) -> Optional[str]:
    fingers = _all_fingers(lm)
    if _is_open_palm(lm, fingers):
        return "stop"
    if _is_thumbs_up(lm, fingers):
        return "thumbs_up"
    if _is_thumbs_down(lm, fingers):
        return "thumbs_down"
    if _is_ok_sign(lm, fingers):
        return "ok_sign"
    if _is_lead_again(lm, fingers):
        return "lead_again"
    if _is_fist(lm, fingers):
        return "follow_me"
    return None
