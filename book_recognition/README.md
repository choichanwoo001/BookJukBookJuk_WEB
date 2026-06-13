# book_recognition — 웹캠 책 표지 인식 · 제스처 쇼핑 리스트

**웹 앱 채팅**은 Supabase(매장 DB 카탈로그)를 우선 사용하고, 카탈로그에 없을 때 `POST /identify`(이미지·`hintText`)로 **book_recognition** API fallback을 호출합니다. 채팅 패널의 **책 표지 인식** UI에서 웹캠 캡처 → 담기/빼기도 같은 API를 사용합니다.

---

이전: 웹 프론트에서 identify를 호출하지 않았으나, 2026-06 연동으로 복원됨.

---

서점/매장 시나리오를 가정한 **로컬 데모 모듈**입니다. 웹캠으로 책 표지를 등록한 뒤, **ORB 특징 매칭**으로 현재 화면의 책을 식별하고, **MediaPipe 손 제스처**로 리스트에 넣거나 뺍니다. 메타데이터는 **알라딘 TTB(ItemSearch) API**로 보강합니다.

---

## 1. 기술 흐름

```
[등록 단계] register.py
  웹캠 → 스페이스 캡처 → 파일명(책 제목) → refs/<제목>.jpg 저장

[런타임] gesture_test.py
  웹캠 프레임
    ├─ MediaPipe Hand Landmarker → 제스처 분류
    ├─ 이동 제스처 확정 → verso_gesture_bridge → rosbridge /verso/command
    └─ thumbs_up/down 확정 → book_identifier.identify_book(frame)
                          ├─ ORB + BFMatcher: refs/ 이미지들과 특징점 매칭
                          │   (최다 inlier 수, 거리·개수 임계값 통과 시 제목 확정)
                          └─ search_aladin(제목) → ISBN, 저자, 가격, 표지 URL 등
  ShoppingList → thumbs_up: add / thumbs_down: remove (ISBN 우선)
```

- **ORB (Oriented FAST and Rotated BRIEF)**: 조명·약간의 시점 변화에 비교적 강한 **로컬 특징**으로 표지를 기술합니다. 딥러닝 추론 없이 CPU에서 동작해 **경량·오프라인 매칭**에 적합합니다.
- **BFMatcher (Hamming, crossCheck)**: 이진 기술자 간 **완전 탐색 매칭**으로 참조와 쿼리를 정렬합니다.
- **알라딘 API**: ORB가 맞춘 **파일 stem(등록 시 제목)**을 검색어로 써서 상용 도서 DB와 연결합니다.
- **제스처**: 연속 N프레임 동일 분류 시 **확정**, 이후 쿨다운으로 오인식을 줄입니다. 이동 제스처는 rosbridge로 Verso 로봇에 명령을 보냅니다.

### 제스처 ↔ 동작

| 제스처 | 손 모양 | 동작 |
|--------|---------|------|
| `stop` | 손가락 전부 펼침 (오픈 팜) | `{"action":"stop"}` → 로봇 정지 |
| `follow_me` | 주먹 | `{"action":"set_mode","mode":"guidance"}` → 나 따라와 (사람 추적) |
| `lead_again` | 검지+엄지 ㄴ자 | `{"action":"set_mode","mode":"escort"}` → 다시 리드해 (웨이포인트 주행) |
| `thumbs_up` | 엄지만 | 책 표지 인식 후 리스트 추가 |
| `thumbs_down` | 엄지 아래 | 책 표지 인식 후 리스트 제거 |
| `ok_sign` | OK 사인 | 분류만 (동작 없음) |

> **`lead_again`(escort)** 는 웹에서 `/verso/waypoints`가 이미 전송된 상태에서만 로봇이 주행을 재개합니다. waypoints 없이 `set_mode: escort`만 보내면 로봇이 무시할 수 있습니다. 자세한 프로토콜은 [`Verso_mobility/docs/web-robot-integration.md`](../Verso_mobility/docs/web-robot-integration.md) 참고.

---

## 2. 기능 요약

| 구성요소 | 역할 |
|----------|------|
| `register.py` | `refs/`에 표지 이미지 등록 (캡처 + 제목 입력) |
| `book_identifier.py` | ORB 매칭, 알라딘 검색, `identify_book()` |
| `shopping_list.py` | 인메모리 리스트 add/remove/출력 |
| `gesture_classifiers.py` | 손 랜드마크 규칙 기반 제스처 분류 (테스트 가능, mediapipe 불필요) |
| `gesture_test.py` | 웹캠 + 제스처 루프, 이동 제스처 → rosbridge, thumbs_up/down → 식별·리스트 |
| `verso_gesture_bridge.py` | rosbridge WebSocket으로 `/verso/command` 1회 발행 |
| `api_server.py` | **HTTP `POST /identify`** — 웹 프론트에서 호출(이미지 base64 또는 `hintText`로 `search_aladin`만 사용) |
| `refs/` | 등록된 표지 이미지 (저장소에는 `.gitkeep`만 두고, 실제 jpg/png는 로컬 생성) |

**환경 변수**

- `ALADIN_TTB_KEY`: 알라딘 TTB 키. 미설정 시 코드 내 기본 키가 사용될 수 있으므로, **배포·공개 저장소에서는 반드시 자신의 키로 교체**하세요.
- `VERSO_ROSBRIDGE_URL`: 제스처 → 로봇 명령용 rosbridge 주소. 기본 `ws://127.0.0.1:9090`. 로봇 IP에 맞게 설정 (예: `ws://192.168.0.10:9090`).

**실행 예시** (이 폴더 또는 패키지 경로에 맞게)

```bash
# 웹 (표지 인식 API는 dev 서버에 내장)
npm run dev

npm run refs:demo                     # 시나리오 refs 4권 파일 존재 확인

# Python 전체 데모 (선택)
pip install -r requirements.txt
python register.py                    # 웹캠 수동 등록
python gesture_test.py                # 제스처 + ORB 데모

# 로봇 연동 (rosbridge가 떠 있을 때)
set VERSO_ROSBRIDGE_URL=ws://로봇IP:9090   # Windows
# export VERSO_ROSBRIDGE_URL=ws://로봇IP:9090  # macOS/Linux
python -m book_recognition.gesture_test
```

**HTTP identify (웹 연동)** — 리포지토리 **루트**에서:

```bash
npm run dev
# (선택) 독립 API: npm run api:identify  또는 Python uvicorn …
```

- `POST http://127.0.0.1:8787/identify`  
  - JSON: `{ "reason": "add" | "remove", "hintText"?: "...", "imageBase64"?: "..." }`  
  - `imageBase64`가 있으면 `identify_book(프레임)`; 없고 `hintText`만 있으면 알라딘 제목 검색.

MediaPipe 모델은 최초 실행 시 `book_recognition/.models/` 아래로 내려받습니다 (`.gitignore` 처리).

---

## 3. 기술적 의의

1. **3D 매장 내비(WEB)와의 연결점**  
   동일 프로젝트 안에 두면, “매대 앞에서 책을 비추고 → 제스처로 담기” 같은 **실물 책 UX**를 웹 기반 매장 지도·추천 파이프라인과 **개념적으로 정렬**하기 쉽습니다. (현재는 Python 로컬 데모; 프론트와의 API 연동은 추후 확장 과제.)

2. **하이브리드 인식 전략**  
   **로컬 비전(ORB)**으로 “어떤 책인지”를 빠르게 좁히고, **외부 API(알라딘)**로 정규 메타데이터를 붙이는 구조는, 모델 학습 비용 없이 **도메인(국내 도서)**에 맞는 식별을 보여 줍니다.

3. **터치 없는 인터랙션**  
   MediaPipe 기반 **손 랜드마크 + 규칙 기반 제스처**는 키오스크·장갑 착용 등 상황에서 **UI 대안**으로 쓰일 수 있으며, 확정/쿨다운 패턴은 실사용에서 흔한 **안정화 패턴**입니다.

4. **한계(문서화 목적)**  
   ORB는 **같은 책의 다른 판·심한 반사·큰 시점 차이**에 약할 수 있고, 알라딘 검색은 **제목 유사도**에 의존합니다. 프로덕션에서는 ISBN 바코드, 임베딩 기반 검색, 또는 서버 측 재랭킹 등과 병행하는 것이 일반적입니다.

---

## 4. 이 저장소에서의 위치

본 디렉터리는 [산책 Web](https://github.com/choichanwoo001/BookJukBookJuk_WEB) 저장소의 **React + Three.js 실내 맵**과 별도 실행되는 **Python 실험/데모**입니다. 맵 시각화와 향후 통합 아키텍처를 한 저장소에서 추적하기 위해 포함되었습니다.
