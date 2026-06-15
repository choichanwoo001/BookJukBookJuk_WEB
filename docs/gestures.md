# 손 제스처 정리

산책 웹캠 제스처 데모(`book_recognition/gesture_test.py`)에서 인식하는 **손 제스처 6종**과 각각의 동작을 정리한 문서입니다.

> **범위:** Python 로컬 데모만 해당합니다. 웹 React 앱에는 브라우저 제스처 루프가 없고, 책 표지 인식은 버튼 + HTTP `/identify`로 동작합니다.

---

## 1. 제스처 목록 (총 6개)

| # | ID | 손 모양 | 카테고리 | 확정 시 동작 |
|---|-----|---------|----------|--------------|
| 1 | `stop` | 손가락 전부 펼침 (오픈 팜) | 이동체 | 로봇 정지 |
| 2 | `follow_me` | 주먹 | 이동체 | 나 따라와 (guidance) |
| 3 | `lead_again` | 검지 + 엄지 ㄴ자 | 이동체 | 다시 리드해 (escort) |
| 4 | `thumbs_up` | 엄지만 펴기 (위) | 책 | 표지 인식 후 리스트 추가 |
| 5 | `thumbs_down` | 엄지만 펴기 (아래) | 책 | 표지 인식 후 리스트 제거 |
| 6 | `ok_sign` | OK 사인 (엄지·검지 접촉, 나머지 펴짐) | — | 분류만 (동작 없음) |

**이동체 연동:** 3개 (`stop`, `follow_me`, `lead_again`)  
**책 리스트 연동:** 2개 (`thumbs_up`, `thumbs_down`)  
**동작 없음:** 1개 (`ok_sign`)

---

## 2. 이동체(Verso) 명령 매핑

제스처가 **연속 15프레임** 동일하게 유지되면 확정되고, 이동 제스처는 rosbridge `/verso/command`로 1회 발행됩니다.

| 제스처 | 의미 | rosbridge payload |
|--------|------|-------------------|
| `stop` | 즉시 정지 | `{"type":"command","action":"stop"}` |
| `follow_me` | 로봇이 사람을 따라감 (detour 대기 중이면 어른이 된다는 것 browse waypoints + escort) | `guidance` 또는 `/verso/waypoints` + `escort` |
| `lead_again` | 로봇이 웨이포인트 경로를 다시 리드 | `{"type":"command","action":"set_mode","mode":"escort"}` |

### 로봇 모드 설명

| mode | 설명 |
|------|------|
| `guidance` | 사람 따라가기. 진행 중인 경유지 주행 취소. |
| `escort` | 웨이포인트 순차 주행. **waypoints가 이미 전송된 상태**에서만 유효. |

`lead_again`만 보내고 웹에서 `/verso/waypoints`를 아직 보내지 않았다면 로봇이 무시할 수 있습니다. 프로토콜 상세는 [`Verso_mobility/docs/web-robot-integration.md`](../Verso_mobility/docs/web-robot-integration.md) 참고.

---

## 3. 책 리스트 제스처

| 제스처 | 동작 |
|--------|------|
| `thumbs_up` | 현재 웹캠 프레임으로 `identify_book()` → 성공 시 `ShoppingList.add()` |
| `thumbs_down` | 동일 프레임으로 식별 → `ShoppingList.remove_book()` |

ORB 표지 매칭 + 알라딘 메타데이터 보강 흐름은 [`book_recognition/README.md`](../book_recognition/README.md) 참고.

---

## 4. 분류 우선순위

한 손에 여러 조건이 겹칠 수 있어, 아래 순서로 **먼저 매칭된 제스처**가 채택됩니다.

```
stop → thumbs_up → thumbs_down → ok_sign → lead_again → follow_me → (없음)
```

### 손 모양 판별 요약

| ID | 판별 조건 |
|----|-----------|
| `stop` | 엄지·검지·중·약·소 전부 펴짐 |
| `thumbs_up` | 엄지만 펴짐, 엄지 끝이 위쪽 |
| `thumbs_down` | 엄지만 펴짐, 엄지 끝이 아래쪽 |
| `ok_sign` | 엄지·검지 끝 접촉 + 중·약·소 펴짐 |
| `lead_again` | 검지·엄지 펴짐, 중·약·소 접힘, OK 핀치 아님 |
| `follow_me` | 다섯 손가락 모두 접힘 (주먹) |

> **제거됨:** 예전 `restart`(검지만 펴기)는 `lead_again`(ㄴ자)과 역할이 겹쳐 분류에서 제외했습니다.

---

## 5. 확정·쿨다운

| 설정 | 값 | 설명 |
|------|-----|------|
| `CONFIRM_FRAMES` | 15 | 같은 제스처가 연속 유지되어야 확정 |
| `COOLDOWN_FRAMES` | 45 | 확정 후 재확정까지 대기 프레임 |

확정 시 터미널 출력 예:

```
[CONFIRMED] follow_me
[VERSO] sent {'type': 'command', 'action': 'set_mode', 'mode': 'guidance'}
```

rosbridge 미연결 시 `[VERSO] publish failed ...` 경고만 출력하고 제스처 루프는 계속됩니다.

---

## 6. 실행·환경 변수

```bash
pip install -r book_recognition/requirements.txt

# Windows
set VERSO_ROSBRIDGE_URL=ws://로봇IP:9090

# macOS / Linux
# export VERSO_ROSBRIDGE_URL=ws://로봇IP:9090

python -m book_recognition.gesture_test
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VERSO_ROSBRIDGE_URL` | `ws://127.0.0.1:9090` | 제스처 → 로봇 명령용 rosbridge WebSocket 주소 |

종료: OpenCV 창 포커스 상태에서 `q`

---

## 7. 관련 소스

| 파일 | 역할 |
|------|------|
| [`book_recognition/gesture_classifiers.py`](../book_recognition/gesture_classifiers.py) | 제스처 분류 규칙, `MOBILITY_GESTURES` |
| [`book_recognition/gesture_test.py`](../book_recognition/gesture_test.py) | 웹캠 루프, 확정·쿨다운, 책/로봇 핸들러 |
| [`book_recognition/verso_gesture_bridge.py`](../book_recognition/verso_gesture_bridge.py) | rosbridge WebSocket publish |
| [`book_recognition/gesture_classifiers_test.py`](../book_recognition/gesture_classifiers_test.py) | 분류·페이로드 단위 테스트 |

---

## 8. 웹 앱과의 관계

| 구분 | Python 제스처 데모 | 웹 React 앱 |
|------|-------------------|-------------|
| 제스처 인식 | MediaPipe + 규칙 기반 | 없음 |
| 이동체 제어 | rosbridge 직접 publish | 채팅/음성 → `mobilityControlTool` → Verso (`stop` / `resume`); 계산대 → `checkoutTool` → waypoints + escort |
| 책 담기/빼기 | thumbs_up/down + ORB | `BookRecognitionPanel` 버튼 + HTTP `/identify` |

향후 웹에서도 “나 따라와” / “다시 리드해”를 지원하려면 Agent intent + `set_mode` 명령 확장이 별도 작업입니다.
