import type { FixtureRenderInstance } from '../types/scene'
import {
  alignBookshelfPairsFacingAcrossAisle,
  snapBookshelfCenterFlushToWall,
} from '../utils/wallAlignment'

/**
 * 맵 차이 레이어용 후보 책장. 깊이 d는 0.5로 통일.
 * - **누적**: 새 JSON은 아래에 **새 배열(복도/구역)** 을 추가하거나, 같은 복도면 해당 배열 안에만 push.
 * - 각 배열 단위로 벽 스냅 + (해당 구역) 마주보기 정렬을 적용해, 서로 먼 구역 책장이 섞이지 않게 함.
 */
const RAW_AISLES: Omit<FixtureRenderInstance, 'kind'>[][] = [
  [
    { cx: -14.637, cz: 9.157, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -13.759, cz: 11.672, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -12.623, cz: 11.214, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -13.524, cz: 8.724, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
  ],
]

const aligned: Omit<FixtureRenderInstance, 'kind'>[] = RAW_AISLES.flatMap((aisle) => {
  const snapped = aisle.map((r) => {
    const s = snapBookshelfCenterFlushToWall(r.cx, r.cz, r.yaw, r.d)
    return { ...r, cx: s.cx, cz: s.cz, yaw: s.yaw }
  })
  return alignBookshelfPairsFacingAcrossAisle(snapped)
})

export const bookshelfOverlayLayerInstances: FixtureRenderInstance[] = aligned.map((r) => ({
  kind: 'bookshelf',
  ...r,
}))
