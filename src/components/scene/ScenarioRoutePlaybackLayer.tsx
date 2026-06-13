import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { Point2 } from '../../data/floorPlan'
import {
  useScenarioRoutePlayback,
  type ScenarioRoutePlaybackState,
} from '../../hooks/useScenarioRoutePlayback'
import { ScenarioRoutePlaybackMarker } from './ScenarioRoutePlaybackMarker'
import { ScenarioRouteStopMarkers } from './ScenarioRouteStopMarkers'

export type ScenarioRoutePlaybackSnapshot = Pick<
  ScenarioRoutePlaybackState,
  'playing' | 'route' | 'activeStopIndex' | 'position' | 'headingRad' | 'stopPlayback'
>

export function ScenarioRoutePlaybackLayer({
  playerWorldXzRef,
  enabled,
  onStateChange,
  onSample,
}: {
  playerWorldXzRef: RefObject<Point2 | null>
  enabled: boolean
  onStateChange?: (state: ScenarioRoutePlaybackSnapshot) => void
  onSample?: (pos: Point2, headingRad: number) => void
}) {
  const playback = useScenarioRoutePlayback({
    playerWorldXzRef,
    enabled,
    onSample,
  })

  useEffect(() => {
    onStateChange?.({
      playing: playback.playing,
      route: playback.route,
      activeStopIndex: playback.activeStopIndex,
      position: playback.position,
      headingRad: playback.headingRad,
      stopPlayback: playback.stopPlayback,
    })
    // position/headingRad는 매 프레임 갱신 — onSample으로 미니맵만 별도 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 고빈도 position/heading 제외
  }, [
    playback.playing,
    playback.route,
    playback.activeStopIndex,
    playback.stopPlayback,
    onStateChange,
  ])

  if (!playback.route) return null

  return (
    <>
      <ScenarioRouteStopMarkers
        route={playback.route}
        activeStopIndex={playback.activeStopIndex}
      />
      {playback.playing && playback.position && (
        <ScenarioRoutePlaybackMarker position={playback.position} />
      )}
    </>
  )
}
