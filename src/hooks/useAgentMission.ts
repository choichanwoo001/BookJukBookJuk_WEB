import { useCallback, useEffect, useState } from 'react'
import type { Point2 } from '../data/floorPlan'
import {
  subscribeMapCommand,
  type AgentMapCommand,
} from '../agent/runtime/agentEventBus'

export type AgentMissionState = {
  poolIndices: number[] | null
  directGoals: Point2[] | null
  missionVersion: number
}

export function useAgentMission(defaultVersion: number): AgentMissionState & {
  bumpMissionVersion: () => void
} {
  const [poolIndices, setPoolIndices] = useState<number[] | null>(null)
  const [directGoals, setDirectGoals] = useState<Point2[] | null>(null)
  const [missionVersion, setMissionVersion] = useState(defaultVersion)

  const bumpMissionVersion = useCallback(() => {
    setMissionVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    return subscribeMapCommand((command: AgentMapCommand) => {
      if (command.type === 'SET_DIRECT_GOALS' || command.type === 'PREVIEW_NAV_PLAN') {
        setDirectGoals(command.goals)
        setPoolIndices(null)
        setMissionVersion((v) => v + 1)
      }
      if (command.type === 'REPLAN_SHORTEST' || command.type === 'START_NAVIGATION') {
        setMissionVersion((v) => v + 1)
      }
      if (command.type === 'GO_CHECKOUT') {
        setPoolIndices(null)
        setDirectGoals(null)
        setMissionVersion((v) => v + 1)
      }
    })
  }, [])

  return { poolIndices, directGoals, missionVersion, bumpMissionVersion }
}
