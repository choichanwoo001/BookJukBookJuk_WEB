"""인메모리 쇼핑 리스트."""

from __future__ import annotations

import re
from typing import Any


def _parse_price_value(price: Any) -> int:
    if price is None:
        return 0
    if isinstance(price, int):
        return max(0, price)
    s = str(price).replace(",", "").strip()
    m = re.search(r"(\d+)", s)
    return int(m.group(1)) if m else 0


class ShoppingList:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def add(self, book: dict[str, Any]) -> bool:
        isbn = str(book.get("isbn13") or "").strip()
        title = str(book.get("title") or "").strip()
        if isbn:
            for it in self.items:
                if str(it.get("isbn13") or "").strip() == isbn:
                    return False
        elif title:
            for it in self.items:
                if str(it.get("isbn13") or "").strip():
                    continue
                if str(it.get("title") or "").strip() == title:
                    return False
        else:
            return False
        pr = book.get("price")
        self.items.append(
            {
                "title": title,
                "author": book.get("author") or "",
                "isbn13": isbn if isbn else "",
                "price": "" if pr is None else pr,
            }
        )
        return True

    def remove_by_isbn(self, isbn13: str) -> bool:
        key = str(isbn13 or "").strip()
        if not key:
            return False
        for i, it in enumerate(self.items):
            if str(it.get("isbn13") or "").strip() == key:
                self.items.pop(i)
                return True
        return False

    def remove_book(self, book: dict[str, Any]) -> bool:
        """ISBN이 있으면 ISBN으로, 없으면 제목으로 제거."""
        isbn = str(book.get("isbn13") or "").strip()
        title = str(book.get("title") or "").strip()
        if isbn:
            return self.remove_by_isbn(isbn)
        if not title:
            return False
        for i, it in enumerate(self.items):
            if str(it.get("isbn13") or "").strip():
                continue
            if str(it.get("title") or "").strip() == title:
                self.items.pop(i)
                return True
        return False

    def display(self) -> None:
        line = "── 쇼핑 리스트 ──────────────────────"
        bottom = "──────────────────────────────────────"
        if not self.items:
            print(line)
            print("[ 리스트가 비어있습니다 ]")
            print(bottom)
            return

        total = 0
        print(line)
        for idx, it in enumerate(self.items, start=1):
            title = it.get("title") or ""
            author = it.get("author") or ""
            pv = _parse_price_value(it.get("price"))
            total += pv
            price_str = f"₩{pv:,}" if pv else "₩—"
            print(f"{idx}. {title} / {author}\t{price_str}")
        print(f"총 {len(self.items)}권  |  합계 ₩{total:,}")
        print(bottom)
