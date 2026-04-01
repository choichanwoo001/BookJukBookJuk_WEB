import { MeshStandardMaterial } from 'three'
import { FLOOR_HEIGHT_M } from '../data/floorPlan'

// --- Camera ---
export const THIRD_PERSON_DISTANCE_M = 6.2
export const THIRD_PERSON_TARGET_HEIGHT_M = 1.0
export const THIRD_PERSON_LOOK_AHEAD_M = 1.35
export const THIRD_PERSON_MIN_CAMERA_Y_M = 2.15
export const THIRD_PERSON_MAX_CAMERA_Y_M = FLOOR_HEIGHT_M - 0.22
export const THIRD_PERSON_LOCKED_PITCH = -0.72

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

// --- Materials ---
export const wallMaterial = new MeshStandardMaterial({ color: '#F5F0E8', roughness: 0.92, metalness: 0.0, side: 2 })
export const bookshelfMaterial = new MeshStandardMaterial({ color: '#8E5C42', roughness: 0.78, metalness: 0.02, side: 2 })
export const pillarMaterial = new MeshStandardMaterial({ color: '#D9D0C3', roughness: 0.86, metalness: 0.0, side: 2 })
export const floorMaterial = new MeshStandardMaterial({ color: '#B5885A', roughness: 0.85, metalness: 0.02, side: 2 })
export const playerMaterial = new MeshStandardMaterial({ color: '#2B2B2B', roughness: 0.85, metalness: 0.0 })
export const markerMaterial = new MeshStandardMaterial({ color: '#58D68D', emissive: '#1f6f4a', emissiveIntensity: 0.35 })
export const areaMaterial = new MeshStandardMaterial({ color: '#58D68D', transparent: true, opacity: 0.28 })
