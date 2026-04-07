/**
 * `public/map-floor-2d.png` 생성용 색 (scripts/exportFloorMap2d.ts).
 * 바닥은 3D 체감에 맞게 어둡게, 책장·후보는 미니맵에서 바닥과 구분되게 대비 있게 둠.
 */
export const MAP2D_PNG = {
  /** SceneContent `<color attach="background" />` */
  bg: '#1a1410',
  /** floorMaterial #B5885A 체감 보정 */
  floor: '#7B5C3D',
  /** 본편 책장: 바닥(#7B5C3D)과 확실히 구분되도록 한 단계 더 밝게 */
  bookshelf: '#D0784A',
  /** 후보 오버레이: 본편보다 더 밝은 살구색으로 구분 */
  bookshelfOverlay: '#EEB896',
} as const

export function hexToRgba(hex: string, alpha = 255) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha,
  }
}
