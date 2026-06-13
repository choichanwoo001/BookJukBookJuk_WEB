import { Line } from '@react-three/drei'

import { useMemo } from 'react'

import type { Point2 } from '../../data/floorPlan'

import {

  NAV_LINE_COLOR_BRIGHT,

  NAV_LINE_COLOR_DIM,

  NAV_LINE_OPACITY_BRIGHT,

  NAV_LINE_OPACITY_DIM,

  NAV_LINE_WIDTH_PX,

  NAV_ROUTE_Y,

} from '../../config/constants'

import type { DemoScenarioRoute } from '../../utils/demoScenarioRoute'

import { getPathForDisplay, type RoutePathDisplayMode } from '../../utils/pathSmoothing'

import type { WalkabilityContext } from '../../utils/walkability'



function toLinePoints(path: Point2[], y: number): [number, number, number][] {

  return path.map(([x, z]) => [x, y, z])

}



const PREVIEW_DIM_OPACITY_BOOST = 0.18

const PREVIEW_BRIGHT_OPACITY_BOOST = 0.05

const PREVIEW_LINE_WIDTH_BOOST = 1



export function ScenarioRouteSegmentsMesh({

  route,

  walkabilityCtx,

  pathDisplayMode = 'curved',

}: {

  route: DemoScenarioRoute

  walkabilityCtx?: WalkabilityContext

  pathDisplayMode?: RoutePathDisplayMode

}) {

  const smoothOpts = useMemo(

    () => (walkabilityCtx ? { ctx: walkabilityCtx } : undefined),

    [walkabilityCtx],

  )

  const segments = useMemo(

    () =>

      route.segments.map((seg) => ({

        key: `${seg.fromOrder}-${seg.toOrder}`,

        connected: seg.connected,

        displayPath: getPathForDisplay(seg.path, pathDisplayMode, smoothOpts),

      })),

    [pathDisplayMode, route.segments, smoothOpts],

  )



  const dimOpacity = Math.min(1, NAV_LINE_OPACITY_DIM + PREVIEW_DIM_OPACITY_BOOST)

  const hiOpacity = Math.min(1, NAV_LINE_OPACITY_BRIGHT + PREVIEW_BRIGHT_OPACITY_BOOST)

  const dimLineWidth = NAV_LINE_WIDTH_PX + PREVIEW_LINE_WIDTH_BOOST

  const hiLineWidth = NAV_LINE_WIDTH_PX + 1 + PREVIEW_LINE_WIDTH_BOOST



  return (

    <group userData={{ excludeCameraCollision: true }}>

      {segments.map((seg) => {

        const dimPts = toLinePoints(seg.displayPath, NAV_ROUTE_Y)

        const hiPts = toLinePoints(seg.displayPath, NAV_ROUTE_Y + 0.002)

        if (dimPts.length < 2) return null

        const connected = seg.connected

        return (

          <group key={seg.key}>

            <Line

              points={dimPts}

              color={NAV_LINE_COLOR_DIM}

              lineWidth={dimLineWidth}

              transparent

              opacity={connected ? dimOpacity : dimOpacity * 0.55}

              depthWrite={false}

              renderOrder={1}

            />

            <Line

              points={hiPts}

              color={NAV_LINE_COLOR_BRIGHT}

              lineWidth={connected ? hiLineWidth : hiLineWidth - 1}

              transparent

              opacity={connected ? hiOpacity : hiOpacity * 0.5}

              depthWrite={false}

              renderOrder={2}

            />

          </group>

        )

      })}

    </group>

  )

}

