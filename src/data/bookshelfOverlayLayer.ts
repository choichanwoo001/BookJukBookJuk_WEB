import type { FixtureRenderInstance } from '../types/scene'
import {
  alignBookshelfPairsFacingAcrossAisle,
  microAlignShelfClusterBackEdgesFour,
  nearestWallInfo,
  snapBookshelfCenterFlushToWall,
} from '../utils/wallAlignment'

type ShelfRow = Omit<FixtureRenderInstance, 'kind'>

/**
 * 맵 차이 레이어용 후보 책장. 기본은 JSON의 cx, cz, yaw, w, d, h를 그대로 쓴다.
 * 복도 양쪽 마주보기 4개 구역만 `alignBookshelfPairsFacingAcrossAisle`로 접선 방향 미세 조정
 * (JSON이 같은 yaw만 주는 경우 한쪽 행에 yaw+π를 두어 두 그룹으로 나눔).
 * 일부 구역은 벽 폴리라인과의 거리가 가까울 때만 `snapBookshelfCenterFlushToWall`로 뒷면을 벽에 맞춘다.
 * 별도 구역은 입력 좌표와 무관하게 항상 벽 스냅(뒷면 접선)을 적용한다.
 * 2×2로 모인 네 책장 묶음은 `microAlignShelfClusterBackEdgesFour`로 뒷면이 같은 직선(행마다) 위에 오게 법선 방향만 미세 조정.
 *
 * - **누적**: 새 JSON은 아래에 **새 배열(복도/구역)** 을 추가하거나, 같은 복도면 해당 배열 안에만 push.
 */

/** 벽 세그먼트까지 이 거리 안이면 뒷면이 벽에 닿도록 스냅 (깊은 책장 d≈1.7 대비) */
const WALL_SNAP_IF_WITHIN_M = 1.0

function snapShelfCenterIfNearWall(r: ShelfRow): ShelfRow {
  const hit = nearestWallInfo(r.cx, r.cz)
  if (!hit || hit.distM > WALL_SNAP_IF_WITHIN_M) return { ...r }
  const s = snapBookshelfCenterFlushToWall(r.cx, r.cz, r.yaw, r.d)
  return { ...r, cx: s.cx, cz: s.cz, yaw: s.yaw }
}

function snapShelfCenterFlushAlways(r: ShelfRow): ShelfRow {
  const s = snapBookshelfCenterFlushToWall(r.cx, r.cz, r.yaw, r.d)
  return { ...r, cx: s.cx, cz: s.cz, yaw: s.yaw }
}
const RAW_AISLES: Omit<FixtureRenderInstance, 'kind'>[][] = [
  [
    { cx: -14.637, cz: 9.157, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -13.759, cz: 11.672, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -12.623, cz: 11.214, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -13.524, cz: 8.724, w: 1.8, d: 0.5, yaw: -1.2084, h: 2.34 },
  ],
  [
    { cx: -19.847, cz: -4.465, w: 2.7, d: 0.5, yaw: -1.2084, h: 2.34 },
    { cx: -17.224, cz: -0.804, w: 2.7, d: 0.5, yaw: -1.2084, h: 2.34 },
  ],
  [
    { cx: -10.305, cz: 3.345, w: 6.5, d: 1, yaw: 3.4768, h: 2.34 },
    { cx: -13.831, cz: 1.551, w: 1.3, d: 0.5, yaw: 1.9423, h: 2.34 },
    { cx: -6.194, cz: 5.065, w: 1.3, d: 0.5, yaw: 1.9423, h: 2.34 },
  ],
]

/** 복도 양쪽 4개: cz 낮은 쪽 행 / 높은 쪽 행 — 마주보기 정렬용으로 반대쪽 행만 yaw+π */
const Y_FACING = 0.3432
const AISLE_FACING_FOUR: Omit<FixtureRenderInstance, 'kind'>[] = [
  { cx: -7.886, cz: 12.782, w: 1.5, d: 0.5, yaw: Y_FACING, h: 2.34 },
  { cx: -5.764, cz: 12.045, w: 1.5, d: 0.5, yaw: Y_FACING, h: 2.34 },
  { cx: -7.373, cz: 14.308, w: 1.5, d: 0.5, yaw: Y_FACING + Math.PI, h: 2.34 },
  { cx: -5.166, cz: 13.497, w: 1.5, d: 0.5, yaw: Y_FACING + Math.PI, h: 2.34 },
]

const AISLE_FACING_ALIGNED = alignBookshelfPairsFacingAcrossAisle(
  AISLE_FACING_FOUR.map((r) => ({ ...r })),
)

const AISLE_THIN: Omit<FixtureRenderInstance, 'kind'> = {
  cx: -9.964,
  cz: 13.423,
  w: 0.3,
  d: 0.4,
  yaw: 0.3432,
  h: 2.34,
}

const AISLE_NEAR_WALL_RAW: ShelfRow[] = [
  { cx: -8.996, cz: -10.049, w: 2.5, d: 1.7, yaw: -2.812, h: 2.34 },
  { cx: -5.897, cz: -11.165, w: 2.5, d: 1.7, yaw: -2.812, h: 2.34 },
  { cx: 0.055, cz: -13.733, w: 1.2, d: 1.3, yaw: 0.34, h: 2.34 },
  { cx: 0.784, cz: -11.847, w: 1.2, d: 1.3, yaw: 0.34, h: 2.34 },
  { cx: 1.324, cz: -10.263, w: 1.2, d: 0.3, yaw: 0.3256, h: 2.34 },
  { cx: -0.609, cz: -15.512, w: 1.2, d: 0.3, yaw: 0.3256, h: 2.34 },
]

const AISLE_NEAR_WALL = AISLE_NEAR_WALL_RAW.map(snapShelfCenterIfNearWall)

const AISLE_GRID_PAIR_RAW: [ShelfRow[], ShelfRow[]] = [
  [
    { cx: -6.671, cz: -5.333, w: 1, d: 1, yaw: -1.2129, h: 2.34 },
    { cx: -6.099, cz: -3.964, w: 1, d: 1, yaw: -1.2129, h: 2.34 },
    { cx: -5.58, cz: -5.751, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
    { cx: -5.007, cz: -4.334, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
  ],
  [
    { cx: -2.702, cz: 4.434, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
    { cx: -1.816, cz: 4.115, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
    { cx: -2.234, cz: 5.785, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
    { cx: -1.351, cz: 5.491, w: 1, d: 0.45, yaw: -1.2129, h: 2.34 },
  ],
]

const AISLE_GRID_PAIR = AISLE_GRID_PAIR_RAW.map((four) =>
  microAlignShelfClusterBackEdgesFour(four.map((r) => ({ ...r }))),
).flat()

const AISLE_WALL_FLUSH_RAW: ShelfRow[] = [
  { cx: 2.776, cz: 10.144, w: 2.5, d: 0.8, yaw: 0.2972, h: 2.34 },
  { cx: 4.651, cz: 10.944, w: 2.5, d: 0.8, yaw: 0.2972, h: 2.34 },
  { cx: 7.987, cz: 6.459, w: 2.9, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 10.655, cz: 5.351, w: 1.2, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 14.535, cz: 3.646, w: 1.5, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 17.529, cz: 2.358, w: 1.5, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 21.824, cz: 0.463, w: 2.2, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 25.865, cz: -1.242, w: 2.2, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 33.683, cz: -4.731, w: 7, d: 0.5, yaw: 3.5505, h: 2.34 },
  { cx: 37.083, cz: -4.092, w: 2.22, d: 0.5, yaw: 0.4103, h: 2.34 },
  { cx: 32.864, cz: -2.296, w: 5, d: 0.5, yaw: 0.4103, h: 2.34 },
  { cx: 28.852, cz: -0.518, w: 0.6, d: 0.5, yaw: 0.4103, h: 2.34 },
  { cx: 24.462, cz: 1.354, w: 6.2, d: 0.5, yaw: 0.4103, h: 2.34 },
  { cx: 16.035, cz: 4.953, w: 5.7, d: 0.5, yaw: 0.4103, h: 2.34 },
  { cx: 6.959, cz: 8.904, w: 2, d: 0.5, yaw: 0.4103, h: 2.34 },
]

const AISLE_WALL_FLUSH = AISLE_WALL_FLUSH_RAW.map(snapShelfCenterFlushAlways)

export const bookshelfOverlayLayerInstances: FixtureRenderInstance[] = [
  ...RAW_AISLES.flat().map((r) => ({ kind: 'bookshelf' as const, ...r })),
  ...AISLE_FACING_ALIGNED.map((r) => ({ kind: 'bookshelf' as const, ...r })),
  { kind: 'bookshelf', ...AISLE_THIN },
  ...AISLE_NEAR_WALL.map((r) => ({ kind: 'bookshelf' as const, ...r })),
  ...AISLE_GRID_PAIR.map((r) => ({ kind: 'bookshelf' as const, ...r })),
  ...AISLE_WALL_FLUSH.map((r) => ({ kind: 'bookshelf' as const, ...r })),
]
