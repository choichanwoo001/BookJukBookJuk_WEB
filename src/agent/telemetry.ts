type MetricKey =
  | 'toolSuccess'
  | 'toolFailure'
  | 'interruptHandled'
  | 'sessionCompleted'
  | 'reconfirmRequested'
  | 'fallbackUsed'
  | 'listEditRuleOverridesLlm'
  | 'llmPlannerUsed'
  | 'llmPlannerFallback'
  | 'llmRewriterUsed'
  | 'llmRewriterFallback'
  | 'themeLlmUsed'
  | 'themeLlmFallback'
  | 'themeLlmParseError'
  | 'themeLlmLatencyMs'
  | 'chatOffTopicReply'
  | 'chatConversationalLlmUsed'
  | 'chatConversationalLlmFallback'

const metrics: Record<MetricKey, number> = {
  toolSuccess: 0,
  toolFailure: 0,
  interruptHandled: 0,
  sessionCompleted: 0,
  reconfirmRequested: 0,
  fallbackUsed: 0,
  listEditRuleOverridesLlm: 0,
  llmPlannerUsed: 0,
  llmPlannerFallback: 0,
  llmRewriterUsed: 0,
  llmRewriterFallback: 0,
  themeLlmUsed: 0,
  themeLlmFallback: 0,
  themeLlmParseError: 0,
  themeLlmLatencyMs: 0,
  chatOffTopicReply: 0,
  chatConversationalLlmUsed: 0,
  chatConversationalLlmFallback: 0,
}

const intentStats: Record<string, { success: number; failure: number }> = {}
const bridgeErrorCounts: Record<string, number> = {}
const toolLatenciesMs: Record<string, number[]> = {}

export function incrementMetric(key: MetricKey): void {
  metrics[key] += 1
}

export function recordIntentOutcome(intentType: string, ok: boolean): void {
  if (!intentStats[intentType]) intentStats[intentType] = { success: 0, failure: 0 }
  if (ok) intentStats[intentType].success += 1
  else intentStats[intentType].failure += 1
}

export function recordBridgeErrorCode(code: string): void {
  bridgeErrorCounts[code] = (bridgeErrorCounts[code] ?? 0) + 1
}

export function recordToolLatency(toolName: string, ms: number): void {
  if (!toolLatenciesMs[toolName]) toolLatenciesMs[toolName] = []
  const arr = toolLatenciesMs[toolName]
  arr.push(ms)
  if (arr.length > 50) arr.shift()
}

export function recordThemeLlmLatency(ms: number): void {
  metrics.themeLlmLatencyMs = ms
}

export type TelemetrySnapshot = Record<MetricKey, number> & {
  intentStats: Record<string, { success: number; failure: number }>
  bridgeErrorCounts: Record<string, number>
  toolLatencyAvgMs: Record<string, number>
}

export function getTelemetrySnapshot(): TelemetrySnapshot {
  const toolLatencyAvgMs: Record<string, number> = {}
  for (const [name, samples] of Object.entries(toolLatenciesMs)) {
    if (samples.length === 0) continue
    toolLatencyAvgMs[name] = samples.reduce((a, b) => a + b, 0) / samples.length
  }
  return {
    ...metrics,
    intentStats: { ...intentStats },
    bridgeErrorCounts: { ...bridgeErrorCounts },
    toolLatencyAvgMs,
  }
}
