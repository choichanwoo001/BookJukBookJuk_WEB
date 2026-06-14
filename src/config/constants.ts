import { MeshStandardMaterial } from 'three'
import { FLOOR_HEIGHT_M } from '../data/floorPlan'

// --- Camera ---
/** 탑뷰(이동/내비) 기본 카메라 높이 — overview(Y=50)보다 zoom in. */
export const TOP_DOWN_CAMERA_Y_M = 10
export const TOP_DOWN_Y_MIN = 7
export const TOP_DOWN_Y_MAX = 18
export const TOP_DOWN_DEFAULT_FOV = 52
export const TOP_DOWN_ZOOM_SENSITIVITY = 0.03
/** 이동 중 카메라 yaw를 진행 방향에 맞출 때 지수 보간 계수 (초당). */
export const TOP_DOWN_FOLLOW_YAW_LAMBDA = 14
/** 로봇 follow 시 탑뷰 yaw 보간 (초당). */
export const TOP_DOWN_ROBOT_FOLLOW_YAW_LAMBDA = 9
/** 탑뷰 WASD 중 A/D 시점 회전 속도 (라디안/초). */
export const TOP_DOWN_KEYBOARD_YAW_RAD_PER_SEC = 1.35

export const OVERVIEW_ZOOM_SENSITIVITY = 0.05
export const OVERVIEW_Y_MIN = 10
export const OVERVIEW_Y_MAX = 120
/** 오버뷰/미니맵 방향 정합용 Y축 오프셋(라디안). 오버뷰 카메라는 부모 회전 없이 위에서 내려다봄. */
export const MAP_VIEW_YAW_OFFSET_RAD = 0
/** 로봇 /verso/status heading → 웹 yaw 보정(라디안). 현장 테스트 후 조정. */
export const VERSO_ROBOT_HEADING_OFFSET_RAD = 0
export const ROBOT_POSITION_SMOOTHING = 18
export const ROBOT_HEADING_SMOOTHING = 16
export const ROBOT_BODY_YAW_SMOOTHING = 18
/** 소프트 follow 구간; 이보다 크면 초기 진입·재연결 시 스냅. */
export const ROBOT_SYNC_SNAP_DISTANCE_M = 1.5
export const ROBOT_SYNC_HARD_SNAP_DISTANCE_M = 2.5
export const ROBOT_MOVE_DIRECTION_EPSILON_M = 0.01
/** mock 로봇 경로 보행 속도 (m/s). WALK_SPEED_MPS와 분리. */
export const ROBOT_MOCK_ROUTE_SPEED_MPS = 1.6
/** 실로봇 status extrapolation·화면 follow 속도 상한 (m/s). */
export const ROBOT_DISPLAY_MAX_SPEED_MPS = 1.8
/** mock/rosbridge UI용 lastStatus 갱신 최소 간격 (ms). 실로봇 /verso/status 1Hz와 동일. */
export const ROBOT_MOCK_UI_STATUS_INTERVAL_MS = 1000

export const DEFAULT_BOOKSHELF_SIZE = { w: 1.8, d: 0.85, h: FLOOR_HEIGHT_M * 0.78 }

/** Min/max for editable fixture width & depth (m) in edit mode. */
export const MIN_FIXTURE_PLAN_M = 0.05
export const MAX_FIXTURE_PLAN_M = 20

// --- Edit Controls ---
export const EDIT_YAW_DRAG_SENSITIVITY = 0.008
export const EDIT_YAW_WHEEL_SENSITIVITY = 0.001

// --- Movement ---
export const WALK_SPEED_MPS = 2.8
export const SPAWN_SEARCH_MAX_RADIUS = 5
export const SPAWN_SEARCH_STEP = 0.3

// --- Navigation route (책장 순회) ---
/** A* 그리드 셀 크기 (m). */
export const NAV_GRID_CELL_M = 0.25
/** 목표 책장 도착 판정 반경 (m). */
export const NAV_ARRIVAL_RADIUS_M = 0.65
/** 하이라이트 선 색 보간: 이 거리(m) 이상이면 멀리 있는 톤으로 고정. */
export const NAV_HIGHLIGHT_DISTANCE_BLEND_FAR_M = 14
/** 책장 앞 목표점: 깊이 방향으로 벽에서 띄우는 거리 (m). */
export const NAV_GOAL_MARGIN_M = 0.55
/** 경로 세그먼트 보행 검사 시 샘플 간격 (m). 벽·unknown 누락 방지용. */
export const NAV_SEGMENT_SAMPLE_STEP_M = 0.1
/** 표시용 곡선 리샘플 간격 (m). */
export const NAV_PATH_DISPLAY_SAMPLE_STEP_M = 0.12
/** 자동 보행 중 yaw가 목표 heading으로 수렴하는 지수 보간 계수(초당). 낮을수록 부드럽고 느림. */
export const NAV_HEADING_SMOOTH_LAMBDA = 10
/** 자동 보행 heading을 이 거리(m)만큼 앞 지점 기준으로 산출 — 코너 진입 전 미리 방향 전환. */
export const NAV_HEADING_LOOK_AHEAD_M = 0.8
/** 자동 보행 경로 모드 위치 lerp 계수(초당). 클수록 목표 지점에 빠르게 따라붙음. */
export const NAV_POSITION_SMOOTH_LAMBDA = 20
/** Catmull-Rom control point 최소 간격 (m). */
export const NAV_PATH_SMOOTH_MIN_POINT_SPACING_M = 0.35
/** 바닥 경로 라인 두께 (픽셀, drei Line). */
export const NAV_LINE_WIDTH_PX = 6
export const NAV_LINE_OPACITY_DIM = 0.34
export const NAV_LINE_OPACITY_BRIGHT = 0.95
/** 멀리 있을 때 밝은 선 투명도(하이라이트 거리 보간 끝단). */
export const NAV_LINE_OPACITY_HIGHLIGHT_FAR = 0.78
export const NAV_LINE_COLOR_DIM = '#4aa3ff'
export const NAV_LINE_COLOR_BRIGHT = '#fff06a'
/** 멀리 있을 때 밝은 선이 보간되는 색. */
export const NAV_LINE_COLOR_HIGHLIGHT_FAR = '#5ee7ff'
export const NAV_ROUTE_Y = 0.08

/** 목적지(서가·계산대) 도착 후 TTS 시작 전 대기 시간 (ms). */
export const DESTINATION_ARRIVAL_PAUSE_MS = 10_000

// --- Overview Pan ---
export const OVERVIEW_PAN_SPEED = 0.002

// --- Bookshelf Duplicate ---
export const BOOKSHELF_DUPLICATE_MIN_OFFSET = 0.8
export const BOOKSHELF_DUPLICATE_RATIO = 0.75

// --- Selection ---
export const SURFACE_WALL_OVERLAP_M = 0.04
/** 벽 리본 InstancedMesh 세그먼트 두께 (레이캐스트용, 시각적으로 거의 0에 가깝게). */
export const WALL_SEGMENT_THICKNESS_M = 0.06
export const FIXED_SELECTION_RADIUS_M = 0.35

// --- Materials ---
export const wallMaterial = new MeshStandardMaterial({ color: '#F5F0E8', roughness: 0.92, metalness: 0.0, side: 2 })
/** 입구 문틀 (벽보다 어두운 목재톤). */
export const entranceDoorFrameMaterial = new MeshStandardMaterial({
  color: '#4A4238',
  roughness: 0.82,
  metalness: 0.04,
  side: 2,
})
/** 입구 문패널. */
export const entranceDoorLeafMaterial = new MeshStandardMaterial({
  color: '#5C4030',
  roughness: 0.76,
  metalness: 0.05,
  side: 2,
})
export const bookshelfMaterial = new MeshStandardMaterial({ color: '#8E5C42', roughness: 0.78, metalness: 0.02, side: 2 })

/** 맵 차이와 같이 토글되는 후보 책장 오버레이 (본편 책장과 구분). */
export const bookshelfOverlayLayerMaterial = new MeshStandardMaterial({
  color: '#B8956A',
  roughness: 0.72,
  metalness: 0.04,
  emissive: '#3d2a14',
  emissiveIntensity: 0.22,
  side: 2,
})

/** 후보 책장 오버레이 내부 선반·세로 파티션 (외곽보다 약간 어두운 목재). */
export const bookshelfOverlayInteriorWoodMaterial = new MeshStandardMaterial({
  color: '#8B6F4A',
  roughness: 0.78,
  metalness: 0.03,
  emissive: '#2a1e10',
  emissiveIntensity: 0.12,
  side: 2,
})

/** 본편 계산대 — 마트형 카운터(흰 받침·은색 허브·녹색 포인트) 서브메시용. */
export const counterPedestalMaterial = new MeshStandardMaterial({
  color: '#F2F2F2',
  roughness: 0.52,
  metalness: 0.1,
  side: 2,
})
/** 오버레이 후보 계산대 — 본편과 구분되는 살짝 따뜻한 흰색. */
export const counterOverlayPedestalMaterial = new MeshStandardMaterial({
  color: '#E8E4DC',
  roughness: 0.54,
  metalness: 0.08,
  emissive: '#2a2218',
  emissiveIntensity: 0.06,
  side: 2,
})
export const counterFootBlackMaterial = new MeshStandardMaterial({
  color: '#121212',
  roughness: 0.88,
  metalness: 0.04,
  side: 2,
})
export const counterWorkMetalMaterial = new MeshStandardMaterial({
  color: '#B4B8BF',
  roughness: 0.32,
  metalness: 0.58,
  side: 2,
})
export const counterLoadingSurfaceMaterial = new MeshStandardMaterial({
  color: '#2C2C2C',
  roughness: 0.62,
  metalness: 0.12,
  side: 2,
})
export const counterBaggingSurfaceMaterial = new MeshStandardMaterial({
  color: '#D5D9DC',
  roughness: 0.52,
  metalness: 0.1,
  side: 2,
})
export const counterKellyAccentMaterial = new MeshStandardMaterial({
  color: '#00A651',
  roughness: 0.42,
  metalness: 0.14,
  emissive: '#003d20',
  emissiveIntensity: 0.07,
  side: 2,
})
export const counterOverlayKellyAccentMaterial = new MeshStandardMaterial({
  color: '#2BAE66',
  roughness: 0.44,
  metalness: 0.12,
  emissive: '#0a3020',
  emissiveIntensity: 0.1,
  side: 2,
})
export const counterTrimChromeMaterial = new MeshStandardMaterial({
  color: '#A5AAAE',
  roughness: 0.22,
  metalness: 0.72,
  side: 2,
})
export const counterMonitorBezelMaterial = new MeshStandardMaterial({
  color: '#141414',
  roughness: 0.82,
  metalness: 0.05,
  side: 2,
})
export const counterScannerGreyMaterial = new MeshStandardMaterial({
  color: '#8E9298',
  roughness: 0.48,
  metalness: 0.35,
  side: 2,
})
export const counterCashDrawerMaterial = new MeshStandardMaterial({
  color: '#6D7278',
  roughness: 0.4,
  metalness: 0.45,
  side: 2,
})
export const displayLowMaterial = new MeshStandardMaterial({ color: '#A1887F', roughness: 0.8, metalness: 0.02, side: 2 })
export const pillarMaterial = new MeshStandardMaterial({ color: '#D9D0C3', roughness: 0.86, metalness: 0.0, side: 2 })
export const floorMaterial = new MeshStandardMaterial({ color: '#B5885A', roughness: 0.85, metalness: 0.02, side: 2 })
export const ceilingMaterial = new MeshStandardMaterial({ color: '#EDE8DE', roughness: 0.88, metalness: 0.0, side: 2 })
export const markerMaterial = new MeshStandardMaterial({ color: '#c9a56a', emissive: '#5c4020', emissiveIntensity: 0.35 })
export const topDownPlayerMaterial = new MeshStandardMaterial({ color: '#fff06a', emissive: '#fff06a', emissiveIntensity: 0.45 })
export const areaMaterial = new MeshStandardMaterial({ color: '#c9a56a', transparent: true, opacity: 0.28 })
export const selectedOverlayMaterial = new MeshStandardMaterial({ color: '#e6be5a', transparent: true, opacity: 0.35, depthWrite: false, side: 2 })
export const selectedWireMaterial = new MeshStandardMaterial({ color: '#e6be5a', wireframe: true, transparent: true, opacity: 0.7, side: 2 })

/** 카카오페이 데모 결제 — 권당 고정가 (원). env `VITE_KAKAO_PAY_DEMO_BOOK_PRICE_KRW`로 덮어쓸 수 있음. */
export const KAKAO_PAY_DEMO_BOOK_PRICE_KRW = 15_000
