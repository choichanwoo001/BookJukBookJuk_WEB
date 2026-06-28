import { describe, expect, it } from 'vitest'
import {
  computeRelocateTranslation,
  componentCentroidApp,
  isPointInShelfAisleZone,
  shelfBackNormal,
  shelfOpenSignTowardCorridor,
  worldToShelfLocal,
  WALL,
  FREE,
  relocateInterAisleWallsBehindShelves,
} from './aisleWallRelocateCore.mjs'

const noopWalkable = () => true

const sampleLoops = [
  [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ],
]

describe('aisleWallRelocateCore', () => {
  it('shelfOpenSignTowardCorridor returns +1 or -1 consistently', () => {
    const loops = [[[ -5, -5], [5, -5], [5, 5], [-5, 5]]]
    const walkableNorth = (_x, z) => z > 0
    for (const sign of [
      shelfOpenSignTowardCorridor(0, 1, 0, loops, walkableNorth),
      shelfOpenSignTowardCorridor(0, -1, Math.PI, loops, walkableNorth),
      shelfOpenSignTowardCorridor(0, 1, Math.PI, loops, walkableNorth),
    ]) {
      expect(sign === 1 || sign === -1).toBe(true)
    }
  })

  it('places aisle zone on corridor-facing half-space', () => {
    const shelf = { cx: 0, cz: 0, w: 2, d: 0.6, yaw: 0, footprint: [[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]] }
    expect(isPointInShelfAisleZone(0, 0.2, shelf, 1)).toBe(true)
    expect(isPointInShelfAisleZone(0, -0.25, shelf, 1)).toBe(false)
  })

  it('computes back normal opposite to corridor normal', () => {
    const back = shelfBackNormal(0, 1)
    expect(back.nx).toBeCloseTo(0, 5)
    expect(back.nz).toBeCloseTo(-1, 5)
  })

  it('moves component centroid toward shelf back (void side)', () => {
    const shelf = { cx: 0, cz: 0, w: 2.4, d: 0.55, yaw: 0, footprint: [[-1.2, -0.28], [1.2, -0.28], [1.2, 0.28], [-1.2, 0.28]] }
    const component = {
      label: 1,
      size: 4,
      indices: [0, 1, 2, 3],
      minX: 10,
      maxX: 11,
      minY: 10,
      maxY: 11,
      bboxW: 2,
      bboxH: 2,
      fillRatio: 1,
      aspect: 1,
      touchesBoundary: false,
    }
    const width = 100
    const height = 100
    const offsetX = 0
    const offsetZ = 0
    const resolution = 0.05
    const originX = 0
    const originY = 0
    const imgHeight = height

    const { dx, dz } = computeRelocateTranslation(
      component,
      shelf,
      sampleLoops,
      noopWalkable,
      width,
      imgHeight,
      offsetX,
      offsetZ,
      resolution,
      originX,
      originY,
    )

    const before = componentCentroidApp(component, width, imgHeight, offsetX, offsetZ, resolution, originX, originY)
    const afterX = before.cx + dx
    const afterZ = before.cz + dz
    const localBefore = worldToShelfLocal(before.cx, before.cz, shelf)
    const localAfter = worldToShelfLocal(afterX, afterZ, shelf)

    expect(localAfter.lz).toBeLessThan(localBefore.lz)
  })

  it('relocateInterAisleWallsBehindShelves clears footprint and moves thin partition', () => {
    const width = 40
    const height = 40
    const grid = new Uint8Array(width * height).fill(FREE)
    const shelf = {
      cx: 0.5,
      cz: 0.5,
      w: 1,
      d: 0.4,
      yaw: 0,
      footprint: [[0, 0.3], [1, 0.3], [1, 0.7], [0, 0.7]],
    }

    for (let row = 25; row <= 27; row++) {
      for (let col = 10; col <= 30; col++) {
        grid[row * width + col] = WALL
      }
    }

    const wallComponents = [{
      label: 1,
      size: 63,
      indices: Array.from({ length: 63 }, (_, i) => {
        const col = 10 + (i % 21)
        const row = 25 + Math.floor(i / 21)
        return row * width + col
      }),
      minX: 10,
      maxX: 30,
      minY: 25,
      maxY: 27,
      bboxW: 21,
      bboxH: 3,
      fillRatio: 1,
      aspect: 7,
      touchesBoundary: false,
    }]

    const stats = relocateInterAisleWallsBehindShelves({
      grid,
      width,
      height,
      imgHeight: height,
      offsetX: 0,
      offsetZ: 0,
      resolution: 0.05,
      originX: 0,
      originY: 0,
      shelves: [shelf],
      wallLoops: [[[ -1, -1], [2, -1], [2, 2], [-1, 2]]],
      wallComponents,
    })

    expect(stats.footprintCleared).toBeGreaterThan(0)

    let footprintWallCount = 0
    for (let row = 25; row <= 27; row++) {
      for (let col = 10; col <= 30; col++) {
        if (grid[row * width + col] === WALL) footprintWallCount++
      }
    }
    expect(footprintWallCount).toBe(0)
  })

  it('does not relocate boundary-touching components', () => {
    const width = 10
    const height = 10
    const grid = new Uint8Array(width * height).fill(FREE)
    grid[0] = WALL
    grid[1] = WALL

    const stats = relocateInterAisleWallsBehindShelves({
      grid,
      width,
      height,
      imgHeight: height,
      offsetX: 0,
      offsetZ: 0,
      resolution: 0.05,
      originX: 0,
      originY: 0,
      shelves: [{ cx: 0.2, cz: 0.2, w: 0.5, d: 0.3, yaw: 0, footprint: [[0, 0.05], [0.4, 0.05], [0.4, 0.35], [0, 0.35]] }],
      wallLoops: sampleLoops,
      wallComponents: [{
        label: 1,
        size: 2,
        indices: [0, 1],
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 0,
        bboxW: 2,
        bboxH: 1,
        fillRatio: 1,
        aspect: 2,
        touchesBoundary: true,
      }],
    })

    expect(stats.relocatedComponents).toBe(0)
  })
})
