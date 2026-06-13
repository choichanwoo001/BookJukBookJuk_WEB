import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  subscribeMapCommand,
  subscribeNavigationSync,
} from '../agent/runtime/agentEventBus'
import {
  ROBOT_MOCK_ROUTE_SPEED_MPS,
  ROBOT_MOCK_UI_STATUS_INTERVAL_MS,
  VERSO_ROBOT_HEADING_OFFSET_RAD,
} from '../config/constants'
import { buildFixtureRobotRoute, type FixtureRobotRoute } from '../data/fixtureRobotRoute'
import type { Point2 } from '../data/floorPlan'
import type { VersoCommandAction, VersoConnectionState, VersoPath, VersoStatus } from '../lib/verso/types'
import { registerVersoCommandBridge } from '../lib/verso/versoCommandBridge'
import { samplePathAtDistance, pathLengthM } from '../utils/pathSampling'
import { worldXzToRobotMap } from '../utils/robotMapCoords'

export type MockVersoRobotRouteResult = {
  connectionState: VersoConnectionState
  lastStatus: VersoStatus | null
  lastPath: VersoPath | null
  robotSyncActive: boolean
  liveStatusRef: RefObject<VersoStatus | null>
}

type RuntimeState = {
  route: FixtureRobotRoute
  distanceM: number
  totalM: number
  paused: boolean
  arrivalPaused: boolean
  nextArrivalIndex: number
  lastFrameAt: number
}

function statusForSample(
  route: FixtureRobotRoute,
  point: Point2,
  headingRad: number,
  nextArrivalIndex: number,
  isMoving: boolean,
): VersoStatus {
  const map = worldXzToRobotMap(point[0], point[1])
  const nextTarget = route.targets[Math.min(nextArrivalIndex, route.targets.length - 1)] ?? null
  return {
    x: map.x,
    y: map.y,
    heading: headingRad - VERSO_ROBOT_HEADING_OFFSET_RAD,
    mode: isMoving ? 'escort' : 'idle',
    isMoving,
    currentWaypointId: nextTarget?.id ?? null,
    remainingWaypoints: Math.max(0, route.targets.length - nextArrivalIndex),
  }
}

function dispatchArrivals(route: FixtureRobotRoute, state: RuntimeState): number {
  let nextArrivalIndex = state.nextArrivalIndex
  let arrived = false
  while (
    nextArrivalIndex < route.segmentEndDistancesM.length &&
    state.distanceM >= route.segmentEndDistancesM[nextArrivalIndex] - 1e-4
  ) {
    const target = route.targets[nextArrivalIndex]
    if (target.kind === 'checkout') {
      dispatchDwellEvent({ type: 'CHECKOUT_ARRIVED', version: AGENT_MAP_EVENT_VERSION })
    } else {
      dispatchDwellEvent({
        type: 'SHELF_ARRIVED',
        version: AGENT_MAP_EVENT_VERSION,
        legIndex: nextArrivalIndex,
        poolIndex: target.fixtureSource === 'bookshelfOverlayLayerInstances' ? target.fixtureIndex : null,
      })
    }
    nextArrivalIndex += 1
    arrived = true
  }
  if (arrived) {
    state.arrivalPaused = true
    state.paused = true
  }
  return nextArrivalIndex
}

export function useMockVersoRobotRoute(enabled: boolean): MockVersoRobotRouteResult {
  const [connectionState, setConnectionState] = useState<VersoConnectionState>('disconnected')
  const [lastStatus, setLastStatus] = useState<VersoStatus | null>(null)
  const [lastPath, setLastPath] = useState<VersoPath | null>(null)
  const liveStatusRef = useRef<VersoStatus | null>(null)
  const runtimeRef = useRef<RuntimeState | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastUiPublishAtRef = useRef(0)
  const tickRef = useRef<(now: number) => void>(() => {})
  const mobilityHoldRef = useRef(false)

  const publishUiStatus = useCallback((nextStatus: VersoStatus, force = false) => {
    liveStatusRef.current = nextStatus
    const now = performance.now()
    if (!force && now - lastUiPublishAtRef.current < ROBOT_MOCK_UI_STATUS_INTERVAL_MS) return
    lastUiPublishAtRef.current = now
    setLastStatus(nextStatus)
  }, [])

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const clearRuntime = useCallback(() => {
    stopFrame()
    runtimeRef.current = null
    liveStatusRef.current = null
    lastUiPublishAtRef.current = 0
    setConnectionState('disconnected')
    setLastStatus(null)
    setLastPath(null)
  }, [stopFrame])

  const resumeTickIfNeeded = useCallback(() => {
    if (frameRef.current === null && runtimeRef.current) {
      frameRef.current = requestAnimationFrame((t) => tickRef.current(t))
    }
  }, [])

  const tick = useCallback((now: number) => {
    const state = runtimeRef.current
    if (!state) return

    const deltaS = Math.max(0, Math.min(0.1, (now - state.lastFrameAt) / 1000))
    state.lastFrameAt = now
    const blocked = state.paused || mobilityHoldRef.current
    if (!blocked) {
      state.distanceM = Math.min(state.totalM, state.distanceM + ROBOT_MOCK_ROUTE_SPEED_MPS * deltaS)
    }

    state.nextArrivalIndex = dispatchArrivals(state.route, state)

    const sample = samplePathAtDistance(state.route.worldPath, state.distanceM)
    if (sample) {
      publishUiStatus(statusForSample(
        state.route,
        sample.point,
        sample.headingRad,
        state.nextArrivalIndex,
        !blocked && state.distanceM < state.totalM,
      ))
    }

    if (state.distanceM < state.totalM) {
      frameRef.current = requestAnimationFrame((t) => tickRef.current(t))
      return
    }

    frameRef.current = null
  }, [publishUiStatus])

  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  useEffect(() => {
    return subscribeNavigationSync((sync) => {
      mobilityHoldRef.current = sync.mobilityHold
      const state = runtimeRef.current
      if (!state) return

      if (sync.mobilityHold) {
        state.paused = true
        return
      }

      if (state.arrivalPaused) {
        state.arrivalPaused = false
        state.paused = false
        state.lastFrameAt = performance.now()
        resumeTickIfNeeded()
      }
    })
  }, [resumeTickIfNeeded])

  const startRoute = useCallback(() => {
    if (!enabled) return
    stopFrame()
    const route = buildFixtureRobotRoute()
    const totalM = pathLengthM(route.worldPath)
    runtimeRef.current = {
      route,
      distanceM: 0,
      totalM,
      paused: false,
      arrivalPaused: false,
      nextArrivalIndex: 0,
      lastFrameAt: performance.now(),
    }
    setConnectionState('connected')
    setLastPath(route.versoPath)
    const sample = samplePathAtDistance(route.worldPath, 0)
    const first = sample?.point ?? route.worldPath[0] ?? route.start
    const heading = sample?.headingRad ?? 0
    publishUiStatus(statusForSample(route, first, heading, 0, true), true)
    frameRef.current = requestAnimationFrame((t) => tickRef.current(t))
  }, [enabled, publishUiStatus, stopFrame])

  useEffect(() => {
    if (!enabled) {
      clearRuntime()
      return
    }

    return subscribeMapCommand((command) => {
      if (command.type === 'START_NAVIGATION') startRoute()
      if (command.type === 'PAUSE_MOBILITY' && runtimeRef.current) {
        runtimeRef.current.paused = true
      }
      if (command.type === 'RESUME_MOBILITY' && runtimeRef.current) {
        runtimeRef.current.paused = false
        runtimeRef.current.lastFrameAt = performance.now()
        resumeTickIfNeeded()
      }
    })
  }, [clearRuntime, enabled, resumeTickIfNeeded, startRoute])

  useEffect(() => {
    if (!enabled || connectionState !== 'connected') return
    const publish = (action: VersoCommandAction) => {
      const runtime = runtimeRef.current
      if (!runtime) return false
      if (action === 'stop') runtime.paused = true
      if (action === 'resume') {
        runtime.paused = false
        runtime.lastFrameAt = performance.now()
        resumeTickIfNeeded()
      }
      return true
    }
    registerVersoCommandBridge('connected', publish)
    return () => registerVersoCommandBridge('disconnected', null)
  }, [connectionState, enabled, resumeTickIfNeeded])

  useEffect(() => clearRuntime, [clearRuntime])

  return useMemo(
    () => ({
      connectionState,
      lastStatus,
      lastPath,
      robotSyncActive: connectionState === 'connected' && lastStatus !== null,
      liveStatusRef,
    }),
    [connectionState, lastPath, lastStatus],
  )
}
