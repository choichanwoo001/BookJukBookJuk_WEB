import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { subscribeMobilityHold, subscribeNavigationSync } from '../agent/runtime/agentEventBus'
import { ROBOT_MOCK_UI_STATUS_INTERVAL_MS } from '../config/constants'
import { ENTRANCE_SPAWN } from '../data/floorPlan'
import {
  applyMockCommand,
  applyMockSetMode,
  applyMockWaypoints,
  createMockVersoRobotState,
  initialMockStatus,
  tickMockVersoRobot,
  type MockVersoRobotState,
} from '../lib/verso/mockVersoRobot'
import type {
  VersoCommandAction,
  VersoConnectionState,
  VersoEvent,
  VersoPath,
  VersoSetModeAction,
  VersoStatus,
  VersoWaypoint,
} from '../lib/verso/types'
import { registerVersoCommandBridge } from '../lib/verso/versoCommandBridge'

export type MockVersoRobotRouteResult = {
  connectionState: VersoConnectionState
  lastStatus: VersoStatus | null
  lastPath: VersoPath | null
  lastEvent: VersoEvent | null
  robotSyncActive: boolean
  liveStatusRef: RefObject<VersoStatus | null>
}

export function useMockVersoRobotRoute(enabled: boolean): MockVersoRobotRouteResult {
  const [connectionState, setConnectionState] = useState<VersoConnectionState>('disconnected')
  const [lastStatus, setLastStatus] = useState<VersoStatus | null>(null)
  const [lastPath, setLastPath] = useState<VersoPath | null>(null)
  const [lastEvent, setLastEvent] = useState<VersoEvent | null>(null)
  const liveStatusRef = useRef<VersoStatus | null>(null)
  const robotStateRef = useRef<MockVersoRobotState>(
    createMockVersoRobotState([ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]),
  )
  const frameRef = useRef<number | null>(null)
  const tickRef = useRef<(now: number) => void>(() => {})

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const resumeFrame = useCallback(() => {
    if (frameRef.current === null && enabled && connectionState === 'connected') {
      frameRef.current = requestAnimationFrame((t) => tickRef.current(t))
    }
  }, [connectionState, enabled])

  const tick = useCallback((now: number) => {
    const state = robotStateRef.current
    const result = tickMockVersoRobot(state, now, {
      statusIntervalMs: ROBOT_MOCK_UI_STATUS_INTERVAL_MS,
    })

    if (result.event) {
      setLastEvent(result.event)
    }
    if (result.path) {
      setLastPath(result.path)
    }
    if (result.status) {
      liveStatusRef.current = result.status
      setLastStatus(result.status)
    }

    if (result.shouldContinue) {
      frameRef.current = requestAnimationFrame((t) => tickRef.current(t))
    } else {
      frameRef.current = null
    }
  }, [])

  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  useEffect(() => {
    return subscribeNavigationSync((sync) => {
      robotStateRef.current.mobilityHold = sync.mobilityHold
      if (sync.mobilityHold) {
        robotStateRef.current.paused = true
      }
    })
  }, [])

  useEffect(() => {
    return subscribeMobilityHold((held) => {
      robotStateRef.current.mobilityHold = held
      if (held) {
        robotStateRef.current.paused = true
      }
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      stopFrame()
      robotStateRef.current = createMockVersoRobotState([ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]])
      liveStatusRef.current = null
      setConnectionState('disconnected')
      setLastStatus(null)
      setLastPath(null)
      setLastEvent(null)
      registerVersoCommandBridge('disconnected', false, null, null, null)
      return
    }

    const initStatus = initialMockStatus([ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]])
    robotStateRef.current = createMockVersoRobotState([ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]])
    liveStatusRef.current = initStatus
    setLastStatus(initStatus)
    setLastPath(null)
    setLastEvent(null)
    setConnectionState('connected')
    frameRef.current = requestAnimationFrame((t) => tickRef.current(t))

    const onCommand = (action: VersoCommandAction) => {
      applyMockCommand(robotStateRef.current, action)
      resumeFrame()
      return true
    }

    const onSetMode = (mode: VersoSetModeAction) => {
      applyMockSetMode(robotStateRef.current, mode)
      resumeFrame()
      return true
    }

    const onWaypoints = (waypoints: VersoWaypoint[]) => {
      const path = applyMockWaypoints(robotStateRef.current, waypoints)
      if (path) {
        setLastPath(path)
      }
      resumeFrame()
      return path != null
    }

    registerVersoCommandBridge('connected', true, onCommand, onSetMode, onWaypoints)

    return () => {
      stopFrame()
      registerVersoCommandBridge('disconnected', false, null, null, null)
    }
  }, [enabled, resumeFrame, stopFrame])

  return useMemo(
    () => ({
      connectionState,
      lastStatus,
      lastPath,
      lastEvent,
      robotSyncActive: connectionState === 'connected' && lastStatus !== null,
      liveStatusRef,
    }),
    [connectionState, lastEvent, lastPath, lastStatus],
  )
}
