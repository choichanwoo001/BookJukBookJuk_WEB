import { ROBOT_MOCK_ROUTE_SPEED_MPS, VERSO_ROBOT_HEADING_OFFSET_RAD } from '../../config/constants'
import { buildFixtureRobotRouteFromGoals } from '../../data/fixtureRobotRoute'
import { ENTRANCE_SPAWN, type Point2 } from '../../data/floorPlan'
import { pathLengthM, samplePathAtDistance } from '../../utils/pathSampling'
import { robotMapToWorldXz, worldXzToRobotMap } from '../../utils/robotMapCoords'
import type {
  VersoCommandAction,
  VersoEvent,
  VersoPath,
  VersoSetModeAction,
  VersoStatus,
  VersoWaypoint,
} from './types'

export type MockVersoMission = {
  waypoints: VersoWaypoint[]
  worldPath: Point2[]
  segmentEndDistancesM: number[]
  versoPath: VersoPath
}

export type MockVersoRobotState = {
  mission: MockVersoMission | null
  storedWaypoints: VersoWaypoint[]
  distanceM: number
  totalM: number
  paused: boolean
  arrivalPaused: boolean
  nextArrivalIndex: number
  mode: 'guidance' | 'escort'
  mobilityHold: boolean
  lastFrameAt: number
  lastStatusPublishAt: number
  pendingEvent: VersoEvent | null
  currentWorldXz: Point2
}

export type MockVersoTickResult = {
  status: VersoStatus | null
  path: VersoPath | null
  event: VersoEvent | null
  shouldContinue: boolean
}

export function createMockVersoRobotState(start: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]): MockVersoRobotState {
  return {
    mission: null,
    storedWaypoints: [],
    distanceM: 0,
    totalM: 0,
    paused: false,
    arrivalPaused: false,
    nextArrivalIndex: 0,
    mode: 'guidance',
    mobilityHold: false,
    lastFrameAt: 0,
    lastStatusPublishAt: 0,
    pendingEvent: null,
    currentWorldXz: [...start],
  }
}

export function goalsFromWaypoints(waypoints: VersoWaypoint[]): Point2[] {
  return waypoints.map((wp) => robotMapToWorldXz(wp.x, wp.y))
}

export function buildMockMissionFromWaypoints(
  waypoints: VersoWaypoint[],
  start: Point2,
): MockVersoMission | null {
  if (waypoints.length === 0) return null
  const goals = goalsFromWaypoints(waypoints)
  const route = buildFixtureRobotRouteFromGoals(goals, start)
  if (route.worldPath.length < 2) return null
  return {
    waypoints,
    worldPath: route.worldPath,
    segmentEndDistancesM: route.segmentEndDistancesM,
    versoPath: route.versoPath,
  }
}

function resolveStartFromState(state: MockVersoRobotState): Point2 {
  if (state.mission) {
    const sample = samplePathAtDistance(state.mission.worldPath, state.distanceM)
    if (sample) return sample.point
    return state.mission.worldPath[0] ?? state.currentWorldXz
  }
  return state.currentWorldXz
}

export function applyMockWaypoints(state: MockVersoRobotState, waypoints: VersoWaypoint[]): VersoPath | null {
  const start = resolveStartFromState(state)
  const mission = buildMockMissionFromWaypoints(waypoints, start)
  if (!mission) return null

  state.storedWaypoints = waypoints.slice()
  state.mission = mission
  state.distanceM = 0
  state.totalM = pathLengthM(mission.worldPath)
  state.paused = false
  state.arrivalPaused = false
  state.nextArrivalIndex = 0
  state.mode = 'escort'
  state.pendingEvent = null
  state.lastFrameAt = performance.now()
  state.currentWorldXz = mission.worldPath[0] ?? start
  return mission.versoPath
}

export function applyMockCommand(state: MockVersoRobotState, action: VersoCommandAction): boolean {
  if (action === 'stop') {
    state.paused = true
    return true
  }
  if (action === 'resume') {
    if (!state.mission || state.mode !== 'escort') return true
    state.paused = false
    state.arrivalPaused = false
    state.lastFrameAt = performance.now()
    return true
  }
  return false
}

export function applyMockSetMode(state: MockVersoRobotState, mode: VersoSetModeAction): boolean {
  if (mode === 'guidance') {
    state.mission = null
    state.storedWaypoints = []
    state.distanceM = 0
    state.totalM = 0
    state.paused = false
    state.arrivalPaused = false
    state.nextArrivalIndex = 0
    state.mode = 'guidance'
    state.pendingEvent = null
    return true
  }
  if (mode === 'escort') {
    if (state.storedWaypoints.length === 0) return true
    if (state.mission && state.arrivalPaused) {
      state.paused = false
      state.arrivalPaused = false
      state.mode = 'escort'
      state.lastFrameAt = performance.now()
      return true
    }
    if (!state.mission) {
      const path = applyMockWaypoints(state, state.storedWaypoints)
      return path != null
    }
    state.mode = 'escort'
    state.paused = false
    state.lastFrameAt = performance.now()
    return true
  }
  return false
}

function statusForSample(
  state: MockVersoRobotState,
  point: Point2,
  headingRad: number,
  isMoving: boolean,
): VersoStatus {
  const map = worldXzToRobotMap(point[0], point[1])
  const waypoints = state.mission?.waypoints ?? state.storedWaypoints
  const targetIndex = Math.min(state.nextArrivalIndex, Math.max(0, waypoints.length - 1))
  const currentWaypoint = waypoints[targetIndex] ?? null
  const remainingWaypoints = state.mission
    ? Math.max(0, waypoints.length - state.nextArrivalIndex)
    : 0

  return {
    x: map.x,
    y: map.y,
    heading: headingRad - VERSO_ROBOT_HEADING_OFFSET_RAD,
    mode: state.mode,
    isMoving,
    currentWaypointId: currentWaypoint?.id ?? null,
    remainingWaypoints,
  }
}

function checkArrivals(state: MockVersoRobotState): VersoEvent | null {
  const mission = state.mission
  if (!mission) return null

  while (
    state.nextArrivalIndex < mission.segmentEndDistancesM.length &&
    state.distanceM >= mission.segmentEndDistancesM[state.nextArrivalIndex] - 1e-4
  ) {
    const wp = mission.waypoints[state.nextArrivalIndex]
    state.nextArrivalIndex += 1
    state.arrivalPaused = true
    state.paused = true
    return {
      event: 'waypoint_arrived',
      waypointId: wp?.id,
      label: wp?.label,
    }
  }
  return null
}

export function tickMockVersoRobot(
  state: MockVersoRobotState,
  nowMs: number,
  options?: {
    speedMps?: number
    statusIntervalMs?: number
  },
): MockVersoTickResult {
  const speedMps = options?.speedMps ?? ROBOT_MOCK_ROUTE_SPEED_MPS
  const statusIntervalMs = options?.statusIntervalMs ?? 1000

  let emittedEvent: VersoEvent | null = null
  if (state.pendingEvent) {
    emittedEvent = state.pendingEvent
    state.pendingEvent = null
  }

  let emittedPath: VersoPath | null = null

  if (state.mission && state.mode === 'escort') {
    if (state.lastFrameAt <= 0) state.lastFrameAt = nowMs
    const deltaS = Math.max(0, Math.min(0.1, (nowMs - state.lastFrameAt) / 1000))
    state.lastFrameAt = nowMs

    const blocked = state.paused || state.mobilityHold
    if (!blocked) {
      state.distanceM = Math.min(state.totalM, state.distanceM + speedMps * deltaS)
    }

    const arrivalEvent = checkArrivals(state)
    if (arrivalEvent) {
      emittedEvent = arrivalEvent
    }

    const sample = samplePathAtDistance(state.mission.worldPath, state.distanceM)
    if (sample) {
      state.currentWorldXz = sample.point
    }
  }

  const sample = state.mission
    ? samplePathAtDistance(state.mission.worldPath, state.distanceM)
    : null
  const point = sample?.point ?? state.currentWorldXz
  const heading = sample?.headingRad ?? 0
  const blocked = state.paused || state.mobilityHold
  const isMoving =
    state.mode === 'escort' &&
    state.mission != null &&
    !blocked &&
    !state.arrivalPaused &&
    state.distanceM < state.totalM

  let status: VersoStatus | null = null
  const shouldPublishStatus =
    state.lastStatusPublishAt <= 0 || nowMs - state.lastStatusPublishAt >= statusIntervalMs

  if (shouldPublishStatus) {
    state.lastStatusPublishAt = nowMs
    status = statusForSample(state, point, heading, isMoving)
  }

  const shouldContinue =
    state.mission != null &&
    state.mode === 'escort' &&
    (state.distanceM < state.totalM || blocked)

  return {
    status,
    path: emittedPath,
    event: emittedEvent,
    shouldContinue,
  }
}

export function initialMockStatus(start: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]): VersoStatus {
  const map = worldXzToRobotMap(start[0], start[1])
  return {
    x: map.x,
    y: map.y,
    heading: 0,
    mode: 'guidance',
    isMoving: false,
    currentWaypointId: null,
    remainingWaypoints: 0,
  }
}
