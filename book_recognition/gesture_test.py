#!/usr/bin/env python3
"""
로컬 웹캠 손 제스처 실시간 테스트 (MediaPipe Tasks + rule-based).

제스처:
- stop: 손가락 전부 펼친 오픈 팜 → 정지
- thumbs_up: 엄지만 펴고 나머지 접기
- restart: 검지만 펴고 엄지·중·약·소는 접기 → 다시 시작·앞으로
- thumbs_down, ok_sign (한 손)

동작:
- 연속 같은 제스처가 CONFIRM_FRAMES 프레임이면 터미널에 [CONFIRMED] 출력
- 확정 후 COOLDOWN_FRAMES 동안 쿨다운

종료: 화면 포커스 상태에서 q
"""

from __future__ import annotations

import threading
import time
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any, List, Optional

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

try:
    from .book_identifier import identify_book
    from .shopping_list import ShoppingList
except ImportError:
    from book_identifier import identify_book
    from shopping_list import ShoppingList

shopping_list = ShoppingList()
is_identifying = False

# --- 설정 -----------------------------------------------------------------
CAMERA_INDEX = 0
CONFIRM_FRAMES = 15
COOLDOWN_FRAMES = 45
EXTEND_RATIO = 1.08
THUMB_EXTEND_RATIO = 1.05
OK_TOUCH_RATIO = 0.55
CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parent / ".models" / "hand_landmarker.task"

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]


def ensure_model(model_path: Path = MODEL_PATH) -> Path:
    if model_path.exists():
        return model_path
    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"모델 다운로드 중: {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, str(model_path))
    print(f"모델 저장 완료: {model_path}")
    return model_path


def draw_landmarks_tasks(frame: np.ndarray, lm: List[Any]) -> None:
    h, w = frame.shape[:2]
    points: List[tuple[int, int]] = []
    for p in lm:
        x = int(min(max(p.x * w, 0), w - 1))
        y = int(min(max(p.y * h, 0), h - 1))
        points.append((x, y))

    for s, e in HAND_CONNECTIONS:
        cv2.line(frame, points[s], points[e], (255, 255, 255), 2, cv2.LINE_AA)
    for i, (x, y) in enumerate(points):
        r = 6 if i in (4, 8, 12, 16, 20) else 4
        cv2.circle(frame, (x, y), r, (0, 0, 0), -1)
        cv2.circle(frame, (x, y), r, (0, 255, 0), 1)


def draw_hand_label(frame: np.ndarray, lm: List[Any], text: str) -> None:
    h, w = frame.shape[:2]
    x = int(min(max(lm[0].x * w, 0), w - 1))
    y = int(min(max(lm[0].y * h, 0), h - 1))
    y = max(20, y - 16)
    cv2.putText(frame, text, (x + 8, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(frame, text, (x + 8, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 1, cv2.LINE_AA)


def _dist(a: Any, b: Any) -> float:
    return float(np.hypot(a.x - b.x, a.y - b.y))


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


def _is_open_palm(lm: List[Any]) -> bool:
    return all(_all_fingers(lm).values())


def _is_ok_sign(lm: List[Any]) -> bool:
    f = _all_fingers(lm)
    touch = _dist(lm[4], lm[8]) < _dist(lm[5], lm[17]) * OK_TOUCH_RATIO
    return touch and f["middle"] and f["ring"] and f["pinky"]


def _is_thumb_pose_base(lm: List[Any]) -> bool:
    f = _all_fingers(lm)
    return (
        f["thumb"]
        and not f["index"]
        and not f["middle"]
        and not f["ring"]
        and not f["pinky"]
    )


def _is_thumbs_up(lm: List[Any]) -> bool:
    if not _is_thumb_pose_base(lm):
        return False
    return lm[4].y < lm[3].y and lm[4].y < lm[0].y


def _is_index_only_restart(lm: List[Any]) -> bool:
    """검지만 펼침(엄지·나머지 손가락 접음) — restart."""
    f = _all_fingers(lm)
    return (
        f["index"]
        and not f["middle"]
        and not f["ring"]
        and not f["pinky"]
        and not f["thumb"]
    )


def _is_thumbs_down(lm: List[Any]) -> bool:
    if not _is_thumb_pose_base(lm):
        return False
    return lm[4].y > lm[3].y and lm[4].y > lm[0].y


def classify_one_hand_gesture(lm: List[Any]) -> Optional[str]:
    if _is_open_palm(lm):
        return "stop"
    if _is_thumbs_up(lm):
        return "thumbs_up"
    if _is_thumbs_down(lm):
        return "thumbs_down"
    if _is_ok_sign(lm):
        return "ok_sign"
    if _is_index_only_restart(lm):
        return "restart"
    return None


def main() -> None:
    global is_identifying

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"카메라를 열 수 없습니다: index={CAMERA_INDEX}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)
    model_path = ensure_model()

    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.7,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    landmarker = vision.HandLandmarker.create_from_options(options)

    streak = 0
    streak_label: Optional[str] = None
    cooldown = 0

    fps_times: deque[float] = deque(maxlen=30)
    win = "gesture_test (q: quit)"
    print(
        "웹캠 시작. 제스처: stop(손 전부 펴기) | thumbs_up(엄지만) | "
        "restart(검지만) | thumbs_down | ok_sign"
    )
    print(f"확정: 연속 {CONFIRM_FRAMES}프레임 동일 → [CONFIRMED] ... / 쿨다운 {COOLDOWN_FRAMES}프레임")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts_ms = int(time.time() * 1000)
        result = landmarker.detect_for_video(mp_image, ts_ms)

        now = time.perf_counter()
        fps_times.append(now)
        if len(fps_times) >= 2:
            fps = (len(fps_times) - 1) / (fps_times[-1] - fps_times[0])
        else:
            fps = 0.0

        gesture_name: Optional[str] = None
        per_hand_labels: List[str] = []
        if result.hand_landmarks:
            for i, lm in enumerate(result.hand_landmarks, start=1):
                draw_landmarks_tasks(frame, lm)
                label = classify_one_hand_gesture(lm)
                per_hand_labels.append(label or "---")
                draw_hand_label(frame, lm, f"H{i}: {label or '---'}")

            for lm in result.hand_landmarks:
                one = classify_one_hand_gesture(lm)
                if one is not None:
                    gesture_name = one
                    break

        if cooldown > 0:
            cooldown -= 1
            streak = 0
            streak_label = None
        else:
            if gesture_name is None:
                streak = 0
                streak_label = None
            else:
                if gesture_name == streak_label:
                    streak += 1
                else:
                    streak = 1
                    streak_label = gesture_name

                if streak >= CONFIRM_FRAMES and streak_label is not None:
                    confirmed = streak_label
                    print(f"[CONFIRMED] {confirmed}", flush=True)
                    cooldown = COOLDOWN_FRAMES
                    streak = 0
                    streak_label = None

                    if confirmed == "thumbs_up" and not is_identifying:
                        is_identifying = True
                        snapshot = frame.copy()

                        def _add() -> None:
                            global is_identifying
                            book = identify_book(snapshot)
                            if book:
                                added = shopping_list.add(book)
                                print(
                                    f"[추가됨] {book['title']} / {book.get('author', '')}"
                                    if added
                                    else f"[이미 있음] {book['title']}"
                                )
                                shopping_list.display()
                            else:
                                print(
                                    "[인식 실패] 책을 찾지 못했어요. 표지가 잘 보이도록 다시 시도해주세요."
                                )
                            is_identifying = False

                        threading.Thread(target=_add, daemon=True).start()

                    elif confirmed == "thumbs_down" and not is_identifying:
                        is_identifying = True
                        snapshot = frame.copy()

                        def _remove() -> None:
                            global is_identifying
                            book = identify_book(snapshot)
                            if book:
                                removed = shopping_list.remove_book(book)
                                print(
                                    f"[제거됨] {book['title']}"
                                    if removed
                                    else f"[없음] 리스트에 없는 책: {book['title']}"
                                )
                                shopping_list.display()
                            else:
                                print("[인식 실패] 책을 찾지 못했어요.")
                            is_identifying = False

                        threading.Thread(target=_remove, daemon=True).start()

        lines = [
            f"FPS: {fps:.1f}",
            f"gesture: {gesture_name or '---'}",
            f"hands: {', '.join(per_hand_labels) if per_hand_labels else '---'}",
            f"streak: {streak} / {CONFIRM_FRAMES}",
            f"cooldown: {cooldown}",
        ]
        y0 = 28
        for i, line in enumerate(lines):
            cv2.putText(frame, line, (12, y0 + i * 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(frame, line, (12, y0 + i * 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 1, cv2.LINE_AA)

        if is_identifying:
            cx, cy = CAPTURE_WIDTH // 2 - 80, CAPTURE_HEIGHT // 2
            cv2.putText(
                frame,
                "책 인식 중...",
                (cx, cy),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (0, 0, 0),
                4,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame,
                "책 인식 중...",
                (cx, cy),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (0, 255, 255),
                2,
                cv2.LINE_AA,
            )

        cv2.imshow(win, frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    landmarker.close()


if __name__ == "__main__":
    main()
