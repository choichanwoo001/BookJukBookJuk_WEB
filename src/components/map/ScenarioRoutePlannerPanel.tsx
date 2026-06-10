import { useEffect, useMemo } from 'react'
import { dispatchPreviewRoute } from '../../agent/runtime/agentEventBus'
import { buildDemoScenarioRoute } from '../../utils/demoScenarioRoute'
import { ScenarioRouteSvg } from './ScenarioRouteSvg'

export type ScenarioRoutePlannerPanelProps = {
  open: boolean
  onClose: () => void
}

export function ScenarioRoutePlannerPanel({ open, onClose }: ScenarioRoutePlannerPanelProps) {
  const route = useMemo(() => (open ? buildDemoScenarioRoute() : null), [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !route) return null

  const disconnected = route.segments.filter((s) => !s.connected)

  const handlePreviewIn3d = () => {
    dispatchPreviewRoute(route.poolIndices)
    onClose()
  }

  return (
    <div className="scenarioRoutePlannerBackdrop" role="dialog" aria-modal aria-label="시나리오 경로">
      <div className="scenarioRoutePlannerPanel">
        <header className="scenarioRoutePlannerHeader">
          <div>
            <h2 className="scenarioRoutePlannerTitle">시나리오 경로</h2>
            <p className="scenarioRoutePlannerSubtitle">
              입구 → 4권 서가 → 계산대 · 맵 커버리지 약 {route.coveragePercent}%
            </p>
          </div>
          <div className="scenarioRoutePlannerActions">
            <button type="button" className="scenarioRoutePlannerPreviewBtn" onClick={handlePreviewIn3d}>
              3D에 미리보기
            </button>
            <button type="button" className="scenarioRoutePlannerCloseBtn" onClick={onClose} aria-label="닫기">
              닫기
            </button>
          </div>
        </header>

        <div className="scenarioRoutePlannerMap">
          <img className="scenarioRoutePlannerImage" src="/map-floor-2d.png" alt="" draggable={false} />
          <ScenarioRouteSvg route={route} highlightPoolIndices={route.poolIndices} />
        </div>

        <div className="scenarioRoutePlannerLegend">
          <section className="scenarioRouteLegendSection">
            <h3>목적지</h3>
            <ul className="scenarioRouteStopList">
              {route.stops.map((stop) => (
                <li key={stop.id}>
                  <span className="scenarioRouteStopOrder">{stop.order}</span>
                  <span className="scenarioRouteStopLabel">{stop.label}</span>
                  {stop.poolIndex != null && (
                    <span className="scenarioRouteStopMeta">pool #{stop.poolIndex}</span>
                  )}
                  {stop.shelfCx != null && stop.shelfCz != null && (
                    <span className="scenarioRouteStopMeta">
                      ({stop.shelfCx.toFixed(1)}, {stop.shelfCz.toFixed(1)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="scenarioRouteLegendSection">
            <h3>구간</h3>
            <ul className="scenarioRouteSegmentList">
              {route.segments.map((seg) => (
                <li key={`${seg.fromOrder}-${seg.toOrder}`}>
                  <span
                    className="scenarioRouteSegmentSwatch"
                    style={{ background: seg.connected ? seg.color : '#ff6b6b' }}
                    aria-hidden
                  />
                  <span>
                    {seg.fromLabel} → {seg.toLabel}
                  </span>
                  <span className="scenarioRouteStopMeta">{seg.distanceM.toFixed(1)}m</span>
                  {!seg.connected && <span className="scenarioRouteWarn">경로 끊김</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {disconnected.length > 0 && (
          <p className="scenarioRoutePlannerWarning">
            {disconnected.length}개 구간에서 보행 경로를 찾지 못했어요. poolIndex를 조정해 주세요.
          </p>
        )}
      </div>
    </div>
  )
}
