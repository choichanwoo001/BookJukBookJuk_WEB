import {
  publishVersoEscort,
  publishVersoGuidance,
  publishVersoResume,
  publishVersoStop,
} from '../../lib/verso/versoMobilityCommands'
import { isDemoMode } from '../../config/demoMode'
import { AGENT_MAP_EVENT_VERSION, dispatchMapCommand } from '../runtime/agentEventBus'
import type { ToolDefinition } from './types'
import { validateMobilityArgs } from './toolValidators'

const DEMO_RESUME_HINT =
  '데모 시나리오에서는 "오케이"라고 말씀하시거나 OK 사인으로 진행해 주세요.'

export const mobilityControlTool: ToolDefinition = {
  name: 'mobilityControlTool',
  validate(args) {
    return validateMobilityArgs(args)
  },
  async run(args, ctx) {
    const action = String(args.action)
    if (action === 'pause') {
      ctx.setContext({ mobilityPaused: true })
      const published = publishVersoStop()
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: published
          ? '이동을 멈췄습니다.'
          : '이동을 멈췄습니다. (로봇 미연결 — 화면만 일시정지)',
      }
    }
    if (action === 'resume') {
      if (isDemoMode()) {
        return {
          ok: true,
          toolName: 'mobilityControlTool',
          message: DEMO_RESUME_HINT,
        }
      }
      ctx.setContext({ mobilityPaused: false })
      const published = publishVersoResume()
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: published
          ? '이동을 재개합니다.'
          : '이동을 재개합니다. (로봇 미연결 — 화면만 재개)',
      }
    }
    if (action === 'guidance') {
      ctx.setContext({ mobilityPaused: false })
      const published = publishVersoGuidance()
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: published
          ? '로봇이 따라오도록 설정했습니다.'
          : '로봇이 따라오도록 설정했습니다. (로봇 미연결 — 화면만 반영)',
      }
    }
    if (action === 'escort') {
      if (isDemoMode()) {
        return {
          ok: true,
          toolName: 'mobilityControlTool',
          message: DEMO_RESUME_HINT,
        }
      }
      ctx.setContext({ mobilityPaused: false })
      const published = publishVersoEscort()
      dispatchMapCommand({ type: 'RESUME_MOBILITY', version: AGENT_MAP_EVENT_VERSION })
      return {
        ok: true,
        toolName: 'mobilityControlTool',
        message: published
          ? '로봇 안내를 재개합니다.'
          : '로봇 안내를 재개합니다. (로봇 미연결 — 화면만 반영)',
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
