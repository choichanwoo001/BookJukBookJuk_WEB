import { AGENT_MAP_EVENT_VERSION, dispatchMapCommand } from '../runtime/agentEventBus'
import type { ToolDefinition } from './types'
import { validateRouteArgs } from './toolValidators'

export const routePlannerTool: ToolDefinition = {
  name: 'routePlannerTool',
  validate(args) {
    return validateRouteArgs(args)
  },
  async run(args) {
    const mode = String(args.mode)
    if (mode !== 'shortest') {
      return {
        ok: false,
        toolName: 'routePlannerTool',
        message: '현재는 최단경로 재계산만 지원합니다.',
        errorCode: 'ONLY_SHORTEST_SUPPORTED',
      }
    }

    dispatchMapCommand({ type: 'REPLAN_SHORTEST', version: AGENT_MAP_EVENT_VERSION })
    return {
      ok: true,
      toolName: 'routePlannerTool',
      message: '최단경로로 다시 계산했어요.',
      data: { mode },
    }
  },
}
