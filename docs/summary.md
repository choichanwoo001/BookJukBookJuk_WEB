# BookJukBookJuk_WEB — 프로젝트 요약

> 작성일: 2026-04-06  
> 기준 커밋: `b2ca40c` (feat: 1차 책장 배치 완료 / 책장 후보 버튼 클릭하면 layer 보여줌)

---

## 프로젝트 개요

실제 서점 공간을 SLAM으로 스캔하여 생성한 3D 맵 위에서:
- **1인칭/3인칭으로 공간을 탐색**하고
- **책장 배치를 편집**할 수 있는 인터랙티브 웹 앱

현장 재배치 시뮬레이션 도구로 활용 가능하며, 최종적으로는 책 인식(카메라)과의 연동을 목표로 한다.

---

## 기술 스택

| 분류 | 라이브러리 / 버전 |
|------|-----------------|
| UI | React 19.2 |
| 3D 렌더링 | Three.js 0.182 |
| React ↔ Three.js 통합 | @react-three/fiber 9.5 |
| Three.js 헬퍼 | @react-three/drei 10.7 |
| 언어 | TypeScript 5.9 (strict) |
| 빌드 | Vite 8.0 |
| 린트 | ESLint 9 |
| 이미지 처리(스크립트) | Sharp 0.34 |

---

## 프로젝트 구조

```
src/
├── components/
│   ├── Map3DView.tsx              # 메인 컨테이너 (Canvas + UI)
│   ├── BookshelfEditPanel.tsx     # 편집 패널 UI
│   ├── ChatPanel.tsx              # 채팅 패널 (UI만 구현)
│   └── scene/
│       ├── SceneContent.tsx       # 3D 씬 오케스트레이터
│       ├── Meshes.tsx             # 벽/바닥/기둥/책장 메시 (6개 export)
│       ├── StickmanPlayer.tsx     # 스틱맨 캐릭터 + 보행 애니메이션
│       ├── CameraControllers.tsx  # 카메라 5종 (줌/팬/MouseLook/1인칭/3인칭)
│       ├── BookshelfOverlayInterior.tsx  # 책장 내부 상세 렌더링
│       └── MapDiffOverlayMesh.tsx # 맵 버전 차이 오버레이
│
├── hooks/
│   ├── useWorldMovement.ts        # WASD 이동 + 충돌 감지
│   ├── useBookshelfInstances.ts   # 책장 인스턴스 상태 관리
│   ├── useEditDragController.ts   # 마우스 드래그로 책장 조작
│   ├── useBookshelfClipboard.ts   # Ctrl+C/V 복사·붙여넣기
│   └── useMouseDrag.ts            # 마우스 드래그 기본 유틸
│
├── utils/
│   ├── rectUtils.ts               # 사각형 충돌 감지 (padding 지원)
│   ├── wallAlignment.ts           # 벽 정렬 알고리즘 (flush/parallel/facing)
│   ├── bookshelfCollision.ts      # 회전 책장 AABB 계산
│   ├── bookshelfSelection.ts      # 원형 범위 내 책장 선택
│   ├── bookshelfClipboard.ts      # JSON 파싱/직렬화
│   ├── bookGeometryUtils.ts       # 난수 생성(mulberry32) + 책 색상(HSL)
│   └── floorPolygon.ts            # 바닥 폴리곤 처리 (구멍 포함)
│
├── data/
│   ├── floorPlan.ts               # 벽/바닥/기둥/책장 통합 데이터
│   ├── mapData.ts                 # SLAM 자동 생성 맵 좌표 (61.6×33.35m)
│   ├── bookshelfOverlayLayer.ts   # 책장 후보 배치 (정렬 함수 적용)
│   ├── detectedFixtures.ts        # 자동 감지 기둥/책장 (현재 비어 있음)
│   └── mapDiffOverlayMeta.ts      # 맵 차이 오버레이 이미지 경로
│
├── types/
│   └── scene.ts                   # ViewMode, FixtureRenderInstance 등
│
└── config/
    └── constants.ts               # 카메라/이동/편집/재질 상수 전체
```

---

## 구현된 주요 기능

### 1. 3D 맵 렌더링
- SLAM 스캔 데이터(mapData.ts)로 벽/바닥/기둥 자동 생성
- **InstancedMesh** 활용 (기둥, 책장 무리를 단일 draw call)
- Three.js `ShapeGeometry`로 복잡한 바닥 폴리곤 (구멍 포함) 처리
- 서점 분위기의 따뜻한 재질 색상 (벽 베이지 #F5F0E8, 바닥 갈색 #B5885A)

### 2. 뷰 모드 4종

| 모드 | 설명 |
|------|------|
| `overview` | 위에서 보는 맵 전체 (팬+줌) |
| `edit` | 책장 편집 모드 (overview 시점 기반) |
| `firstPerson` | 1인칭 시점 (WASD 이동, 마우스 시점) |
| `thirdPerson` | 3인칭 시점 (캐릭터 뒤를 따라가는 카메라) |

### 3. 플레이어 이동 및 충돌
- **WASD** 키로 월드 이동, **A/D**로 카메라 yaw 회전
- 충돌 감지: 바닥 경계, 벽, 기둥, 책장 모두 포함 (플레이어 반경 0.24m)
- 회전된 책장도 AABB로 변환해 충돌 처리
- 스폰 지점 자동 선택 (막힌 경우 반경을 넓혀 빈 공간 탐색)

### 4. 스틱맨 캐릭터 (StickmanPlayer.tsx)
- 구/원기둥으로 구성된 스케치 스타일 3D 캐릭터
- 이동 속도에 비례하는 팔다리 흔들림 (sin 파동)
- 상하 bob 애니메이션
- 눈/코/입으로 정면 방향 표시
- 1인칭 시점에서는 숨김, 3인칭에서만 보임

### 5. 책장 편집 시스템

| 조작 | 동작 |
|------|------|
| Alt + 클릭 | 책장 선택 |
| 드래그 | 위치 이동 (xz 평면 광선 투사) |
| Shift + 드래그 | yaw 회전 |
| 마우스휠 | yaw 미세 조정 |
| E 키 | 선택 해제 |
| Ctrl+C / Ctrl+V | 책장 복사·붙여넣기 |
| Space + 드래그 | 카메라 팬 (편집 모드) |

- 너비/깊이 수치 직접 입력 (0.05~20m)
- **벽 정렬** 버튼: 평행(tangent) / 직각(normal)
- **전체 복사** / **변경분 복사** — 클립보드로 JSON 내보내기

### 6. 책장 내부 상세 렌더링 (BookshelfOverlayInterior.tsx)
책장 후보 오버레이에 실제 책이 꽂힌 모습을 표현:
- **섹션 자동 분할**: 너비 기준 베이(칸)와 높이 기준 선반 수 자동 계산
- **아일랜드 vs 벽면** 자동 감지: 벽에 가까운 책장은 한 면만 개방
- **InstancedMesh**로 수백 권의 책을 효율적으로 렌더링
- mulberry32 의사난수로 책 두께/높이/색상 결정론적 생성 (위치 기반 씨드 → 재렌더시 동일)

### 7. 책장 후보 배치 알고리즘 (bookshelfOverlayLayer.ts)

5가지 정렬 파이프라인 적용:
| 함수 | 역할 |
|------|------|
| `snapShelfCenterFlushAlways` | 무조건 뒷면을 벽에 접선 스냅 |
| `snapShelfCenterIfNearWall` | 벽에서 1m 이내일 때만 스냅 |
| `microAlignShelfClusterBackEdgesFour` | 2×2 책장 뒷면을 같은 직선에 정렬 |
| `alignBookshelfPairsFacingAcrossAisle` | 복도 양쪽 책장이 서로 마주보게 정렬 |

최종 후보 책장 수: **약 50개**

### 8. 맵 차이 오버레이
- 이전/현재 맵 버전 차이를 RGBA 텍스처로 시각화
- 반투명 평면 메시로 표시 (depthWrite=false)
- 체크박스로 토글

---

## 개발 히스토리 및 시행착오

커밋 로그 기반 개발 과정:

```
88423d7  feat: 1차 SLAM 맵 3D 생성 및 WASD 이동
   → SLAM 스캔 데이터를 파싱해 벽/바닥 생성, 기본 이동 구현

032013e  feat: 1차 맵 생성 완료
   → 기둥, 조명, 재질 정리

cf7512c  feat: 제스처 인식 기능 추가
   → 카메라 제스처 인식 실험 (현재 코드에 미포함)

418649c  Add book_recognition: ORB book ID, gestures, Aladin API demo
   → ORB 알고리즘으로 책 표지 인식, Aladin Open API 연동 데모
   → 현재 3D 뷰 코드에는 미통합 상태

ca0d3fe  feat: 아직 책장 배치 방법을 해결 못함
639ebf1  feat: 아직 책장 문제 해결 못함
   → 책장 자동 배치 시 벽 정렬이 맞지 않는 문제 반복
   → 정렬 함수 설계에서 여러 차례 수정

674139b  Merge branch 'main' (병합)

8276534  feat: 책장 editor ver1
   → 마우스 드래그로 책장 이동·회전, 선택, 클립보드 기능 완성

b2ca40c  feat: 1차 책장 배치 완료 / 책장 후보 버튼 클릭하면 layer 보여줌
   → bookshelfOverlayLayer 완성, 후보 레이어 토글 UI 추가
```

### 주요 시행착오

1. **책장 자동 정렬** — 가장 오래 걸린 문제
   - 단순 벽 스냅만으로는 복도 양쪽 책장이 서로 등진 방향으로 배치되는 버그
   - `alignBookshelfPairsFacingAcrossAisle` 함수를 별도로 설계해 해결
   - 2×2 클러스터 뒷면 미세 정렬도 별도 함수(`microAlignShelfClusterBackEdgesFour`) 필요

2. **회전된 책장과 충돌** — 회전값이 있는 책장은 단순 rect가 아니어서 AABB로 변환하는 유틸 필요

3. **바닥 폴리곤** — 복잡한 서점 평면에 구멍(기둥 등)이 있어 Three.js `Shape` + `Path` 조합으로 처리

4. **책 인식 시도** — ORB 기반 책 ID 인식 + Aladin API 연동을 실험했으나 3D 뷰와의 통합은 아직 미완성

---

## 핵심 알고리즘 요약

### 충돌 감지 (rectUtils.ts)
```
pointInRect(rect, x, z, padding):
  |x - cx| ≤ w/2 + padding  &&  |z - cz| ≤ d/2 + padding
```

### 회전 책장 AABB (bookshelfCollision.ts)
```
axisAlignedHalfW = |cos(yaw)| * w/2 + |sin(yaw)| * d/2
axisAlignedHalfD = |sin(yaw)| * w/2 + |cos(yaw)| * d/2
```

### 책 색상 (bookGeometryUtils.ts)
```
씨드 = hashSeed(cx, cz, 칸번호, 선반Y, 책번호)
rng  = mulberry32(씨드)
색상 = HSL(rng(), 0.42~0.70, 0.36~0.58)
```
→ 같은 위치의 책장은 항상 동일한 책 배치 재현

### 벽 접선 스냅 (wallAlignment.ts)
```
1. 모든 벽 세그먼트 중 최단거리 세그먼트 탐색
2. tangentYaw = atan2(세그먼트 방향)
3. 책장 중심을 뒷면이 벽에 닿도록 d/2 만큼 법선 방향 이동
```

---

## 설정값 한눈에 보기 (constants.ts)

| 항목 | 값 |
|------|-----|
| 1인칭 눈높이 | 1.52m |
| 걷기 속도 | 2.8 m/s |
| 플레이어 충돌 반경 | 0.24m |
| 바닥~천장 | 3.0m |
| 마우스 감도 | 0.0032 rad/px |
| 드래그 yaw 감도 | 0.008 rad/px |
| 오버뷰 높이 범위 | 10~120m |
| FOV 범위 (줌) | 42~62도 |
| 기본 책장 크기 | 1.8 × 0.85 × 2.34m |
| 편집 가능 크기 범위 | 0.05~20m |

---

## 리팩토링 이력 (2026-04-06)

리팩토링 전 상태와 각 변경 내용:

### Phase 1 — 상수 중앙화
- `SceneContent.tsx`에 인라인으로 정의된 `EDIT_YAW_DRAG_SENSITIVITY`, `EDIT_YAW_WHEEL_SENSITIVITY` → `constants.ts`로 이동
- `CameraControllers.tsx`의 하드코딩 `0.002` → `OVERVIEW_PAN_SPEED` 상수로 교체
- `useWorldMovement.ts`의 `WALK_SPEED_MPS`, 스폰 탐색 파라미터 → `constants.ts`로 이동
- 새로 추가된 상수: `BOOKSHELF_DUPLICATE_MIN_OFFSET`, `BOOKSHELF_DUPLICATE_RATIO`

### Phase 2 — EditDragController 훅 분리
- `SceneContent.tsx` 내부의 143줄짜리 `EditDragController` 컴포넌트
- → `src/hooks/useEditDragController.ts` 독립 훅으로 추출
- `SceneContent.tsx`의 `EditDragController`는 훅만 호출하는 8줄 thin wrapper로 축소
- 불필요해진 `Plane`, `Raycaster`, `Vector2`, `Vector3`, `useThree` import 제거

### Phase 3 — Map3DView.tsx God Component 분해 (474줄 → 130줄)
| 추출된 위치 | 내용 |
|------------|------|
| `src/utils/bookshelfClipboard.ts` | JSON 파싱, 오프셋 복제, 치수 clamp |
| `src/hooks/useBookshelfInstances.ts` | 책장 상태(추가/삭제/수정/선택/정렬) |
| `src/hooks/useBookshelfClipboard.ts` | 클립보드 + Ctrl+C/V 키보드 이벤트 |
| `src/components/BookshelfEditPanel.tsx` | 편집 패널 JSX 전체 |

### Phase 4 — BookshelfOverlayInterior.tsx 분리
| 추출된 위치 | 내용 |
|------------|------|
| `src/utils/bookGeometryUtils.ts` | `mulberry32`, `hashSeed`, `bookColorHex` |
| `computeIslandLayout()` 순수함수 | 아일랜드 책장 레이아웃 계산 |
| `computeWallLayout()` 순수함수 | 벽면 책장 레이아웃 계산 |
| `IslandShelfMesh` 컴포넌트 | 아일랜드 책장 JSX |
| `WallShelfMesh` 컴포넌트 | 벽면 책장 JSX |

---

## 현재 미완성 / 향후 과제

| 항목 | 현황 |
|------|------|
| 채팅 패널 (ChatPanel) | UI만 존재, 백엔드 미연결 |
| 책 인식 (ORB + Aladin API) | 별도 데모만 존재, 3D 뷰 미통합 |
| 자동 감지 기둥/책장 | `detectedFixtures.ts` 비어 있음 |
| 책장 다중 선택 | 미구현 |
| 실행 취소(undo) | 미구현 |

---

## 빠른 시작

```bash
npm install
npm run dev       # localhost:5173
npm run build     # 프로덕션 빌드
npx tsc --noEmit  # 타입 체크
```

---

## 파일 수 요약

| 분류 | 파일 수 |
|------|--------|
| 컴포넌트 | 7 |
| 커스텀 훅 | 5 |
| 유틸리티 | 7 |
| 데이터 | 5 |
| 타입 / 설정 | 2 |
| **합계** | **26** |
