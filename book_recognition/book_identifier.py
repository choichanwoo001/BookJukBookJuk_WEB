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
REF_TITLE_QUERIES = {
    "어른이된다는것": "어른이 된다는 것",
    "오직두사람": "오직 두 사람",
    "단한사람": "단 한 사람",
    "시선으로부터": "시선으로부터",
}
KNOWN_REF_BOOKS: dict[str, dict[str, Any]] = {
    "어른이 된다는 것": {
        "title": "어른이 된다는 것 - 다른 생명에게 배우기",
        "author": "이은희 (지은이), 해랑 (그림)",
        "isbn13": "9791169814096",
        "price": None,
        "cover": "",
    },
    "오직 두 사람": {
        "title": "오직 두 사람",
        "author": "김영하 (지은이)",
        "isbn13": "9791191114256",
        "price": None,
        "cover": "",
    },
    "단 한 사람": {
        "title": "단 한 사람",
        "author": "최진영 (지은이)",
        "isbn13": "9791160405750",
        "price": None,
        "cover": "",
    },
    "시선으로부터": {
        "title": "시선으로부터,",
        "author": "정세랑 (지은이)",
        "isbn13": "9788954672214",
        "price": None,
        "cover": "",
    },
}


def _log(message: str) -> None:
    print(f"[BOOK-ID] {message}", flush=True)


def _read_image(path: Path, flags: int) -> np.ndarray | None:
    """Read images from non-ASCII paths on Windows."""
    try:
        raw = np.fromfile(str(path), dtype=np.uint8)
        if raw.size == 0:
            return None
        return cv2.imdecode(raw, flags)
    except OSError:
        return None


class ORBMatcher:
    def __init__(self) -> None:
        self.orb = cv2.ORB_create(nfeatures=1000)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self.refs: dict[str, tuple[Any, Any]] = {}
        self.load_refs()

    def load_refs(self) -> None:
        REFS_DIR.mkdir(parents=True, exist_ok=True)
        exts = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG", ".WEBP"}
        paths: list[Path] = []
        for p in REFS_DIR.iterdir():
            if p.is_file() and p.suffix in exts:
                paths.append(p)
        paths.sort(key=lambda x: x.name)
        self.refs.clear()
        for path in paths:
            title = REF_TITLE_QUERIES.get(path.stem, path.stem)
            img = _read_image(path, cv2.IMREAD_GRAYSCALE)
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
        if frame is None or getattr(frame, "size", 0) == 0:
            _log("실패: 입력 프레임이 비어 있습니다.")
            return None
        if not self.refs:
            _log(f"실패: 등록된 refs가 없습니다. refs_dir={REFS_DIR}")
            return None
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        kp_q, des_q = self.orb.detectAndCompute(gray, None)
        if des_q is None or len(kp_q) == 0:
            _log(
                "실패: 입력 프레임에서 ORB 특징점을 찾지 못했습니다. "
                f"shape={getattr(frame, 'shape', None)}"
            )
            return None

        best_title: str | None = None
        best_count = 0
        scores: list[tuple[str, int, int]] = []

        for title, (_, des_r) in self.refs.items():
            if des_r is None or len(des_r) < 2:
                scores.append((title, 0, 0))
                continue
            try:
                matches = self.bf.match(des_q, des_r)
            except cv2.error as e:
                _log(f"경고: '{title}' 매칭 중 OpenCV 오류: {e}")
                scores.append((title, 0, 0))
                continue
            good = [m for m in matches if m.distance < MAX_DISTANCE]
            cnt = len(good)
            scores.append((title, cnt, len(matches)))
            if cnt > best_count:
                best_count = cnt
                best_title = title

        top = sorted(scores, key=lambda x: x[1], reverse=True)[:3]
        score_text = ", ".join(
            f"{title}:good={good}/total={total}" for title, good, total in top
        )
        if best_title is not None:
            _log(
                f"ORB 후보: best='{best_title}', good={best_count}, "
                f"min_required={MIN_MATCH_COUNT}, max_distance={MAX_DISTANCE}, "
                f"query_keypoints={len(kp_q)}, top=[{score_text}]"
            )
        if best_title is not None and best_count >= MIN_MATCH_COUNT:
            return best_title
        if best_title is None:
            _log(
                "실패: 비교 가능한 후보가 없습니다. "
                f"query_keypoints={len(kp_q)}, refs={len(self.refs)}"
            )
        else:
            _log(
                f"실패: 매칭 수 부족. best='{best_title}', "
                f"good={best_count}, required={MIN_MATCH_COUNT}, top=[{score_text}]"
            )
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
        _log("알라딘 검색 생략: 빈 query")
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
            _log(f"알라딘 검색 실패: 응답 파싱 실패 query='{q}'")
            return fallback
        items = data.get("item")
        if items is None:
            _log(f"알라딘 검색 결과 없음: item 없음 query='{q}'")
            return fallback
        if isinstance(items, dict):
            items = [items]
        if not items:
            _log(f"알라딘 검색 결과 없음: 빈 item query='{q}'")
            return fallback
        it = items[0]
        if not isinstance(it, dict):
            _log(f"알라딘 검색 실패: item 형식 오류 query='{q}'")
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
    except Exception as e:
        _log(f"알라딘 검색 예외: query='{q}', error={e!s}")
        return fallback


def identify_book(frame: np.ndarray) -> dict[str, Any] | None:
    global _matcher
    if _matcher is None:
        _matcher = ORBMatcher()

    title = _matcher.match(frame)
    if title is None:
        _log("identify_book 실패: ORB 매칭 결과 없음")
        return None

    if title in KNOWN_REF_BOOKS:
        _log(
            "identify_book 성공: 고정 refs 매칭 "
            f"matched='{title}', isbn13={KNOWN_REF_BOOKS[title].get('isbn13')}"
        )
        return KNOWN_REF_BOOKS[title]

    book = search_aladin(title)
    _log(
        "identify_book 성공: ORB 매칭 후 알라딘 검색 "
        f"matched='{title}', result_title='{book.get('title')}', isbn13={book.get('isbn13')}"
    )
    return book
