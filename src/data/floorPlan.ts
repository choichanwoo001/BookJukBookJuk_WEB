import {
  wallRects,
  floorRects,
  mapWidth,
  mapDepth,
  MAP_RESOLUTION,
} from './mapData'
import type { WallRect } from './mapData'

export type Point2 = [number, number]

export const FLOOR_HEIGHT_M = 3
export const WALL_THICKNESS_M = 0.16
export const PLAYER_RADIUS_M = 0.24

export { wallRects, floorRects, mapWidth, mapDepth, MAP_RESOLUTION }
export type { WallRect }

export function computeFloorCenter(): Point2 {
  if (floorRects.length === 0) return [0, 0]
  let sx = 0, sz = 0, totalArea = 0
  for (const r of floorRects) {
    const area = r.w * r.d
    sx += r.cx * area
    sz += r.cz * area
    totalArea += area
  }
  return [sx / totalArea, sz / totalArea]
}

export function isOnFloor(x: number, z: number): boolean {
  return floorRects.some(r =>
    x >= r.cx - r.w / 2 && x <= r.cx + r.w / 2 &&
    z >= r.cz - r.d / 2 && z <= r.cz + r.d / 2
  )
}

export const SPAWN_POINT_WORLD: Point2 = computeFloorCenter()
