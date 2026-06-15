import { CatmullRomCurve3, Vector3 } from 'three'
import type { Point2 } from '../data/floorPlan'
import {
  NAV_PATH_DISPLAY_SAMPLE_STEP_M,
  NAV_PATH_SMOOTH_MIN_POINT_SPACING_M,
  NAV_SEGMENT_SAMPLE_STEP_M,
} from '../config/constants'
import { isSegmentWalkableWorld, simplifyPathCollinear } from './gridPathfinding'
import type { WalkabilityContext } from './walkability'

export type SmoothPathOptions = {
  sampleStepM?: number
  minControlSpacingM?: number
  ctx?: WalkabilityContext
}

export type RoutePathDisplayMode = 'curved' | 'straight'

function mergeClosePoints(points: Point2[], minSpacingM: number): Point2[] {
  if (points.length <= 2) return points.slice()
  const out: Point2[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1]
    const p = points[i]
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= minSpacingM) {
      out.push(p)
    }
  }
  const last = points[points.length - 1]
  const prev = out[out.length - 1]
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) >= 1e-6) {
    out.push(last)
  } else if (out.length > 0) {
    out[out.length - 1] = last
  }
  return out
}

function sampleCatmullRom(path: Point2[], sampleStepM: number): Point2[] {
  if (path.length <= 2) return path.slice()

  const vectors = path.map(([x, z]) => new Vector3(x, 0, z))
  const curve = new CatmullRomCurve3(vectors, false, 'centripetal', 0.5)
  const length = curve.getLength()
  if (length <= sampleStepM) return path.slice()

  const samples = Math.max(2, Math.ceil(length / sampleStepM) + 1)
  const out: Point2[] = []
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const p = curve.getPointAt(t)
    out.push([p.x, p.z])
  }
  return out
}

function isPathWalkable(path: Point2[], ctx: WalkabilityContext): boolean {
  for (let i = 1; i < path.length; i++) {
    if (!isSegmentWalkableWorld(path[i - 1], path[i], ctx, NAV_SEGMENT_SAMPLE_STEP_M)) {
      return false
    }
  }
  return true
}

function finalizeSmoothed(path: Point2[], smoothed: Point2[]): Point2[] {
  if (smoothed.length === 0) return smoothed
  const out = smoothed.slice()
  out[0] = [path[0][0], path[0][1]]
  out[out.length - 1] = [path[path.length - 1][0], path[path.length - 1][1]]
  return out
}

function shortcutPathForDisplay(path: Point2[], ctx?: WalkabilityContext): Point2[] {
  if (path.length <= 2) return path.slice()

  const points = simplifyPathCollinear(path)
  if (!ctx || points.length <= 2) return points.slice()

  const out: Point2[] = [points[0]]
  let i = 0
  while (i < points.length - 1) {
    let bestJ = i + 1
    for (let j = points.length - 1; j > i + 1; j--) {
      if (isSegmentWalkableWorld(points[i], points[j], ctx, NAV_SEGMENT_SAMPLE_STEP_M)) {
        bestJ = j
        break
      }
    }
    out.push(points[bestJ])
    i = bestJ
  }
  return out
}

/** 폴리라인을 Catmull-Rom 곡선으로 리샘플링. 표시 및 이동 경로 생성에 사용. */
export function smoothPathForDisplay(
  path: Point2[],
  options?: SmoothPathOptions,
): Point2[] {
  if (path.length <= 2) return path.slice()

  const sampleStepM = options?.sampleStepM ?? NAV_PATH_DISPLAY_SAMPLE_STEP_M
  const minControlSpacingM = options?.minControlSpacingM ?? NAV_PATH_SMOOTH_MIN_POINT_SPACING_M
  const ctx = options?.ctx

  const simplified = simplifyPathCollinear(path)
  const controls = mergeClosePoints(simplified, minControlSpacingM)

  const attempts: Array<{ controls: Point2[]; sampleStepM: number }> = [
    { controls, sampleStepM },
    { controls, sampleStepM: sampleStepM * 0.75 },
    { controls: mergeClosePoints(controls, minControlSpacingM * 1.5), sampleStepM },
    { controls: simplifyPathCollinear(path), sampleStepM: sampleStepM * 1.5 },
  ]

  for (const attempt of attempts) {
    if (attempt.controls.length <= 2) {
      const result = attempt.controls.slice()
      if (!ctx || isPathWalkable(result, ctx)) return result
      continue
    }
    const smoothed = finalizeSmoothed(path, sampleCatmullRom(attempt.controls, attempt.sampleStepM))
    if (!ctx || isPathWalkable(smoothed, ctx)) return smoothed
  }

  return simplifyPathCollinear(path)
}

export function getPathForDisplay(
  path: Point2[],
  mode: RoutePathDisplayMode,
  options?: SmoothPathOptions,
): Point2[] {
  return mode === 'straight'
    ? shortcutPathForDisplay(path, options?.ctx)
    : smoothPathForDisplay(path, options)
}
