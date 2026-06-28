export type NavigationMobilityPhase = 'idle' | 'calculating' | 'walking'

export const NAVIGATION_MOBILITY_PHASE_LABELS: Record<NavigationMobilityPhase, string> = {
  idle: '',
  calculating: '경로 계산 중…',
  walking: '이동 중…',
}

export function resolveNavigationMobilityPhase(args: {
  demoNavigationActive: boolean
  demoAutoWalkActive: boolean
  highlightPathLength: number
}): NavigationMobilityPhase {
  if (!args.demoNavigationActive) return 'idle'
  if (args.demoAutoWalkActive) return 'walking'
  if (args.highlightPathLength < 2) return 'calculating'
  return 'idle'
}

/** True when the player is actively moving toward the current navigation goal. */
export function isEnRoute(args: {
  isAutoWalking: boolean
  isWalkMode: boolean
  isManualWalking: boolean
  distanceToGoalM: number | null
}): boolean {
  if (args.isAutoWalking) return true
  if (!args.isWalkMode || !args.isManualWalking) return false
  return args.distanceToGoalM != null
}
