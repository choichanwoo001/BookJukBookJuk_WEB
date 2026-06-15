import type { WallRect } from '../data/mapData'
import {
  FLOOR_INCLUSION_PADDING_M,
  floorRenderRects,
  pillarRects as defaultPillarRects,
  PLAYER_RADIUS_M,
} from '../data/floorPlan'
import { createRectPointIndex, pointInAnyRect } from './rectUtils'

const renderFloorTest = createRectPointIndex(floorRenderRects)

export type WalkabilityContext = {
  floorRects: WallRect[]
  wallRects: WallRect[]
  bookshelfRects: WallRect[]
  pillarRects: WallRect[]
  playerRadiusM: number
}

export function isOnPolygonFloor(x: number, z: number): boolean {
  return renderFloorTest(x, z, FLOOR_INCLUSION_PADDING_M)
}

export function createNavWalkabilityContext(
  bookshelfRects: WallRect[],
  overrides?: Partial<Pick<WalkabilityContext, 'wallRects' | 'pillarRects' | 'playerRadiusM' | 'floorRects'>>,
): WalkabilityContext {
  return {
    floorRects: overrides?.floorRects ?? floorRenderRects,
    wallRects: overrides?.wallRects ?? [],
    bookshelfRects,
    pillarRects: overrides?.pillarRects ?? defaultPillarRects,
    playerRadiusM: overrides?.playerRadiusM ?? PLAYER_RADIUS_M,
  }
}

export function isWalkablePoint(ctx: WalkabilityContext, x: number, z: number): boolean {
  const r = ctx.playerRadiusM
  const isOnFloor = ctx.floorRects === floorRenderRects
    ? renderFloorTest(x, z, FLOOR_INCLUSION_PADDING_M)
    : pointInAnyRect(ctx.floorRects, x, z, FLOOR_INCLUSION_PADDING_M)
  if (!isOnFloor) return false
  if (pointInAnyRect(ctx.wallRects, x, z, r)) return false
  if (pointInAnyRect(ctx.bookshelfRects, x, z, r)) return false
  if (pointInAnyRect(ctx.pillarRects, x, z, r)) return false
  return true
}
