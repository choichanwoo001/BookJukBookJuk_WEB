import { mapImageOffsetX, mapImageOffsetZ } from '../data/mapData'

export function robotMapToWorldXz(x: number, y: number): [number, number] {
  return [x - mapImageOffsetX, y - mapImageOffsetZ]
}

export function worldXzToRobotMap(x: number, z: number): { x: number; y: number } {
  return { x: x + mapImageOffsetX, y: z + mapImageOffsetZ }
}
