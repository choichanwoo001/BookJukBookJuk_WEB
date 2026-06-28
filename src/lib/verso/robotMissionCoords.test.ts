import { describe, expect, it } from 'vitest'
import { DEMO_BOOKS } from '../../data/demoScenario'
import { mapImageOffsetX, mapImageOffsetZ } from '../../data/mapData'
import {
  initialRobotMissionWaypoints,
  ROBOT_MAP_BOOK2,
  ROBOT_MAP_START,
  robotMapBook2WorldXz,
  robotMapStartWorldXz,
} from './robotMissionCoords'

describe('robotMissionCoords', () => {
  it('defines robot map frame start and book2 coordinates', () => {
    expect(ROBOT_MAP_START).toEqual({ x: -22.362, y: 5.197 })
    expect(ROBOT_MAP_BOOK2).toEqual({ x: -24.117, y: -8.361 })
  })

  it('converts robot map coords to web world xz', () => {
    expect(robotMapStartWorldXz()).toEqual([
      ROBOT_MAP_START.x - mapImageOffsetX,
      ROBOT_MAP_START.y - mapImageOffsetZ,
    ])
    expect(robotMapBook2WorldXz()).toEqual([
      ROBOT_MAP_BOOK2.x - mapImageOffsetX,
      ROBOT_MAP_BOOK2.y - mapImageOffsetZ,
    ])
  })

  it('builds initial mission waypoints for 오직 두 사람 only', () => {
    const waypoints = initialRobotMissionWaypoints()
    expect(waypoints).toEqual([{
      id: 'book2',
      x: ROBOT_MAP_BOOK2.x,
      y: ROBOT_MAP_BOOK2.y,
      label: DEMO_BOOKS.book2.title,
    }])
  })
})
