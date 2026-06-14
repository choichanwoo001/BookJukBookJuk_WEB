import type { ToolCall, ToolExecutionContext, ToolResult } from '../types'
import { bookSearchTool } from './bookSearchTool'
import { checkoutTool } from './checkoutTool'
import { fallbackTool } from './fallbackTool'
import { mobilityControlTool } from './mobilityControlTool'
import { recommendationTool } from './recommendationTool'
import { routePlannerTool } from './routePlannerTool'
import { shoppingListTool } from './shoppingListTool'
import type { ToolDefinition } from './types'

const toolRegistry = new Map<string, ToolDefinition>([
  [bookSearchTool.name, bookSearchTool],
  [checkoutTool.name, checkoutTool],
  [shoppingListTool.name, shoppingListTool],
  [routePlannerTool.name, routePlannerTool],
  [mobilityControlTool.name, mobilityControlTool],
  [recommendationTool.name, recommendationTool],
  [fallbackTool.name, fallbackTool],
])

export async function executeTool(call: ToolCall, ctx: ToolExecutionContext): Promise<ToolResult> {
  const tool = toolRegistry.get(call.name)
  if (!tool) {
    return {
      ok: false,
      toolName: call.name,
      message: `등록되지 않은 tool: ${call.name}`,
      errorCode: 'TOOL_NOT_FOUND',
    }
  }

  const validation = tool.validate(call.args)
  if (validation) {
    return {
      ok: false,
      toolName: call.name,
      message: validation,
      errorCode: 'VALIDATION_ERROR',
    }
  }

  return tool.run(call.args, ctx)
}
