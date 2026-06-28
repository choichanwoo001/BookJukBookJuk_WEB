import { DEMO_BOOKS } from '../../data/demoScenario'
import type { Point2 } from '../../data/floorPlan'
import { robotMapToWorldXz } from '../../utils/robotMapCoords'
import type { VersoWaypoint } from './types'

/** 로봇 map frame — 세션 출발점 (AMCL 기준) */
export const ROBOT_MAP_START = { x: -22.362, y: 5.197 } as const

/** 로봇 map frame — 1번 목적지: 오직 두 사람 */
export const ROBOT_MAP_BOOK2 = { x: -24.117, y: -8.361 } as const

export function robotMapStartWorldXz(): Point2 {
  return robotMapToWorldXz(ROBOT_MAP_START.x, ROBOT_MAP_START.y)
}

export function robotMapBook2WorldXz(): Point2 {
  return robotMapToWorldXz(ROBOT_MAP_BOOK2.x, ROBOT_MAP_BOOK2.y)
}

/** 맵 전환 시 로봇으로 보내는 초기 미션 — 오직 두 사람 1곳 (map frame 좌표 그대로) */
export function initialRobotMissionWaypoints(): VersoWaypoint[] {
  return [{
    id: 'book2',
    x: ROBOT_MAP_BOOK2.x,
    y: ROBOT_MAP_BOOK2.y,
    label: DEMO_BOOKS.book2.title,
  }]
}
