export const WALL: 1
export const FREE: 2
export const WALL_HALF_M: number
export const AISLE_CORRIDOR_MARGIN_M: number
export const AISLE_WIDTH_MARGIN_M: number

export type KeepoutShelf = {
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  footprint?: number[][]
}

export type WallComponent = {
  label: number
  size: number
  indices: number[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  bboxW: number
  bboxH: number
  fillRatio: number
  aspect: number
  touchesBoundary: boolean
}

export function shelfOpenSignTowardCorridor(
  cx: number,
  cz: number,
  yaw: number,
  loops: number[][][],
  isWalkable: (x: number, z: number) => boolean,
): 1 | -1

export function shelfBackNormal(yaw: number, openSign: 1 | -1): { nx: number; nz: number }

export function worldToShelfLocal(px: number, pz: number, shelf: KeepoutShelf): { lx: number; lz: number }

export function isPointInShelfAisleZone(
  px: number,
  pz: number,
  shelf: KeepoutShelf,
  openSign: 1 | -1,
): boolean

export function computeRelocateTranslation(
  component: WallComponent,
  shelf: KeepoutShelf,
  loops: number[][][],
  isWalkable: (x: number, z: number) => boolean,
  width: number,
  imgHeight: number,
  offsetX: number,
  offsetZ: number,
  resolution: number,
  originX: number,
  originY: number,
): { dx: number; dz: number; openSign: 1 | -1; backNx: number; backNz: number }

export function componentCentroidApp(
  component: WallComponent,
  width: number,
  imgHeight: number,
  offsetX: number,
  offsetZ: number,
  resolution: number,
  originX: number,
  originY: number,
): { cx: number; cz: number }

export function relocateInterAisleWallsBehindShelves(args: {
  grid: Uint8Array
  width: number
  height: number
  imgHeight: number
  offsetX: number
  offsetZ: number
  resolution: number
  originX: number
  originY: number
  shelves: KeepoutShelf[]
  wallLoops: number[][][]
  wallComponents: WallComponent[]
}): {
  footprintCleared: number
  relocatedComponents: number
  movedPixels: number
  corridorCleared: number
}

export function createGridWalkabilityChecker(
  grid: Uint8Array,
  width: number,
  height: number,
  imgHeight: number,
  offsetX: number,
  offsetZ: number,
  resolution: number,
  originX: number,
  originY: number,
): (appX: number, appZ: number) => boolean

export function isPointInAnyShelfAisleZone(
  px: number,
  pz: number,
  shelves: KeepoutShelf[],
  loops: number[][][],
  isWalkable: (x: number, z: number) => boolean,
): boolean
