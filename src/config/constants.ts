import { MeshStandardMaterial } from 'three'
import { FLOOR_HEIGHT_M } from '../data/floorPlan'

// --- Camera ---
export const THIRD_PERSON_DISTANCE_M = 6.2
export const THIRD_PERSON_TARGET_HEIGHT_M = 1.0
export const THIRD_PERSON_LOOK_AHEAD_M = 1.35
export const THIRD_PERSON_MIN_CAMERA_Y_M = 2.15
export const THIRD_PERSON_MAX_CAMERA_Y_M = FLOOR_HEIGHT_M - 0.22
export const THIRD_PERSON_LOCKED_PITCH = -0.72
/** 이동 중 카메라 요(yaw)를 캐릭터 앞방향에 맞출 때 지수 보간 계수 (초당). */
export const THIRD_PERSON_FOLLOW_YAW_LAMBDA = 14
/** 3인칭 WASD 중 A/D 시점 회전 속도 (라디안/초). */
export const THIRD_PERSON_KEYBOARD_YAW_RAD_PER_SEC = 1.35
/** 3인칭 스프링암: 벽 히트 시 카메라를 앵커 쪽으로 당길 때 표면 안쪽 여유 (m). */
export const THIRD_PERSON_CAMERA_SKIN_M = 0.28
/** 3인칭: 앵커(어깨 높이)에서 카메라까지 최소 거리 (너무 붙지 않게, m). */
export const THIRD_PERSON_MIN_CAMERA_DISTANCE_M = 0.75

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
export const OVERVIEW_ZOOM_SENSITIVITY = 0.05
export const OVERVIEW_Y_MIN = 10
export const OVERVIEW_Y_MAX = 120

// --- Player ---
export const PLAYER_SCALE = 0.7
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

// --- Overview Pan ---
export const OVERVIEW_PAN_SPEED = 0.002

// --- Bookshelf Duplicate ---
export const BOOKSHELF_DUPLICATE_MIN_OFFSET = 0.8
export const BOOKSHELF_DUPLICATE_RATIO = 0.75

// --- Selection ---
export const SURFACE_WALL_OVERLAP_M = 0.04
export const FIXED_SELECTION_RADIUS_M = 0.35

// --- Gait Animation ---
export const GAIT_BASE_SPEED = 4
export const GAIT_SPEED_MULTIPLIER = 1.8
export const GAIT_MAX_SPEED_ADD = 8
export const GAIT_SWING_AMPLITUDE = 0.52
export const GAIT_BOB_AMPLITUDE = 0.035
export const GAIT_MOVE_THRESHOLD = 0.03

// --- Floor Fill ---
export const FLOOR_FILL_CLIP_CELL_M = 0.14

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

export const counterMaterial = new MeshStandardMaterial({ color: '#6D4C41', roughness: 0.76, metalness: 0.03, side: 2 })
export const displayLowMaterial = new MeshStandardMaterial({ color: '#A1887F', roughness: 0.8, metalness: 0.02, side: 2 })
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
