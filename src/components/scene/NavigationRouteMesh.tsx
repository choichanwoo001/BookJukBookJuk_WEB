import { Line } from '@react-three/drei'

import { useMemo } from 'react'

import { Color } from 'three'

import type { Point2 } from '../../data/floorPlan'

import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'

import {

  NAV_ARRIVAL_RADIUS_M,

  NAV_HIGHLIGHT_DISTANCE_BLEND_FAR_M,

  NAV_LINE_COLOR_BRIGHT,

  NAV_LINE_COLOR_DIM,

  NAV_LINE_COLOR_HIGHLIGHT_FAR,

  NAV_LINE_OPACITY_BRIGHT,

  NAV_LINE_OPACITY_DIM,

  NAV_LINE_OPACITY_HIGHLIGHT_FAR,

  NAV_LINE_WIDTH_PX,

  NAV_ROUTE_Y,

} from '../../config/constants'

import { getPathForDisplay, type RoutePathDisplayMode } from '../../utils/pathSmoothing'

import type { WalkabilityContext } from '../../utils/walkability'



function toLinePoints(path: Point2[], y: number): [number, number, number][] {

  return path.map(([x, z]) => [x, y, z])

}



function clamp01(t: number) {

  return Math.min(1, Math.max(0, t))

}



/** 목표에 가까울수록 밝은 톤·불투명, 멀수록 보조 톤(플랜: 이동 중 변하는 건 색·투명도만). */

function highlightColorOpacity(distanceM: number | null): { color: string; opacity: number } {

  if (distanceM == null) {

    return { color: NAV_LINE_COLOR_BRIGHT, opacity: NAV_LINE_OPACITY_BRIGHT }

  }

  const near = NAV_ARRIVAL_RADIUS_M

  const far = NAV_HIGHLIGHT_DISTANCE_BLEND_FAR_M

  const span = far - near

  const t = span <= 0 || distanceM <= near ? 0 : clamp01((distanceM - near) / span)

  const c = new Color(NAV_LINE_COLOR_BRIGHT).lerp(new Color(NAV_LINE_COLOR_HIGHLIGHT_FAR), t)

  const opacity =

    NAV_LINE_OPACITY_BRIGHT + (NAV_LINE_OPACITY_HIGHLIGHT_FAR - NAV_LINE_OPACITY_BRIGHT) * t

  return { color: `#${c.getHexString()}`, opacity }

}



const PREVIEW_DIM_OPACITY_BOOST = 0.18

const PREVIEW_BRIGHT_OPACITY_BOOST = 0.05

const PREVIEW_LINE_WIDTH_BOOST = 1



export function NavigationRouteMesh({

  route,

  variant = 'nav',

  walkabilityCtx,

  pathDisplayMode = 'curved',

}: {

  route: NavigationRouteVisual

  variant?: 'preview' | 'nav'

  walkabilityCtx?: WalkabilityContext

  pathDisplayMode?: RoutePathDisplayMode

}) {

  const { dimPath, highlightPath, highlightDistanceToGoalM } = route

  const smoothOpts = useMemo(

    () => (walkabilityCtx ? { ctx: walkabilityCtx } : undefined),

    [walkabilityCtx],

  )

  const displayDimPath = useMemo(

    () => getPathForDisplay(dimPath, pathDisplayMode, smoothOpts),

    [dimPath, pathDisplayMode, smoothOpts],

  )

  const displayHighlightPath = useMemo(

    () => getPathForDisplay(highlightPath, pathDisplayMode, smoothOpts),

    [highlightPath, pathDisplayMode, smoothOpts],

  )

  const dimPts = useMemo(

    () => toLinePoints(displayDimPath, NAV_ROUTE_Y),

    [displayDimPath],

  )

  const hiPts = useMemo(

    () => toLinePoints(displayHighlightPath, NAV_ROUTE_Y + 0.002),

    [displayHighlightPath],

  )

  const hiStyle = useMemo(

    () => highlightColorOpacity(highlightDistanceToGoalM),

    [highlightDistanceToGoalM],

  )

  const isPreview = variant === 'preview'

  const dimOpacity = isPreview

    ? Math.min(1, NAV_LINE_OPACITY_DIM + PREVIEW_DIM_OPACITY_BOOST)

    : NAV_LINE_OPACITY_DIM

  const hiOpacity = isPreview

    ? Math.min(1, hiStyle.opacity + PREVIEW_BRIGHT_OPACITY_BOOST)

    : hiStyle.opacity

  const dimLineWidth = NAV_LINE_WIDTH_PX + (isPreview ? PREVIEW_LINE_WIDTH_BOOST : 0)

  const hiLineWidth = NAV_LINE_WIDTH_PX + 1 + (isPreview ? PREVIEW_LINE_WIDTH_BOOST : 0)



  return (

    <group userData={{ excludeCameraCollision: true }}>

      {dimPts.length >= 2 && (

        <Line

          points={dimPts}

          color={NAV_LINE_COLOR_DIM}

          lineWidth={dimLineWidth}

          transparent

          opacity={dimOpacity}

          depthWrite={false}

          renderOrder={1}

        />

      )}

      {hiPts.length >= 2 && (

        <Line

          points={hiPts}

          color={hiStyle.color}

          lineWidth={hiLineWidth}

          transparent

          opacity={hiOpacity}

          depthWrite={false}

          renderOrder={2}

        />

      )}

    </group>

  )

}

