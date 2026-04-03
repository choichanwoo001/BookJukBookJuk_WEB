"""ORB 로컬 매칭 + 알라딘 KR API로 웹캠 프레임에서 책 식별."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests

REFS_DIR = Path(__file__).resolve().parent / "refs"
MIN_MATCH_COUNT = 15
MAX_DISTANCE = 50


class ORBMatcher:
    def __init__(self) -> None:
        self.orb = cv2.ORB_create(nfeatures=1000)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self.refs: dict[str, tuple[Any, Any]] = {}
        self.load_refs()

    def load_refs(self) -> None:
        REFS_DIR.mkdir(parents=True, exist_ok=True)
        exts = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}
        paths: list[Path] = []
        for p in REFS_DIR.iterdir():
            if p.is_file() and p.suffix in exts:
                paths.append(p)
        paths.sort(key=lambda x: x.name)
        self.refs.clear()
        for path in paths:
            title = path.stem
            img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                print(f"[ORB] 로드 실패(건너뜀): {path}", flush=True)
                continue
            kp, des = self.orb.detectAndCompute(img, None)
            if des is None or len(kp) == 0:
                print(f"[ORB] 특징점 없음(건너뜀): {path}", flush=True)
                continue
            self.refs[title] = (kp, des)
        print(f"[ORB] 등록된 책 {len(self.refs)}권: {list(self.refs.keys())}", flush=True)

    def match(self, frame: np.ndarray) -> str | None:
        if not self.refs:
            return None
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        kp_q, des_q = self.orb.detectAndCompute(gray, None)
        if des_q is None or len(kp_q) == 0:
            return None

        best_title: str | None = None
        best_count = 0

        for title, (_, des_r) in self.refs.items():
            if des_r is None or len(des_r) < 2:
                continue
            try:
                matches = self.bf.match(des_q, des_r)
            except cv2.error:
                continue
            good = [m for m in matches if m.distance < MAX_DISTANCE]
            cnt = len(good)
            if cnt > best_count:
                best_count = cnt
                best_title = title

        if best_title is not None:
            print(f"[ORB] {best_title}: {best_count}개", flush=True)
        if best_title is not None and best_count >= MIN_MATCH_COUNT:
            return best_title
        return None


_matcher: ORBMatcher | None = None

_ALADIN_SEARCH_URL = "http://www.aladin.co.kr/ttb/api/ItemSearch.aspx"


def _parse_aladin_js(text: str) -> dict[str, Any] | None:
    try:
        s = text.strip()
        if "{" in s and "}" in s:
            start = s.index("{")
            end = s.rindex("}") + 1
            return json.loads(s[start:end])
        return json.loads(s)
    except Exception:
        return None


def search_aladin(query: str) -> dict[str, Any]:
    q = str(query).strip()
    fallback: dict[str, Any] = {
        "title": q,
        "author": None,
        "isbn13": None,
        "price": None,
        "cover": "",
    }
    if not q:
        return fallback

    key = os.environ.get("ALADIN_TTB_KEY", "ttbaracho01102229001")
    params = {
        "TTBKey": key,
        "Query": q,
        "QueryType": "Title",
        "MaxResults": "1",
        "Cover": "Big",
        "output": "js",
        "Version": "20131101",
        "SearchTarget": "Book",
        "CategoryId": "0",
        "start": "1",
    }
    try:
        r = requests.get(_ALADIN_SEARCH_URL, params=params, timeout=15)
        r.raise_for_status()
        data = _parse_aladin_js(r.text)
        if not data:
            return fallback
        items = data.get("item")
        if items is None:
            return fallback
        if isinstance(items, dict):
            items = [items]
        if not items:
            return fallback
        it = items[0]
        if not isinstance(it, dict):
            return fallback
        isbn13 = it.get("isbn13") or it.get("isbn")
        title = it.get("title") or q
        author = it.get("author")
        cover = it.get("cover")
        price = it.get("priceSales") or it.get("priceStandard") or it.get("price")
        return {
            "title": title or q,
            "author": author if author is not None else "",
            "isbn13": str(isbn13) if isbn13 else None,
            "cover": cover or "",
            "price": price if price is not None else None,
        }
    except Exception:
        return fallback


def identify_book(frame: np.ndarray) -> dict[str, Any] | None:
    global _matcher
    if _matcher is None:
        _matcher = ORBMatcher()

    title = _matcher.match(frame)
    if title is None:
        return None

    book = search_aladin(title)
    return book
