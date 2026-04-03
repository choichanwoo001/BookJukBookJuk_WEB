# 저장소 루트에서: python -m book_recognition.register
# 또는 이 폴더에서: python register.py
#
# 1. 등록 스크립트 실행 → 책 표지 웹캠으로 등록
# 2. python -m book_recognition.gesture_test → 제스처 인식 시작
# 3. thumbs_up → 책 인식 후 리스트 추가
# 4. thumbs_down → 책 인식 후 리스트 제거

from __future__ import annotations

import re
from pathlib import Path

import cv2

REFS_DIR = Path(__file__).resolve().parent / "refs"
CAMERA_INDEX = 0


def _safe_filename(title: str) -> str:
    t = title.strip()
    t = re.sub(r'[\\/:*?"<>|]', "_", t)
    return t if t else "untitled"


def main() -> None:
    REFS_DIR.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"카메라를 열 수 없습니다: index={CAMERA_INDEX}")

    win = "register (space: capture, q: quit)"
    print("스페이스바: 캡처 후 제목 입력 | q: 종료")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]
        x1, y1 = int(w * 0.15), int(h * 0.12)
        x2, y2 = int(w * 0.85), int(h * 0.88)
        overlay = frame.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 200, 255), 2)
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 255), 2)
        cv2.putText(
            frame,
            "표지를 사각형 안에 맞추고 Space",
            (x1, max(24, y1 - 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 200, 255),
            2,
            cv2.LINE_AA,
        )

        cv2.imshow(win, frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            try:
                raw = input("책 제목 입력: ").strip()
            except EOFError:
                break
            if not raw:
                print("(빈 제목은 저장하지 않음)")
                continue
            safe = _safe_filename(raw)
            out_path = REFS_DIR / f"{safe}.jpg"
            cv2.imwrite(str(out_path), frame)
            print(f"등록 완료: {out_path}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
