"""제스처 분류·rosbridge 페이로드 단위 테스트."""

from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import List

from book_recognition.gesture_classifiers import (
    _all_fingers,
    _is_fist,
    _is_lead_again,
    _is_open_palm,
    classify_one_hand_gesture,
)
from book_recognition.verso_gesture_bridge import build_publish_envelope


@dataclass
class Pt:
    x: float
    y: float


def _full_lm(
    wrist: Pt,
    thumb_tip: Pt,
    index_tip: Pt,
    middle_tip: Pt,
    ring_tip: Pt,
    pinky_tip: Pt,
    **kwargs: Pt,
) -> List[Pt]:
    pts: List[Pt] = [Pt(0, 0)] * 21
    pts[0] = wrist
    pts[3] = kwargs.get("thumb_ip", Pt(wrist.x + 0.02, wrist.y + 0.02))
    pts[4] = thumb_tip
    pts[5] = kwargs.get("index_mcp", Pt(wrist.x + 0.04, wrist.y))
    pts[6] = kwargs.get("index_pip", Pt(wrist.x + 0.04, wrist.y - 0.04))
    pts[8] = index_tip
    pts[9] = Pt(wrist.x + 0.05, wrist.y)
    pts[10] = kwargs.get("middle_pip", Pt(wrist.x + 0.05, wrist.y - 0.04))
    pts[12] = middle_tip
    pts[13] = Pt(wrist.x + 0.06, wrist.y)
    pts[14] = kwargs.get("ring_pip", Pt(wrist.x + 0.06, wrist.y - 0.03))
    pts[16] = ring_tip
    pts[17] = kwargs.get("pinky_mcp", Pt(wrist.x + 0.07, wrist.y))
    pts[18] = kwargs.get("pinky_pip", Pt(wrist.x + 0.07, wrist.y - 0.02))
    pts[20] = pinky_tip
    return pts


class GestureClassifierTests(unittest.TestCase):
    def test_open_palm_is_stop(self) -> None:
        w = Pt(0.5, 0.7)
        far = Pt(0.5, 0.2)
        lm = _full_lm(w, far, far, far, far, far)
        self.assertTrue(_is_open_palm(lm))
        self.assertEqual(classify_one_hand_gesture(lm), "stop")

    def test_fist_is_follow_me(self) -> None:
        w = Pt(0.5, 0.7)
        tip = Pt(0.502, 0.698)
        joint = Pt(0.5, 0.45)
        lm = _full_lm(
            w,
            tip,
            tip,
            tip,
            tip,
            tip,
            thumb_ip=joint,
            index_pip=joint,
            middle_pip=joint,
            ring_pip=joint,
            pinky_pip=joint,
        )
        self.assertTrue(_is_fist(lm))
        self.assertEqual(classify_one_hand_gesture(lm), "follow_me")

    def test_l_shape_is_lead_again(self) -> None:
        w = Pt(0.5, 0.7)
        lm = _full_lm(
            w,
            thumb_tip=Pt(0.42, 0.68),
            index_tip=Pt(0.5, 0.35),
            middle_tip=Pt(0.52, 0.68),
            ring_tip=Pt(0.54, 0.68),
            pinky_tip=Pt(0.56, 0.68),
            thumb_ip=Pt(0.46, 0.68),
            index_pip=Pt(0.5, 0.55),
            middle_pip=Pt(0.52, 0.66),
            ring_pip=Pt(0.54, 0.66),
            pinky_pip=Pt(0.56, 0.66),
        )
        self.assertTrue(_is_lead_again(lm))
        self.assertEqual(classify_one_hand_gesture(lm), "lead_again")

    def test_lead_again_before_fist_when_index_thumb_extended(self) -> None:
        w = Pt(0.5, 0.7)
        lm = _full_lm(
            w,
            thumb_tip=Pt(0.42, 0.68),
            index_tip=Pt(0.5, 0.35),
            middle_tip=Pt(0.52, 0.68),
            ring_tip=Pt(0.54, 0.68),
            pinky_tip=Pt(0.56, 0.68),
            thumb_ip=Pt(0.46, 0.68),
            index_pip=Pt(0.5, 0.55),
        )
        fingers = _all_fingers(lm)
        self.assertTrue(fingers["index"])
        self.assertTrue(fingers["thumb"])
        self.assertFalse(_is_fist(lm))


class VersoBridgeTests(unittest.TestCase):
    def test_build_publish_envelope(self) -> None:
        env = build_publish_envelope({"type": "command", "action": "stop"})
        self.assertIn('"op":"publish"', env)
        self.assertIn('"/verso/command"', env)
        self.assertIn("stop", env)
        self.assertIn("command", env)


if __name__ == "__main__":
    unittest.main()
