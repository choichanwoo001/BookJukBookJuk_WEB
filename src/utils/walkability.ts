import type { WallRect } from '../data/mapData'
import {
  floorFillRects,
  pillarRects as defaultPillarRects,
  PLAYER_RADIUS_M,
  wallPolylines,
  wallRects as defaultWallRects,
} from '../data/floorPlan'
import { createFloorPointInclusionTest } from './floorPolygon'
import { pointInAnyRect } from './rectUtils'

/** 3D FloorPolygonMesh·미니맵 PNG와 동일한 바닥 영역 판정. */
const polygonFloorTest = createFloorPointInclusionTest(wallPolylines, floorFillRects)

export type WalkabilityContext = {
  /** 렌더/조명 등 다른 용도. 보행 판정에는 polygonFloorTest를 사용합니다. */
  floorRects: WallRect[]
  wallRects: WallRect[]
  bookshelfRects: WallRect[]
  pillarRects: WallRect[]
  playerRadiusM: number
}

export function isOnPolygonFloor(x: number, z: number): boolean {
  return polygonFloorTest(x, z)
}

export function createNavWalkabilityContext(
  bookshelfRects: WallRect[],
  overrides?: Partial<Pick<WalkabilityContext, 'wallRects' | 'pillarRects' | 'playerRadiusM' | 'floorRects'>>,
): WalkabilityContext {
  return {
    floorRects: overrides?.floorRects ?? [],
    wallRects: overrides?.wallRects ?? defaultWallRects,
    bookshelfRects,
    pillarRects: overrides?.pillarRects ?? defaultPillarRects,
    playerRadiusM: overrides?.playerRadiusM ?? PLAYER_RADIUS_M,
  }
}

export function isWalkablePoint(ctx: WalkabilityContext, x: number, z: number): boolean {
  const r = ctx.playerRadiusM
  if (!polygonFloorTest(x, z)) return false
  if (pointInAnyRect(ctx.wallRects, x, z, r)) return false
  if (pointInAnyRect(ctx.bookshelfRects, x, z, r)) return false
  if (pointInAnyRect(ctx.pillarRects, x, z, r)) return false
  return true
}
