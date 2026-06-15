# 시연 전체 흐름 (수정본)

> 최종 수정: 2026-06-15  
> 관련 문서: [`Verso_mobility/docs/web-robot-integration.md`](../Verso_mobility/docs/web-robot-integration.md), [`docs/gestures.md`](./gestures.md)

웹·로봇·조종자(RC)가 함께 수행하는 **8단계 시연 시나리오**입니다.  
웹 앱 시연 책 매핑은 `src/data/demoScenario.ts` · `src/data/fixtureRobotRoute.ts` 기준입니다.

| 시연 목적지 | 책 | waypoint id |
|-------------|-----|-------------|
| 목적지 1 (초기) | 오직 두 사람 | `book2` |
| 목적지 2 (확장) | 어른이 된다는 것 | `book1` |

---

## 역할

| 역할 | 설명 |
|------|------|
| **사용자** | 웹 UI 또는 로그 페이지에서 waypoints·command 발행 |
| **웹** | rosbridge 송수신, 경로·모드 UI 표시 (`escort` / `stopped` / `guidance`) |
| **로봇** | Nav2 주행, TSP 정렬, 사람 추적·거리 유지, 장애물 회피, 이벤트 발행 |
| **조종자** | RC 토글로 수동 주행·제어권 전환 (Phase 3~4) |

---

## 로봇 내부 모드 참고

일반 웨이포인트 주행 시 로봇은 **`GUIDED_ESCORT`** 모드로 동작합니다 (`guided_escort_node`).

- Nav2 방향 제어 유지
- 후방 카메라로 사람 감지 → 거리 기반 선속도 스케일링
- 목표 거리 **1.3m**, 가속·감속·정지 임계(가까움 가속 / 멀어짐 감속 / **2.1m 이상 정지**)

홈 복귀(`end_session`) 등은 **`ESCORT`**(사람 추적 없음)로 분기됩니다.  
웹 `/verso/status`의 `mode` 필드는 여전히 `"guidance"` \| `"escort"`로 표시됩니다.

---

## Phase 1 — 세션 시작 및 주행

| 주체 | 동작 |
|------|------|
| 사용자 | 목적지 1 웨이포인트 전송 |
| 사용자 | **start** 명령 전송 |
| 로봇 | 현재 위치 기준 TSP 정렬 → Nav2 goal 발행, 경로 생성 |
| 웹 | `escort` + 경로 표시 |

**웹 프로토콜 매핑**

1. `/verso/waypoints` — 목적지 1만 포함 (예: `book2` / 오직 두 사람)
2. `/verso/command` — `set_mode: escort` (시연 스크립트의 “start”에 해당)

---

## Phase 2 — 주행 중 거리 유지 시연 (GUIDED_ESCORT)

| 주체 | 동작 |
|------|------|
| 로봇 | Nav2 방향 제어 + 후방 카메라 사람 감지, 거리 기반 속도 스케일링 |
| 사용자 | 로봇 뒤에서 걷기 → 로봇이 앞서 가며 **1.3m** 거리 유지 |
| 로봇 | 너무 가까우면 가속 / 뒤처지면 감속 / **2.1m 이상** 멀어지면 정지 |
| 웹 | `escort` |

별도 웹 명령 없음. 로봇이 `GUIDED_ESCORT`로 자율 주행·거리 유지.

---

## Phase 3 — 주행 중 이탈 / 조종기 전환 시연

| 주체 | 동작 |
|------|------|
| 사용자 | 웹에서 **stop** 또는 **guidance** 명령 전송 |
| 웹 | `stopped` 또는 `guidance` 표시 |
| 로봇 (내부) | ESCORT 유지 — Nav2가 계속 goal 발행 중 |
| 조종자 | 웹 상태 변경 확인 후 **RC 토글 올려** 제어권 획득 |
| 조종자 | RC로 원하는 위치까지 이탈 주행 |

**웹 프로토콜**

- `{"type":"command","action":"stop"}` — 즉시 정지
- `{"type":"command","action":"set_mode","mode":"guidance"}` — 사람 따라가기 모드

> 웹 UI는 stopped/guidance로 보이지만, RC 이탈 시연을 위해 로봇 내부 Nav2 goal 발행은 잠시 유지될 수 있음. 조종자는 RC로 실제 주행권을 가져감.

---

## Phase 4 — 새 목적지 추가 및 경로 재시작

| 주체 | 동작 |
|------|------|
| 사용자 | **목적지 1 + 목적지 2** 포함 웨이포인트 목록 재전송 |
| 로봇 | 현재 RC 이탈 위치 기준 TSP 최적 정렬 → 즉시 Nav2 goal 재발행 |
| 웹 | `escort` + 새 경로 표시 |
| 조종자 | 웹에서 escort + 새 경로 확인 후 **RC 토글 내려** 제어권 반환 |
| 로봇 | Nav2 `cmd_vel` 수신 재개 → ESCORT 주행 시작 |

**웹 프로토콜**

1. `/verso/waypoints` — `book2` + `book1` 전체 목록 (이미 방문한 경유지는 제외하고 미방문만 보낼 것)
2. `/verso/command` — `set_mode: escort`

---

## Phase 5 — 순차 방문 + 장애물 회피 시연

| 주체 | 동작 |
|------|------|
| 로봇 | TSP 정렬 순서로 첫 목적지 주행 |
| 로봇 | 라이다 기반 동적 장애물 회피 (Nav2 DWB) |
| 로봇 | 카메라 기반 낮은 장애물 회피 (`collision_monitor`) |
| 웹 | `escort` + 경로 표시 |

---

## Phase 6 — 경유지 도착 및 재개

| 주체 | 동작 |
|------|------|
| 로봇 | 첫 목적지 도착 → `waypoint_arrived` 이벤트 → **STOPPED** |
| 웹 | `stopped` + 도착 알림 |
| 사용자 | 확인 후 **resume** 명령 전송 |
| 로봇 | 다음 목적지 Nav2 goal 발행, 새 경로 생성 |
| 웹 | `escort` + 새 경로 표시 |

**웹 프로토콜**

- 수신: `{"type":"event","event":"waypoint_arrived","waypoint_id":"book2",...}`
- 송신: `{"type":"command","action":"resume"}`

---

## Phase 7 — 최종 목적지 도착

| 주체 | 동작 |
|------|------|
| 로봇 | 최종 목적지 도착 → `waypoint_arrived` → **STOPPED** |
| 웹 | `stopped` + 도착 알림 |
| 사용자 | 결제 등 마무리 진행 |

시연 앱에서는 계산대 이동·카카오페이 QR 등 후속 UX가 이어질 수 있음 (`checkoutTool`).

---

## Phase 8 — 세션 종료 / 홈 복귀

| 주체 | 동작 |
|------|------|
| 사용자 | **end_session** + 홈 좌표 전송 |
| 로봇 | 웨이포인트 초기화 → 홈 좌표로 Nav2 직통 주행 (사람 추적 없음) |
| 웹 | `escort` + 홈 경로 표시 |
| 로봇 | 홈 도착 → `home_reached` + `session_ended` 이벤트 |
| 웹 | `guidance` + 세션 종료 표시 |

**웹 프로토콜**

```json
{"type":"command","action":"end_session","x":-22.362,"y":5.197}
```

홈 좌표는 `src/lib/verso/robotMissionCoords.ts`의 `ROBOT_MAP_START`와 동일.

---

## 시연 명령 요약 (웹 → 로봇)

| 시연 단계 | rosbridge 토픽 | payload 요약 |
|-----------|----------------|--------------|
| 목적지 전송 | `/verso/waypoints` | `{ type, waypoints[] }` |
| 주행 시작 | `/verso/command` | `set_mode: escort` |
| 정지 | `/verso/command` | `action: stop` |
| 나 따라와 | `/verso/command` | `set_mode: guidance` |
| 재개 | `/verso/command` | `action: resume` |
| 세션 종료 | `/verso/command` | `end_session` + 홈 x,y |

제스처 매핑: `stop` · `follow_me`→guidance · `lead_again`→escort — [`docs/gestures.md`](./gestures.md)

---

## 개발·리허설 도구

| 도구 | 용도 |
|------|------|
| `/verso-log` | rosbridge 연결, 목적지·명령 테스트 버튼, 송수신 로그 |
| `book_recognition/gesture_test.py` | 제스처 → rosbridge 직접 발행 |

---

## 현재 웹 앱 구현과의 차이 (참고)

- 메인 맵 UI에서는 로봇 연결 UI를 제거했고, Mock 백엔드로 화면 시연을 돌릴 수 있음.
- 실제 로봇 연동·단계별 버튼 테스트는 **로그 페이지** (`public/verso-log-monitor.html`)에서 수행.
- Phase 3~4의 **RC 토글**은 로봇 하드웨어·조종자 운영 절차이며 웹 코드에 없음.
- 시연 스크립트의 “start”는 프로토콜 상 별도 `action: start`가 아니라 **waypoints 후 `set_mode: escort`** 조합으로 이해하면 됨.
