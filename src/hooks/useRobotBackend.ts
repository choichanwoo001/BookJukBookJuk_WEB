import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { subscribeMobilityHold, subscribeNavigationSync } from '../agent/runtime/agentEventBus'
import { MockRobotBackend } from '../lib/verso/MockRobotBackend'
import { RosbridgeBackend } from '../lib/verso/RosbridgeBackend'
import { registerVersoCommandBridge } from '../lib/verso/versoCommandBridge'
import type {
  VersoCommandAction,
  VersoConnectionState,
  VersoEvent,
  VersoPath,
  VersoSetModeAction,
  VersoStatus,
  VersoWaypoint,
} from '../lib/verso/types'
import { ENTRANCE_SPAWN } from '../data/floorPlan'
import {
  recordUiIncomingEvent,
  recordUiIncomingPath,
  recordUiIncomingStatus,
  recordUiOutgoingCommand,
  recordUiOutgoingWaypoints,
} from '../lib/verso/rosbridgeUiLogStore'

export type UseRobotBackendResult = {
  connectionState: VersoConnectionState
  lastStatus: VersoStatus | null
  lastPath: VersoPath | null
  lastEvent: VersoEvent | null
  /** True when a backend is connected and has received at least one status update. */
  robotSyncActive: boolean
  liveStatusRef: RefObject<VersoStatus | null>
  publishCommand: (action: VersoCommandAction) => boolean
  publishSetMode: (mode: VersoSetModeAction) => boolean
  publishWaypoints: (waypoints: VersoWaypoint[]) => boolean
  /** Only meaningful for the rosbridge backend — reconnects using the last URL. */
  reconnect: () => void
}

/**
 * Unified robot backend hook.
 *
 * - activeUrl provided  → RosbridgeBackend (real robot over WebSocket)
 * - activeUrl null/empty → MockRobotBackend (in-browser simulation)
 *
 * Both backends emit onStatus / onPath / onEvent in identical formats so all
 * downstream consumers (Map3DView, useNavigationMovement, TTS pipeline) are
 * backend-agnostic. versoCommandBridge is registered here so the same
 * tryPublishVerso* functions work regardless of which backend is active.
 */
export function useRobotBackend(activeUrl: string | null): UseRobotBackendResult {
  const [connectionState, setConnectionState] = useState<VersoConnectionState>('disconnected')
  const [lastStatus, setLastStatus] = useState<VersoStatus | null>(null)
  const [lastPath, setLastPath] = useState<VersoPath | null>(null)
  const [lastEvent, setLastEvent] = useState<VersoEvent | null>(null)
  const liveStatusRef = useRef<VersoStatus | null>(null)

  const backendRef = useRef<RosbridgeBackend | MockRobotBackend | null>(null)

  const handleConnectionState = useCallback((state: VersoConnectionState) => {
    setConnectionState(state)
    if (state === 'disconnected') {
      liveStatusRef.current = null
      setLastStatus(null)
      setLastPath(null)
      setLastEvent(null)
    }
  }, [])

  const handleStatus = useCallback((status: VersoStatus) => {
    liveStatusRef.current = status
    setLastStatus(status)
    recordUiIncomingStatus(status)
  }, [])

  const handlePath = useCallback((path: VersoPath) => {
    setLastPath(path)
    recordUiIncomingPath(path)
  }, [])

  const handleEvent = useCallback((event: VersoEvent) => {
    setLastEvent(event)
    recordUiIncomingEvent(event)
  }, [])

  // Stable publish callbacks that forward to whichever backend is currently active.
  const publishCommand = useCallback((action: VersoCommandAction): boolean => {
    const ok = backendRef.current?.publishCommand(action) ?? false
    if (ok) recordUiOutgoingCommand(action)
    return ok
  }, [])

  const publishSetMode = useCallback((mode: VersoSetModeAction): boolean => {
    const ok = backendRef.current?.publishSetMode(mode) ?? false
    if (ok) recordUiOutgoingCommand(mode)
    return ok
  }, [])

  const publishWaypoints = useCallback((waypoints: VersoWaypoint[]): boolean => {
    setLastPath(null)
    const ok = backendRef.current?.publishWaypoints(waypoints) ?? false
    if (ok) recordUiOutgoingWaypoints(waypoints)
    return ok
  }, [])

  const reconnect = useCallback((): void => {
    const backend = backendRef.current
    if (backend instanceof RosbridgeBackend) backend.reconnect()
  }, [])

  // Create or replace backend when activeUrl changes.
  useEffect(() => {
    const trimmed = activeUrl?.trim() ?? ''

    // Tear down whatever was running before.
    backendRef.current?.destroy()
    backendRef.current = null

    if (trimmed) {
      const backend = new RosbridgeBackend()
      backend.setHandlers({
        onConnectionState: handleConnectionState,
        onStatus: handleStatus,
        onPath: handlePath,
        onEvent: handleEvent,
      })
      backend.start(trimmed)
      backendRef.current = backend
    } else {
      const backend = new MockRobotBackend([ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]])
      backend.setHandlers({
        onConnectionState: handleConnectionState,
        onStatus: handleStatus,
        onPath: handlePath,
        onEvent: handleEvent,
      })
      backend.start()
      backendRef.current = backend
    }

    return () => {
      backendRef.current?.destroy()
      backendRef.current = null
    }
  // handleConnectionState / handleStatus are stable useCallback refs — safe to list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl])

  // Forward mobilityHold to MockRobotBackend so TTS-pause / resume works.
  // (RosbridgeBackend handles it on the robot side; no browser-side hook needed.)
  useEffect(() => {
    return subscribeMobilityHold((held) => {
      const backend = backendRef.current
      if (backend instanceof MockRobotBackend) backend.setMobilityHold(held)
    })
  }, [])

  useEffect(() => {
    return subscribeNavigationSync((sync) => {
      const backend = backendRef.current
      if (backend instanceof MockRobotBackend) backend.setMobilityHold(sync.mobilityHold)
    })
  }, [])

  // Register with versoCommandBridge singleton so tryPublishVerso* functions
  // route to the active backend regardless of which one is running.
  useEffect(() => {
    const syncActive = connectionState === 'connected' && lastStatus !== null
    registerVersoCommandBridge(
      connectionState,
      syncActive,
      syncActive ? publishCommand : null,
      syncActive ? publishSetMode : null,
      syncActive ? publishWaypoints : null,
    )
    return () => registerVersoCommandBridge('disconnected', false, null, null, null)
  }, [connectionState, lastStatus, publishCommand, publishSetMode, publishWaypoints])

  const robotSyncActive = connectionState === 'connected' && lastStatus !== null

  return useMemo(
    () => ({
      connectionState,
      lastStatus,
      lastPath,
      lastEvent,
      robotSyncActive,
      liveStatusRef,
      publishCommand,
      publishSetMode,
      publishWaypoints,
      reconnect,
    }),
    [
      connectionState,
      lastStatus,
      lastPath,
      lastEvent,
      robotSyncActive,
      publishCommand,
      publishSetMode,
      publishWaypoints,
      reconnect,
    ],
  )
}
