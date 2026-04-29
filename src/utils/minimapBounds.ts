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
 * processMap pxToWorld와 동일: 이미지 첫 행(화면 위) ≈ maxZ, 아래로 갈수록 Z 감소 → minZ.
 * u는 +X 오른쪽, v는 브라우저/SVG처럼 위가 0 (큰 Z).
 */
export function worldXzToMinimapUv(x: number, z: number): { u: number; v: number } {
  const { minX, maxZ, spanX, spanZ } = getMinimapWorldBounds()
  const u = (x - minX) / spanX
  const v = (maxZ - z) / spanZ
  return { u, v }
}
