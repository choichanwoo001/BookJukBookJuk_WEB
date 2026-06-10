import type {
  AgentContext,
  RecommendationToolData,
  ToolCall,
  ToolResult,
} from '../../agent/types'

export const RECENT_RECOMMENDED_CAP = 24

export function recommendationContextPatch(
  toolCall: ToolCall,
  result: ToolResult,
  snapshot: AgentContext,
  recentCap = RECENT_RECOMMENDED_CAP,
): Partial<AgentContext> {
  if (!result.ok || result.toolName !== 'recommendationTool') return {}
  const data = result.data as RecommendationToolData | undefined
  const ids =
    data?.candidates
      ?.map((c) => (typeof c.booksId === 'string' ? c.booksId.trim() : ''))
      .filter((id) => id.length > 0) ?? []
  const patch: Partial<AgentContext> = {}
  if (ids.length > 0) {
    const prev = snapshot.recentlyRecommendedBookIds ?? []
    const merged: string[] = [...prev]
    for (const id of ids) {
      if (!merged.includes(id)) merged.push(id)
    }
    patch.recentlyRecommendedBookIds = merged.slice(-recentCap)
  }
  const modeArg = toolCall.args?.mode
  const mode = modeArg === 'location' || modeArg === 'rating' ? modeArg : 'taste'
  if (mode === 'taste') {
    patch.recommendationDiversityRound = (snapshot.recommendationDiversityRound ?? 0) + 1
  }
  return patch
}
