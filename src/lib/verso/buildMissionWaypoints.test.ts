import { describe, expect, it } from 'vitest'
import { buildVersoWaypointsFromScenarioKeys, buildVersoWaypointsFromWorldGoals, buildWaypointLegMapping } from './buildMissionWaypoints'
import { DEMO_BOOKS } from '../../data/demoScenario'
import { mapImageOffsetX, mapImageOffsetZ } from '../../data/mapData'

describe('buildMissionWaypoints', () => {
  it('maps world goals to robot map coordinates', () => {
    const worldX = 10
    const worldZ = 5
    const waypoints = buildVersoWaypointsFromWorldGoals([[worldX, worldZ]])
    expect(waypoints).toEqual([
      {
        id: 'wp_0',
        x: worldX + mapImageOffsetX,
        y: worldZ + mapImageOffsetZ,
      },
    ])
  })

  it('assigns checkout id and label for checkout navigation', () => {
    const waypoints = buildVersoWaypointsFromWorldGoals([[1, 2], [3, 4]], { checkoutNav: true })
    expect(waypoints[0].id).toBe('wp_0')
    expect(waypoints[1]).toEqual({
      id: 'checkout',
      x: 3 + mapImageOffsetX,
      y: 4 + mapImageOffsetZ,
      label: '계산대',
    })
  })

  it('builds leg mapping for shelf and checkout waypoints', () => {
    const waypoints = buildVersoWaypointsFromWorldGoals([[0, 0], [1, 1]], { checkoutNav: true })
    const mapping = buildWaypointLegMapping(waypoints)
    expect(mapping.get('wp_0')).toBe(0)
    expect(mapping.get('checkout')).toBe('checkout')
  })

  it('builds labeled waypoints from scenario book keys', () => {
    const waypoints = buildVersoWaypointsFromScenarioKeys(['book2', 'book1'])
    expect(waypoints).toHaveLength(2)
    expect(waypoints[0]?.label).toBe(DEMO_BOOKS.book2.title)
    expect(waypoints[1]?.label).toBe(DEMO_BOOKS.book1.title)
  }, 30_000)
})
