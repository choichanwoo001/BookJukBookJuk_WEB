import { AGENT_MAP_EVENT_VERSION, dispatchMapCommand } from '../runtime/agentEventBus'
import type { ToolDefinition } from './types'
import { validateMobilityArgs } from './toolValidators'

export const mobilityControlTool: ToolDefinition = {
  name: 'mobilityControlTool',
  validate(args) {
    return validateMobilityArgs(args)
  },
  async run(args, ctx) {
    const action = String(args.action)
    if (action === 'pause') {
      ctx.setContext({ mobilityPaused: true })
      dispatchMapCommand({ type: 'PAUSE_MOBILITY', version: AGENT_MAP_EVENT_VERSION })
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: '이동을 멈췄습니다.',
      }
    }
    if (action === 'resume') {
      ctx.setContext({ mobilityPaused: false })
      dispatchMapCommand({ type: 'RESUME_MOBILITY', version: AGENT_MAP_EVENT_VERSION })
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: '이동을 재개합니다.',
      }
    }
    return {
      ok: false,
      toolName: 'mobilityControlTool',
      message: '지원하지 않는 이동 제어 액션입니다.',
      errorCode: 'INVALID_ACTION',
    }
  },
}
