import { MeshStandardMaterial } from 'three'
import { FLOOR_HEIGHT_M } from '../data/floorPlan'

// --- Camera ---
export const THIRD_PERSON_DISTANCE_M = 4.2
export const THIRD_PERSON_TARGET_HEIGHT_M = 1.0
export const THIRD_PERSON_LOOK_AHEAD_M = 1.2
export const THIRD_PERSON_MIN_CAMERA_Y_M = 1.72
export const THIRD_PERSON_MAX_CAMERA_Y_M = FLOOR_HEIGHT_M - 0.22
export const THIRD_PERSON_LOCKED_PITCH = -0.5
/** 이동 중 카메라 요(yaw)를 캐릭터 앞방향에 맞출 때 지수 보간 계수 (초당). */
export const THIRD_PERSON_FOLLOW_YAW_LAMBDA = 14
/** 3인칭 WASD 중 A/D 시점 회전 속도 (라디안/초). */
export const THIRD_PERSON_KEYBOARD_YAW_RAD_PER_SEC = 1.35

/** 1인칭 카메라 높이 (바닥 기준, m). */
export const FIRST_PERSON_EYE_HEIGHT_M = 1.52
/** 1인칭 기본 시선 (라디안, 약간 아래). */
export const FIRST_PERSON_DEFAULT_PITCH = -0.06
export const FIRST_PERSON_PITCH_MIN = -1.35
export const FIRST_PERSON_PITCH_MAX = 0.62

export const MOUSE_LOOK_SENSITIVITY = 0.0032
export const MOUSE_LOOK_PITCH_MIN = -1.2
export const MOUSE_LOOK_PITCH_MAX = -0.56

export const ZOOM_FOV_MIN = 42
export const ZOOM_FOV_MAX = 62
export const ZOOM_FOV_SENSITIVITY = 0.02
export const WALK_DEFAULT_FOV = 64
/** 3인칭 기본 FOV (1인칭·전체 보기 64°와 분리). */
export const THIRD_PERSON_DEFAULT_FOV = 52
/** 3인칭 하단 버튼으로 FOV를 바꿀 때 한 번에 바뀌는 각도(도). */
export const WALK_FOV_BUTTON_STEP = 2
/** 3인칭 가림 반투명: 최종 불투명도 (낮을수록 더 투명). */
export const THIRD_PERSON_OCCLUDER_OPACITY = 0.5
/** 3인칭 가림 레이: 카메라 주변 오프셋(m). 얇은 벽·단일 레이 미스 보완. */
export const THIRD_PERSON_OCCLUSION_RAY_OFFSET_M = 0.22
/** 앵커(플레이어 높이) 주변 끝점 cone 오프셋(m). 카메라–앵커 직선이 벽을 비껴가도 가림 탐지. */
export const THIRD_PERSON_OCCLUSION_ANCHOR_CONE_M = 0.42
/** 연속 이 프레임만 레이 미스일 때 페이드 해제 (히스테리시스). */
export const THIRD_PERSON_OCCLUSION_RELEASE_DELAY_FRAMES = 5
export const OVERVIEW_ZOOM_SENSITIVITY = 0.05
export const OVERVIEW_Y_MIN = 10
export const OVERVIEW_Y_MAX = 120
/** 오버뷰/미니맵 방향 정합용 Y축 오프셋(라디안). 오버뷰 카메라는 부모 회전 없이 위에서 내려다봄. */
export const MAP_VIEW_YAW_OFFSET_RAD = 0

// --- Player ---
export const PLAYER_SCALE = 0.7
export const THIRD_PERSON_PLAYER_SCALE_MULT = 1.12
export const DEFAULT_BOOKSHELF_SIZE = { w: 1.8, d: 0.85, h: FLOOR_HEIGHT_M * 0.78 }
export const DISPLAY_SHELF_DEFAULT_HEIGHT_M = 1.02

/** Min/max for editable fixture width & depth (m) in edit mode. */
export const MIN_FIXTURE_PLAN_M = 0.05
export const MAX_FIXTURE_PLAN_M = 20

// --- Edit Controls ---
export const EDIT_YAW_DRAG_SENSITIVITY = 0.008
export const EDIT_YAW_WHEEL_SENSITIVITY = 0.001

// --- Movement ---
export const WALK_SPEED_MPS = 2.8
export const SPAWN_SEARCH_MAX_RADIUS = 10
export const SPAWN_SEARCH_STEP = 0.3
/** floorRects 격자 fallback에서 후보 점 간격 (m). */
export const SPAWN_GRID_FALLBACK_STEP = 0.3

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
/** 바닥 경로 라인 두께 (픽셀, drei Line). */
export const NAV_LINE_WIDTH_PX = 4
export const NAV_LINE_OPACITY_DIM = 0.22
export const NAV_LINE_OPACITY_BRIGHT = 0.95
/** 멀리 있을 때 밝은 선 투명도(하이라이트 거리 보간 끝단). */
export const NAV_LINE_OPACITY_HIGHLIGHT_FAR = 0.78
export const NAV_LINE_COLOR_DIM = '#6ab4ff'
export const NAV_LINE_COLOR_BRIGHT = '#4de8ff'
/** 멀리 있을 때 밝은 선이 보간되는 색. */
export const NAV_LINE_COLOR_HIGHLIGHT_FAR = '#8af0ff'
export const NAV_ARRIVAL_RING_INNER = 0.5
export const NAV_ARRIVAL_RING_OUTER = 0.72
export const NAV_ROUTE_Y = 0.04
/** false면 3D·미니맵 경로 선만 숨김 (내비 계산은 그대로). */
export const SHOW_NAVIGATION_ROUTE_VISUAL = false

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

// --- Gait Animation ---
export const GAIT_BASE_SPEED = 4
export const GAIT_SPEED_MULTIPLIER = 1.8
export const GAIT_MAX_SPEED_ADD = 8
export const GAIT_SWING_AMPLITUDE = 0.52
export const GAIT_BOB_AMPLITUDE = 0.035
export const GAIT_MOVE_THRESHOLD = 0.03

// --- Materials ---
export const wallMaterial = new MeshStandardMaterial({ color: '#F5F0E8', roughness: 0.92, metalness: 0.0, side: 2 })
export const bookshelfMaterial = new MeshStandardMaterial({ color: '#8E5C42', roughness: 0.78, metalness: 0.02, side: 2 })

/** 맵 차이와 같이 토글되는 후보 책장 오버레이 (본편 책장과 구분). */
export const bookshelfOverlayLayerMaterial = new MeshStandardMaterial({
  color: '#B8956A',
  roughness: 0.72,
  metalness: 0.04,
  emissive: '#1a3a52',
  emissiveIntensity: 0.22,
  side: 2,
})

/** 후보 책장 오버레이 내부 선반·세로 파티션 (외곽보다 약간 어두운 목재). */
export const bookshelfOverlayInteriorWoodMaterial = new MeshStandardMaterial({
  color: '#8B6F4A',
  roughness: 0.78,
  metalness: 0.03,
  emissive: '#152838',
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
  emissive: '#1a2838',
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
export const displayShelfFrameMaterial = new MeshStandardMaterial({
  color: '#6B4A35',
  roughness: 0.78,
  metalness: 0.03,
  side: 2,
})
export const displayShelfTopMaterial = new MeshStandardMaterial({
  color: '#8E6650',
  roughness: 0.7,
  metalness: 0.04,
  side: 2,
})
export const displayShelfBookMaterial = new MeshStandardMaterial({
  color: '#D7C7A2',
  roughness: 0.86,
  metalness: 0.01,
  side: 2,
})
export const pillarMaterial = new MeshStandardMaterial({ color: '#D9D0C3', roughness: 0.86, metalness: 0.0, side: 2 })
export const floorMaterial = new MeshStandardMaterial({ color: '#B5885A', roughness: 0.85, metalness: 0.02, side: 2 })
export const ceilingMaterial = new MeshStandardMaterial({ color: '#EDE8DE', roughness: 0.88, metalness: 0.0, side: 2 })
export const playerMaterial = new MeshStandardMaterial({ color: '#2B2B2B', roughness: 0.85, metalness: 0.0 })
/** 스틱맨 머리 앞쪽 눈·입 등 표시용 (앞방향 구분). */
export const playerFaceFeatureMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, metalness: 0.0 })
export const markerMaterial = new MeshStandardMaterial({ color: '#58D68D', emissive: '#1f6f4a', emissiveIntensity: 0.35 })
export const areaMaterial = new MeshStandardMaterial({ color: '#58D68D', transparent: true, opacity: 0.28 })
export const selectedOverlayMaterial = new MeshStandardMaterial({ color: '#4FC3F7', transparent: true, opacity: 0.35, depthWrite: false, side: 2 })
export const selectedWireMaterial = new MeshStandardMaterial({ color: '#4FC3F7', wireframe: true, transparent: true, opacity: 0.7, side: 2 })
