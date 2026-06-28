export type ViewMode = 'topDown' | 'overview' | 'edit'
export type EditTool = 'areaSelection' | 'bookshelfEdit' | 'wallSelect'
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

export type FixtureRenderKind = 'bookshelf' | 'counter' | 'displayLow'

export type FixtureRenderInstance = {
  kind: FixtureRenderKind
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
  footprint?: [number, number][]
}
