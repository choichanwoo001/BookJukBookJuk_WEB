import type { ToolDefinition } from './types'
import { validateGoalCheckArgs } from './toolValidators'

/** Stub: mission goal reached check (W3). Wire to real mission state later. */
export const goalCheckTool: ToolDefinition = {
  name: 'goalCheckTool',
  validate(args) {
    return validateGoalCheckArgs(args)
  },
  async run(args) {
    const mode = String(args.mode)
    if (mode !== 'default') {
      return {
        ok: false,
        toolName: 'goalCheckTool',
        message: '지원하지 않는 goal check 모드입니다.',
        errorCode: 'INVALID_MODE',
      }
    }
    return {
      ok: true,
      toolName: 'goalCheckTool',
      message: '목표 지점 확인을 완료했어요.',
      data: { checked: true },
    }
  },
}
