"""책 인식 HTTP API. `identify_book` / `search_aladin` 재사용.

실행 (리포 루트):
  uvicorn book_recognition.api_server:app --host 127.0.0.1 --port 8787
"""

from __future__ import annotations

import base64
from typing import Any, Literal, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .book_identifier import identify_book, search_aladin

app = FastAPI(title="BookJuk book recognition", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IdentifyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: Literal["add", "remove"]
    hintText: Optional[str] = Field(default=None, description="이미지 없을 때 알라딘 제목 검색")
    imageBase64: Optional[str] = Field(default=None, description="웹캠/이미지(JPEG/PNG) base64 또는 data URL")


class IdentifyResponse(BaseModel):
    ok: bool
    title: Optional[str] = None
    author: Optional[str] = None
    isbn13: Optional[str] = None
    price: Optional[str | int | float] = None
    message: str
    errorCode: Optional[str] = None


def _data_url_to_bytes(data: str) -> bytes:
    s = data.strip()
    if s.startswith("data:") and "," in s:
        s = s.split(",", 1)[1]
    return base64.b64decode(s, validate=True)


def _bgr_from_base64(b64: str) -> np.ndarray:
    raw = _data_url_to_bytes(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("image decode failed")
    return img


def _book_to_result(
    ok: bool,
    book: dict[str, Any] | None,
    message: str,
    error_code: str | None,
) -> IdentifyResponse:
    if not book:
        return IdentifyResponse(ok=ok, message=message, errorCode=error_code)
    isbn = book.get("isbn13")
    return IdentifyResponse(
        ok=ok,
        title=book.get("title"),
        author=book.get("author") or None,
        isbn13=str(isbn) if isbn else None,
        price=book.get("price"),
        message=message,
        errorCode=error_code,
    )


@app.post("/identify", response_model=IdentifyResponse)
def identify_post(body: IdentifyRequest) -> IdentifyResponse:
    has_img = bool(body.imageBase64 and str(body.imageBase64).strip())
    hint = (body.hintText or "").strip()

    if not has_img and not hint:
        raise HTTPException(
            status_code=400,
            detail="imageBase64 또는 hintText 중 하나는 필요합니다.",
        )

    if has_img:
        try:
            frame = _bgr_from_base64(str(body.imageBase64))
        except (ValueError, OSError) as e:
            return _book_to_result(
                False,
                None,
                f"이미지를 디코딩할 수 없습니다: {e!s}",
                "IMAGE_DECODE_ERROR",
            )

        book = identify_book(frame)
        if book is None:
            return IdentifyResponse(
                ok=False,
                message="책 표지를 ORB로 매칭하지 못했습니다. 힌트(제목)로 검색해 보세요.",
                errorCode="BOOK_NOT_RECOGNIZED",
            )
        return _book_to_result(True, book, "인식 성공", None)

    # hint only — 알라딘 검색 (ORB 생략)
    book = search_aladin(hint)
    t = (str(book.get("title") or "")).strip()
    isbn = book.get("isbn13")
    if not t and not isbn:
        return IdentifyResponse(
            ok=False,
            message="검색 결과가 없습니다. 다른 키워드를 시도해 주세요.",
            errorCode="HINT_NO_RESULT",
        )
    return _book_to_result(True, book, f'"{hint}"(으)로 검색했어요.', None)
