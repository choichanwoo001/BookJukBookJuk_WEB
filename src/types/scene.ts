export type ViewMode = 'firstPerson' | 'thirdPerson' | 'overview' | 'edit'
export type SurfaceKind = 'floor' | 'wall' | 'bookshelf' | 'pillar'

export type PickPoint = {
  x: number
  y: number
  z: number
  surface: SurfaceKind
}

export type CircleSelection = {
  id: string
  center: PickPoint
}

export type FixtureRenderKind = 'bookshelf' | 'counter' | 'displayLow' | 'displayShelf'

export type FixtureRenderInstance = {
  kind: FixtureRenderKind
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
  /** Stable map shelf id, e.g. shelf_001 … shelf_041 (bookshelf kind only). */
  shelfId?: string
  /** KDC 대분류 0–9; bookshelf edit / 네비 연동용 */
  sector?: number | null
}
