import {
  MAP_IMAGE_HEIGHT_PX,
  MAP_IMAGE_ORIGIN_X,
  MAP_IMAGE_ORIGIN_Z,
  MAP_IMAGE_WIDTH_PX,
  MAP_RESOLUTION,
  mapImageOffsetX,
  mapImageOffsetZ,
} from '../data/mapData'

/** 월드 XZ와 미니맵 PNG/오버레이 공통 범위 (exportFloorMap2d와 동일). */
export function getMinimapWorldBounds() {
  const sx = (MAP_IMAGE_WIDTH_PX - 1) * MAP_RESOLUTION
  const sz = (MAP_IMAGE_HEIGHT_PX - 1) * MAP_RESOLUTION
  const cx = MAP_IMAGE_ORIGIN_X + sx * 0.5 - mapImageOffsetX
  const cz = MAP_IMAGE_ORIGIN_Z + sz * 0.5 - mapImageOffsetZ
  const minX = cx - sx / 2
  const maxX = cx + sx / 2
  const minZ = cz - sz / 2
  const maxZ = cz + sz / 2
  return { minX, maxX, minZ, maxZ, spanX: maxX - minX, spanZ: maxZ - minZ }
}

/**
 * Three.js overview(위에서 내려다본) 화면과 맞추기: u는 +X 오른쪽, v는 +Z가 위로(이미지 위쪽).
 * PNG 상단 = maxZ, 하단 = minZ.
 */
export function worldXzToMinimapUv(x: number, z: number): { u: number; v: number } {
  const { minX, maxZ, spanX, spanZ } = getMinimapWorldBounds()
  const u = (x - minX) / spanX
  const v = (maxZ - z) / spanZ
  return { u, v }
}
