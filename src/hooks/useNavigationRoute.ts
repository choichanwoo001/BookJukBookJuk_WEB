import type { RefObject } from 'react'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { Point2 } from '../data/floorPlan'
import type { FixtureRenderInstance } from '../types/scene'
import {
  NAV_ARRIVAL_RADIUS_M,
  NAV_GOAL_MARGIN_M,
  NAV_GRID_CELL_M,
  NAV_SEGMENT_SAMPLE_STEP_M,
} from '../config/constants'
import {
  concatPaths,
  findPathWorldGrid,
  isSegmentWalkableWorld,
  simplifyPathCollinear,
  type WorldBounds,
} from '../utils/gridPathfinding'
import { pickBookshelfGoalWorld } from '../utils/navBookshelfGoals'
import { missionIndicesFromShelfIds } from '../utils/shelfNavAdapter'
import type { WalkabilityContext } from '../utils/walkability'

export type NavigationRouteVisual = {
  dimPath: Point2[]
  highlightPath: Point2[]
  /** 플레이어~현재 하이라이트 목표 거리(m). 밝은 선 색·투명도 보간용. */
  highlightDistanceToGoalM: number | null
  currentGoal: Point2 | null
  activeLeg: number
  goals: Point2[]
}

export function useNavigationRoute(args: {
  missionIndices: number[]
  /** 비어 있지 않으면 `missionIndices` 대신 shelf id 순서로 목표 책장을 해석 */
  missionShelfIds?: string[]
  /** 새 미션 버튼 등으로 바뀔 때마다 경로 상태를 반드시 초기화하기 위해 포함 */
  missionVersion: number
  bookshelfInstances: FixtureRenderInstance[]
  /** SceneContent가 매 프레임 갱신; React state로 올리지 않음(부모 리렌더로 카메라 props가 덮어씌워지는 것 방지) */
  playerXzRef: RefObject<Point2 | null>
  ctx: WalkabilityContext
  bounds: WorldBounds
  cellSize?: number
  enabled?: boolean
}): NavigationRouteVisual | null {
  const { missionIndices, missionShelfIds, missionVersion, bookshelfInstances, playerXzRef, ctx, bounds } = args
  const cellSize = args.cellSize ?? NAV_GRID_CELL_M
  const enabled = args.enabled ?? true

  const resolvedMissionIndices = useMemo(() => {
    if (!enabled) return []
    if (missionShelfIds && missionShelfIds.length > 0) {
      return missionIndicesFromShelfIds(missionShelfIds, bookshelfInstances)
    }
    return missionIndices
  }, [enabled, missionShelfIds, missionIndices, bookshelfInstances])

  const goals = useMemo(() => {
    if (!enabled) return [] as Point2[]
    const out: Point2[] = []
    for (const idx of resolvedMissionIndices) {
      const inst = bookshelfInstances[idx]
      if (!inst || inst.kind !== 'bookshelf') continue
      const g = pickBookshelfGoalWorld(inst, ctx, bounds, cellSize, NAV_GOAL_MARGIN_M)
      if (g) out.push(g)
    }
    return out
  }, [enabled, resolvedMissionIndices, bookshelfInstances, ctx, bounds, cellSize])

  const interShelfPaths = useMemo(() => {
    if (goals.length < 2) return [] as Point2[][]
    const segments: Point2[][] = []
    for (let i = 0; i < goals.length - 1; i++) {
      const a = goals[i]
      const b = goals[i + 1]
      const p = findPathWorldGrid(a, b, ctx, bounds, cellSize)
      if (p) {
        segments.push(p)
      } else if (isSegmentWalkableWorld(a, b, ctx, NAV_SEGMENT_SAMPLE_STEP_M)) {
        segments.push([a, b])
      } else {
        segments.push([])
      }
    }
    return segments
  }, [goals, ctx, bounds, cellSize])

  const masterTail = useMemo(() => {
    if (interShelfPaths.length === 0) return [] as Point2[]
    let acc: Point2[] = []
    for (const seg of interShelfPaths) {
      acc = concatPaths(acc, seg)
    }
    return acc
  }, [interShelfPaths])

  const [activeLeg, setActiveLeg] = useState(0)
  const [leg0Path, setLeg0Path] = useState<Point2[]>([])
  const leg0PathRef = useRef<Point2[]>([])
  const [frozenLeg0, setFrozenLeg0] = useState<Point2[]>([])
  const leg0LockedRef = useRef(false)
  const leg0StartRef = useRef<Point2 | null>(null)
  const leg0FindingDoneRef = useRef(false)
  const arrivalCooldown = useRef(false)
  const [highlightDistanceToGoalM, setHighlightDistanceToGoalM] = useState<number | null>(null)
  const lastHighlightDistRef = useRef<number | null>(null)

  const activeLegRef = useRef(activeLeg)
  const goalsRef = useRef(goals)

  const missionKey = `${enabled ? 1 : 0}:${missionVersion}:${resolvedMissionIndices.join(',')}:${(missionShelfIds ?? []).join('|')}`

  useEffect(() => {
    activeLegRef.current = activeLeg
  }, [activeLeg])

  useEffect(() => {
    goalsRef.current = goals
  }, [goals])

  useEffect(() => {
    if (!enabled) return
    startTransition(() => {
      setActiveLeg(0)
      setLeg0Path([])
      setFrozenLeg0([])
    })
    leg0LockedRef.current = false
    leg0StartRef.current = null
    leg0FindingDoneRef.current = false
    lastHighlightDistRef.current = null
    startTransition(() => setHighlightDistanceToGoalM(null))
  }, [enabled, missionKey])

  useEffect(() => {
    if (!enabled) return
    if (leg0LockedRef.current) return
    leg0StartRef.current = null
    leg0FindingDoneRef.current = false
  }, [enabled, ctx, bounds, cellSize])

  useEffect(() => {
    leg0PathRef.current = leg0Path
  }, [leg0Path])

  useEffect(() => {
    if (!enabled) return
    if (goals.length === 0 || activeLeg !== 0) return
    if (leg0LockedRef.current) return
    if (leg0FindingDoneRef.current) return

    let cancelled = false
    let raf = 0
    const tryFind = () => {
      if (cancelled) return
      const p = playerXzRef.current
      if (!p) {
        raf = requestAnimationFrame(tryFind)
        return
      }
      if (!leg0StartRef.current) {
        leg0StartRef.current = [p[0], p[1]]
      }
      const start = leg0StartRef.current
      const g0 = goals[0]
      const pth = findPathWorldGrid(start, g0, ctx, bounds, cellSize)
      leg0FindingDoneRef.current = true
      if (pth) {
        leg0LockedRef.current = true
        startTransition(() => setLeg0Path(pth))
      }
    }
    tryFind()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [enabled, goals, activeLeg, ctx, bounds, cellSize, missionKey, playerXzRef])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const g = goalsRef.current
      const leg = activeLegRef.current
      if (g.length === 0 || leg >= g.length) {
        return
      }
      const p = playerXzRef.current
      if (!p) {
        raf = requestAnimationFrame(tick)
        return
      }
      const goal = g[leg]
      const d = Math.hypot(p[0] - goal[0], p[1] - goal[1])
      const last = lastHighlightDistRef.current
      if (last === null || Math.abs(d - last) > 0.04) {
        lastHighlightDistRef.current = d
        setHighlightDistanceToGoalM(d)
      }
      if (d < NAV_ARRIVAL_RADIUS_M) {
        if (!arrivalCooldown.current) {
          arrivalCooldown.current = true
          if (leg === 0 && leg0PathRef.current.length > 0) {
            startTransition(() => setFrozenLeg0([...leg0PathRef.current]))
          }
          startTransition(() => setActiveLeg((a) => Math.min(a + 1, goalsRef.current.length)))
          window.setTimeout(() => {
            arrivalCooldown.current = false
          }, 650)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [enabled, playerXzRef, missionKey])

  useEffect(() => {
    lastHighlightDistRef.current = null
  }, [activeLeg])

  const highlightPath = useMemo((): Point2[] => {
    if (goals.length === 0 || activeLeg >= goals.length) return []
    if (activeLeg === 0) return leg0Path
    const segIdx = activeLeg - 1
    if (segIdx >= 0 && segIdx < interShelfPaths.length) return interShelfPaths[segIdx]
    return []
  }, [activeLeg, goals.length, leg0Path, interShelfPaths])

  const dimPath = useMemo((): Point2[] => {
    if (goals.length === 0) return []
    const raw =
      activeLeg === 0
        ? concatPaths(leg0Path, masterTail)
        : concatPaths(frozenLeg0.length > 0 ? frozenLeg0 : leg0Path, masterTail)
    return simplifyPathCollinear(raw)
  }, [activeLeg, goals.length, leg0Path, masterTail, frozenLeg0])

  return useMemo(() => {
    if (!enabled) return null
    if (goals.length === 0) return null
    const cg = activeLeg < goals.length ? goals[activeLeg] : null
    return {
      dimPath,
      highlightPath,
      highlightDistanceToGoalM,
      currentGoal: cg,
      activeLeg,
      goals,
    }
  }, [enabled, dimPath, highlightPath, highlightDistanceToGoalM, activeLeg, goals])
}
