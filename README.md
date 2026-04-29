# BookJukBookJuk Web

SLAM 기반 실내 맵을 웹 3D 공간으로 변환해 시각화하고, 사용자가 WASD로 이동하며 매대/벽/기둥을 확인할 수 있는 프로젝트입니다.

---

## 1) 지금까지 작업 요약

### 초기 단계
- Vite + React + TypeScript 기반 웹 프런트엔드 프로젝트로 시작.
- React Three Fiber(`@react-three/fiber`, `three`, `@react-three/drei`)를 도입해 3D 렌더링 환경 구성.

### 1차 맵 구축
- SLAM 결과물을 바탕으로 1차 맵 데이터를 생성.
- 생성된 좌표를 사용해 3D 공간에서 기본 벽/바닥 구조 렌더링.

### 이동/카메라 개선
- WASD 이동 로직(`useWorldMovement`) 구현.
- 단순 이동에서 끝나지 않고, 충돌(벽/매대/기둥)과 바닥 판정까지 반영.
- 전체 보기(overview) + 3인칭 시점(third person) 전환 기능 추가.

### 맵 데이터 정제 자동화
- `scripts/processMap.mjs`를 중심으로 맵 추출 파이프라인 구축.
- 이미지/PGM + YAML 메타데이터로부터 `src/data/mapData.ts`를 자동 생성.
- `src/data/floorPlan.ts`에서 실사용 보정값(예: 제거 존, 바닥 채움)을 적용.

### 현재 진행 중
- `ver0.jpg`, `ver1.jpg` 기반으로 맵 재추출/보정 반복.
- 벽 폴리라인/홀 처리, 매대 방향(yaw) 추정, 기둥 추출 안정화 작업 진행.
- 제스처 인식 실험 흔적(`gesture_buy` 관련)은 정리/재구성 중.

---

## 2) 시행착오와 해결 내용

### 시행착오 A: 맵 데이터가 코드와 안 맞는 문제
- **문제**: 맵 이미지가 바뀌었는데 런타임 코드만 수정하다 보니 좌표 불일치 발생.
- **해결**: `PGM(or 이미지) + YAML -> processMap -> mapData` 파이프라인을 고정하고, 맵 변경 시 재생성 원칙으로 정리.

### 시행착오 B: YAML 설정값 미스매치
- **문제**: `image`, `resolution`, `origin`이 현재 이미지와 맞지 않으면 전체 맵 오프셋/스케일이 틀어짐.
- **해결**: 재생성 전에 YAML 핵심 키를 먼저 검증하는 절차를 작업 루틴으로 고정.

### 시행착오 C: 노이즈 제거 시 구조물 유실
- **문제**: 작은 wall 클러스터 제거 과정에서 실제 기둥/구조물까지 사라지는 경우 발생.
- **해결**: 클러스터 크기만 보지 않고, 종횡비/채움률/경계 접촉 여부를 같이 판단해 pillar-like 컴포넌트를 보존.

### 시행착오 D: 실내 폐곡선/홀 처리 오류
- **문제**: 내부 공간과 홀(구멍) 경계가 엉키면 바닥/벽 메시가 깨짐.
- **해결**: 루프 추출 후 면적 기준 외곽 루프 선택, 홀 루프 분리, 단축 세그먼트 제거 및 축 정렬(snap) 단계 추가.

### 시행착오 E: 이동 체감 불안정
- **문제**: 카메라 방향 기준 이동/월드 좌표 이동이 어긋나면 조작감이 어색하고 벽 끼임이 발생.
- **해결**: yaw 기반 이동 벡터 변환 + x/z 축 분리 충돌 판정(slide) + 스폰 포인트 탐색 로직으로 안정화.

---

## 3) 현재 아키텍처

```text
맵 이미지(PGM/JPG) + map_info/b2floor_edited.yaml
  -> scripts/processMap.mjs
  -> src/data/mapData.ts (자동 생성)
  -> src/data/floorPlan.ts (수동 보정/필터)
  -> src/components/Map3DView.tsx (렌더링 + 인터랙션)
  -> src/hooks/useWorldMovement.ts (이동 + 충돌)
```

핵심 원칙:
- `src/data/mapData.ts`는 생성 파일이므로 수동 대규모 편집 금지.
- 맵이 바뀌면 코드보다 먼저 `YAML` 확인 후 스크립트 재실행.

---

## 4) 실행 방법

```bash
npm install
npm run dev
```

빌드/정적 점검:

```bash
npm run lint
npm run build
```

맵 데이터 재생성:

```bash
node scripts/processMap.mjs
```

ver0/ver1 차이 검출 JSON(파이썬 출력) 반영:

```bash
npm run fixtures:convert -- --input detected_fixtures.json
```

이미지 2장 차이 기반으로 책장 자동 검출(`detectedFixtures.ts` 생성):

```bash
npm run fixtures:delta -- --base ver0_1.png --target ver2_1.png --output src/data/detectedFixtures.ts
```

디버그 마스크까지 함께 저장:

```bash
npm run fixtures:delta -- --base ver0_1.png --target ver2_1.png --debug-dir scripts/samples
```

샘플 JSON 스모크 테스트:

```bash
npm run fixtures:convert -- --input scripts/samples/detected_fixtures.sample.json --dry-run
```

---

## 5) 향후 정리 예정 항목

- 제스처 인식 모듈 재통합 여부 확정(프론트 단독/별도 서비스 분리).
- 맵 보정값(`floorPlan.ts`)의 수동 개입 지점을 더 줄이기 위한 자동화.
- 테스트/검증 루틴(맵 재생성 -> 렌더 확인 -> 이동 충돌 확인) 문서화.
