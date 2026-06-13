import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { subscribeMapCommand } from '../agent/runtime/agentEventBus'
import {
  NAV_ARRIVAL_RADIUS_M,
  SCENARIO_PLAYBACK_SPEED_MPS,
  SCENARIO_STOP_DWELL_S,
} from '../config/constants'
import { ENTRANCE_SPAWN, type Point2 } from '../data/floorPlan'
import { buildDemoScenarioRoute, type DemoScenarioRoute } from '../utils/demoScenarioRoute'
import {
  buildRouteMasterPath,
  pathLengthM,
  samplePathAtDistance,
} from '../utils/pathSampling'

export type ScenarioRoutePlaybackState = {
  playing: boolean
  route: DemoScenarioRoute | null
  activeStopIndex: number
  position: Point2 | null
  headingRad: number
  stopPlayback: () => void
}

function stopIndexForDistance(route: DemoScenarioRoute, distanceM: number): number {
  let acc = 0
  for (let i = 0; i < route.segments.length; i++) {
    acc += route.segments[i].distanceM
    if (distanceM <= acc + NAV_ARRIVAL_RADIUS_M) {
      return i + 1
    }
  }
  return route.stops.length - 1
}

export function useScenarioRoutePlayback({
  playerWorldXzRef,
  enabled,
  onSample,
}: {
  playerWorldXzRef: RefObject<Point2 | null>
  enabled: boolean
  onSample?: (pos: Point2, headingRad: number) => void
}): ScenarioRoutePlaybackState {
  const [playing, setPlaying] = useState(false)
  const [route, setRoute] = useState<DemoScenarioRoute | null>(null)
  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const [position, setPosition] = useState<Point2 | null>(null)
  const [headingRad, setHeadingRad] = useState(0)

  const masterPathRef = useRef<Point2[]>([])
  const totalLengthRef = useRef(0)
  const distanceRef = useRef(0)
  const dwellRemainingRef = useRef(0)
  const lastStopIndexRef = useRef(0)
  const onSampleRef = useRef(onSample)
  const lastSampleAtRef = useRef(0)
  const pendingPreviewRef = useRef(false)

  useEffect(() => {
    onSampleRef.current = onSample
  }, [onSample])

  const syncPreviewPosition = useCallback((pos: Point2) => {
    if (playerWorldXzRef.current) {
      playerWorldXzRef.current[0] = pos[0]
      playerWorldXzRef.current[1] = pos[1]
    } else {
      playerWorldXzRef.current = [pos[0], pos[1]]
    }
  }, [playerWorldXzRef])

  const stopPlayback = useCallback(() => {
    setPlaying(false)
    setRoute(null)
    setPosition(null)
    setActiveStopIndex(0)
    masterPathRef.current = []
    distanceRef.current = 0
    dwellRemainingRef.current = 0
  }, [])

  const startPlayback = useCallback((nextRoute: DemoScenarioRoute) => {
    const master = buildRouteMasterPath(nextRoute)
    masterPathRef.current = master
    totalLengthRef.current = pathLengthM(master)
    distanceRef.current = 0
    dwellRemainingRef.current = 0
    lastStopIndexRef.current = 0

    const spawn: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
    syncPreviewPosition(spawn)

    setRoute(nextRoute)
    setActiveStopIndex(0)
    setPosition(spawn)
    setHeadingRad(0)
    setPlaying(true)
  }, [syncPreviewPosition])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'START_NAVIGATION') {
        stopPlayback()
        return
      }
      if (command.type === 'PAUSE_MOBILITY') {
        stopPlayback()
        return
      }
      if (command.type !== 'PREVIEW_ROUTE') return
      pendingPreviewRef.current = true
      if (!enabled) return
      pendingPreviewRef.current = false
      requestAnimationFrame(() => {
        startPlayback(buildDemoScenarioRoute())
      })
    })
  }, [enabled, startPlayback, stopPlayback])

  useEffect(() => {
    if (!enabled || playing || route || !pendingPreviewRef.current) return
    pendingPreviewRef.current = false
    const frame = requestAnimationFrame(() => {
      startPlayback(buildDemoScenarioRoute())
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled, playing, route, startPlayback])

  useFrame((_, delta) => {
    if (!playing || !enabled || masterPathRef.current.length < 2) return

    const master = masterPathRef.current
    const total = totalLengthRef.current

    if (dwellRemainingRef.current > 0) {
      dwellRemainingRef.current -= delta
      return
    }

    distanceRef.current = Math.min(total, distanceRef.current + SCENARIO_PLAYBACK_SPEED_MPS * delta)
    const sample = samplePathAtDistance(master, distanceRef.current)
    if (!sample) return

    const pos: Point2 = [sample.point[0], sample.point[1]]
    syncPreviewPosition(pos)

    setPosition(pos)
    setHeadingRad(sample.headingRad)

    const now = performance.now()
    if (now - lastSampleAtRef.current > 50) {
      lastSampleAtRef.current = now
      onSampleRef.current?.(pos, sample.headingRad)
    }

    if (route) {
      const stopIdx = stopIndexForDistance(route, distanceRef.current)
      if (stopIdx !== lastStopIndexRef.current) {
        lastStopIndexRef.current = stopIdx
        setActiveStopIndex(stopIdx)
        dwellRemainingRef.current = SCENARIO_STOP_DWELL_S
      }
    }

    if (distanceRef.current >= total - 1e-4) {
      setPlaying(false)
    }
  })

  return {
    playing,
    route,
    activeStopIndex,
    position,
    headingRad,
    stopPlayback,
  }
}
