import type { WallRect } from '../data/mapData'
import { pointInAnyRect } from './rectUtils'
import { pointInAnyPolygon } from './polygonCollision'

export type WalkabilityContext = {
  floorRects: WallRect[]
  wallRects: WallRect[]
  bookshelfRects: WallRect[]
  bookshelfPolygons?: Array<Array<[number, number]>>
  pillarRects: WallRect[]
  playerRadiusM: number
}

export function isWalkablePoint(ctx: WalkabilityContext, x: number, z: number): boolean {
  const r = ctx.playerRadiusM
  if (!pointInAnyRect(ctx.floorRects, x, z)) return false
  if (pointInAnyRect(ctx.wallRects, x, z, r)) return false
  if (pointInAnyRect(ctx.bookshelfRects, x, z, r)) return false
  if (ctx.bookshelfPolygons && pointInAnyPolygon(ctx.bookshelfPolygons, x, z, r)) return false
  if (pointInAnyRect(ctx.pillarRects, x, z, r)) return false
  return true
}
