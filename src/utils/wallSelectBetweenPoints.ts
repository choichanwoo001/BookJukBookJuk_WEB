import { wallPolylines } from '../data/floorPlan'

export type WallSegmentRef = {
  loopIndex: number
  segmentIndex: number
  ax: number
  az: number
  bx: number
  bz: number
  length: number
  tangentYaw: number
  overlapM: number
}

const MIN_SPAN_M = 0.05
const MIN_OVERLAP_M = 0.08
const MIN_PARALLEL_DOT = 0.82
const DEFAULT_MAX_PERP_DIST_M = 0.55

/**
 * 두 바닥 클릭점을 잇는 구간과 평행·근접한 벽 세그먼트를 찾는다.
 * 복도를 따라 찍은 두 점 사이의 통로 벽(책장 뒤 파티션 등) 선택용.
 */
export function findWallSegmentsBetweenPoints(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  loops = wallPolylines,
  maxPerpDistM = DEFAULT_MAX_PERP_DIST_M,
): WallSegmentRef[] {
  const abx = bx - ax
  const abz = bz - az
  const abLen = Math.hypot(abx, abz)
  if (abLen < MIN_SPAN_M) return []

  const ux = abx / abLen
  const uz = abz / abLen
  const px = -uz
  const pz = ux

  const results: WallSegmentRef[] = []

  loops.forEach((loop, loopIndex) => {
    if (loop.length < 2) return
    for (let segmentIndex = 0; segmentIndex < loop.length; segmentIndex++) {
      const wa = loop[segmentIndex]
      const wb = loop[(segmentIndex + 1) % loop.length]
      const sdx = wb[0] - wa[0]
      const sdz = wb[1] - wa[1]
      const segLen = Math.hypot(sdx, sdz)
      if (segLen < MIN_SPAN_M) continue

      const parallelDot = Math.abs((sdx * ux + sdz * uz) / segLen)
      if (parallelDot < MIN_PARALLEL_DOT) continue

      const mx = (wa[0] + wb[0]) * 0.5
      const mz = (wa[1] + wb[1]) * 0.5
      const perpDist = Math.abs((mx - ax) * px + (mz - az) * pz)
      if (perpDist > maxPerpDistM) continue

      const tA = (wa[0] - ax) * ux + (wa[1] - az) * uz
      const tB = (wb[0] - ax) * ux + (wb[1] - az) * uz
      const segMin = Math.min(tA, tB)
      const segMax = Math.max(tA, tB)
      const overlapM = Math.min(segMax, abLen) - Math.max(segMin, 0)
      if (overlapM < MIN_OVERLAP_M) continue

      results.push({
        loopIndex,
        segmentIndex,
        ax: wa[0],
        az: wa[1],
        bx: wb[0],
        bz: wb[1],
        length: segLen,
        tangentYaw: Math.atan2(sdx, sdz),
        overlapM,
      })
    }
  })

  return results.sort((a, b) => b.overlapM - a.overlapM || b.length - a.length)
}

export function formatWallSegmentRef(seg: WallSegmentRef): string {
  return [
    'wall-segment',
    `loop=${seg.loopIndex}`,
    `seg=${seg.segmentIndex}`,
    `a=(${seg.ax.toFixed(3)}, ${seg.az.toFixed(3)})`,
    `b=(${seg.bx.toFixed(3)}, ${seg.bz.toFixed(3)})`,
    `length=${seg.length.toFixed(3)}`,
    `overlap=${seg.overlapM.toFixed(3)}`,
  ].join(' | ')
}
