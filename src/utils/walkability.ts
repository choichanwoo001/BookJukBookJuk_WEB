import type { WallRect } from '../data/mapData'
import { pointInAnyRect } from './rectUtils'

export type WalkabilityContext = {
  floorRects: WallRect[]
  wallRects: WallRect[]
  bookshelfRects: WallRect[]
  pillarRects: WallRect[]
  playerRadiusM: number
}

export function isWalkablePoint(ctx: WalkabilityContext, x: number, z: number): boolean {
  const r = ctx.playerRadiusM
  if (!pointInAnyRect(ctx.floorRects, x, z)) return false
  if (pointInAnyRect(ctx.wallRects, x, z, r)) return false
  if (pointInAnyRect(ctx.bookshelfRects, x, z, r)) return false
  if (pointInAnyRect(ctx.pillarRects, x, z, r)) return false
  return true
}
