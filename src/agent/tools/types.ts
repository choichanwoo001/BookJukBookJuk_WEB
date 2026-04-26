import type { ToolExecutionContext, ToolResult } from '../types'

export type ToolDefinition = {
  name: string
  validate: (args: Record<string, unknown>) => string | null
  run: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolResult>
}
