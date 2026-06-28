import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { VersoRosbridgeClient } from '../lib/verso/VersoRosbridgeClient'
import { registerVersoCommandBridge } from '../lib/verso/versoCommandBridge'
import type { VersoCommandAction, VersoConnectionState, VersoEvent, VersoPath, VersoSetModeAction, VersoStatus, VersoWaypoint } from '../lib/verso/types'

export type UseVersoRosbridgeResult = {
  connectionState: VersoConnectionState
  lastStatus: VersoStatus | null
  lastPath: VersoPath | null
  lastEvent: VersoEvent | null
  robotSyncActive: boolean
  liveStatusRef: RefObject<VersoStatus | null>
  publishCommand: (action: VersoCommandAction) => boolean
  publishSetMode: (mode: VersoSetModeAction) => boolean
  publishWaypoints: (waypoints: VersoWaypoint[]) => boolean
  connect: (url: string) => void
  disconnect: () => void
  reconnect: () => void
}

export function useVersoRosbridge(activeUrl: string | null): UseVersoRosbridgeResult {
  const [connectionState, setConnectionState] = useState<VersoConnectionState>('disconnected')
  const [lastStatus, setLastStatus] = useState<VersoStatus | null>(null)
  const [lastPath, setLastPath] = useState<VersoPath | null>(null)
  const [lastEvent, setLastEvent] = useState<VersoEvent | null>(null)
  const liveStatusRef = useRef<VersoStatus | null>(null)

  const client = useMemo(() => new VersoRosbridgeClient(), [])
  const activeUrlRef = useRef<string | null>(null)

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
  }, [])

  useEffect(() => {
    client.setHandlers({
      onConnectionState: handleConnectionState,
      onStatus: handleStatus,
      onPath: setLastPath,
      onEvent: setLastEvent,
    })
  }, [client, handleConnectionState, handleStatus])

  const publishCommand = useCallback(
    (action: VersoCommandAction) => client.publishCommand(action),
    [client],
  )

  const publishSetMode = useCallback(
    (mode: VersoSetModeAction) => client.publishSetMode(mode),
    [client],
  )

  const publishWaypoints = useCallback(
    (waypoints: VersoWaypoint[]) => client.publishWaypoints(waypoints),
    [client],
  )

  const connect = useCallback(
    (url: string) => {
      activeUrlRef.current = url.trim() || null
      client.connect(url)
    },
    [client],
  )

  const disconnect = useCallback(() => {
    activeUrlRef.current = null
    client.disconnect()
  }, [client])

  const reconnect = useCallback(() => {
    const url = activeUrlRef.current
    if (url) client.reconnect()
  }, [client])

  useEffect(() => {
    const trimmed = activeUrl?.trim() ?? ''
    if (!trimmed) {
      activeUrlRef.current = null
      client.disconnect()
      return
    }
    activeUrlRef.current = trimmed
    client.connect(trimmed)
    return () => {
      client.disconnect()
    }
  }, [activeUrl, client])

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
      connect,
      disconnect,
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
      connect,
      disconnect,
      reconnect,
    ],
  )
}
