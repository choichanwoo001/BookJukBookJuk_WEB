import type { Point2 } from '../../data/floorPlan'
import { worldXzToMinimapUv } from '../../utils/minimapBounds'
import type { DemoScenarioRoute, DemoScenarioStop } from '../../utils/demoScenarioRoute'

function pathToPolyline(points: Point2[]): string {
  if (points.length < 2) return ''
  return points
    .map(([x, z]) => {
      const { u, v } = worldXzToMinimapUv(x, z)
      return `${u},${v}`
    })
    .join(' ')
}

export type ScenarioRouteSvgProps = {
  route: DemoScenarioRoute
  highlightPoolIndices?: number[]
}

function stopColor(stop: DemoScenarioStop, highlightPoolIndices?: number[]): string {
  if (stop.kind === 'spawn') return '#ffe566'
  if (stop.kind === 'checkout') return '#ff8fab'
  if (stop.poolIndex != null && highlightPoolIndices?.includes(stop.poolIndex)) {
    return '#7ee8a0'
  }
  return '#9ecbff'
}

export function ScenarioRouteSvg({ route, highlightPoolIndices }: ScenarioRouteSvgProps) {
  const { stops, segments } = route

  return (
    <svg
      className="scenarioRouteSvg"
      viewBox="0 0 1 1"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {segments.map((seg) => (
        <polyline
          key={`${seg.fromOrder}-${seg.toOrder}`}
          fill="none"
          stroke={seg.connected ? seg.color : '#ff6b6b'}
          strokeWidth={seg.connected ? 0.006 : 0.007}
          strokeDasharray={seg.connected ? undefined : '0.012 0.008'}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={seg.connected ? 0.92 : 0.75}
          points={pathToPolyline(seg.path)}
        />
      ))}
      {stops.map((stop) => {
        const { u, v } = worldXzToMinimapUv(stop.goal[0], stop.goal[1])
        const fill = stopColor(stop, highlightPoolIndices)
        return (
          <g key={stop.id} transform={`translate(${u},${v})`}>
            <circle
              r={0.018}
              fill={fill}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={0.004}
            />
            <text
              y={0.006}
              textAnchor="middle"
              fontSize={0.022}
              fontWeight="700"
              fill="#0a0a0a"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={0.003}
              paintOrder="stroke"
            >
              {stop.order}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
