import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  publishNavigationSync,
} from '../../agent/runtime/agentEventBus'
import { createAssistantOutputPipeline } from './assistantOutputPipeline'

function publishReadyNavSync(overrides: Partial<Parameters<typeof publishNavigationSync>[0]> = {}) {
  publishNavigationSync({
    version: AGENT_MAP_EVENT_VERSION,
    navigationActive: true,
    mobilityPhase: 'walking',
    activeLeg: 0,
    distanceToGoalM: 5,
    highlightPathLengthM: 10,
    isAutoWalking: true,
    isManualWalking: false,
    isWalkMode: true,
    navigationSpawnReady: true,
    ttsSpeaking: false,
    mobilityHold: false,
    ...overrides,
  })
}

describe('createAssistantOutputPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes immediate items sequentially with speakAndWait', async () => {
    const appendAssistant = vi.fn(async () => undefined)
    const speakAndWait = vi.fn(async () => undefined)
    const pipeline = createAssistantOutputPipeline({
      appendAssistant,
      speakAndWait,
      isTtsEnabled: () => true,
    })

    const first = pipeline.enqueue({ text: '첫 메시지', gate: { kind: 'immediate' } })
    const second = pipeline.enqueue({ text: '둘째 메시지', gate: { kind: 'immediate' } })
    await Promise.all([first, second])

    expect(appendAssistant).toHaveBeenCalledTimes(2)
    expect(speakAndWait).toHaveBeenCalledTimes(2)
    expect(appendAssistant.mock.invocationCallOrder[0]).toBeLessThan(
      speakAndWait.mock.invocationCallOrder[0],
    )
    pipeline.dispose()
  })

  it('appends chat text before starting narrated speech', async () => {
    const appendAssistant = vi.fn(async () => undefined)
    const speakAndWait = vi.fn(async () => undefined)
    const onTtsSpeakingChange = vi.fn()
    const pipeline = createAssistantOutputPipeline({
      appendAssistant,
      speakAndWait,
      isTtsEnabled: () => true,
      onTtsSpeakingChange,
    })

    await pipeline.enqueue({ text: '안내를 시작할게요.', gate: { kind: 'immediate' } })

    expect(appendAssistant.mock.invocationCallOrder[0]).toBeLessThan(
      onTtsSpeakingChange.mock.invocationCallOrder[0],
    )
    expect(onTtsSpeakingChange).toHaveBeenNthCalledWith(1, true)
    expect(onTtsSpeakingChange).toHaveBeenLastCalledWith(false)
    pipeline.dispose()
  })

  it('waits for on_shelf_arrived gate before delivering', async () => {
    vi.useFakeTimers()
    const appendAssistant = vi.fn(async () => undefined)
    const pipeline = createAssistantOutputPipeline({
      appendAssistant,
      speakAndWait: vi.fn(async () => undefined),
      isTtsEnabled: () => false,
    })

    const pending = pipeline.enqueue({
      text: '서가에 도착했어요.',
      gate: { kind: 'on_shelf_arrived', leg: 0 },
    })

    await Promise.resolve()
    expect(appendAssistant).not.toHaveBeenCalled()

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: 1,
    })
    publishReadyNavSync({ activeLeg: 0 })

    await vi.advanceTimersByTimeAsync(10_000)
    await pending
    expect(appendAssistant).toHaveBeenCalledWith('서가에 도착했어요.', undefined)
    pipeline.dispose()
    vi.useRealTimers()
  })

  it('delivers transit message after walk_started for a leg', async () => {
    const appendAssistant = vi.fn(async () => undefined)
    const pipeline = createAssistantOutputPipeline({
      appendAssistant,
      speakAndWait: vi.fn(async () => undefined),
      isTtsEnabled: () => false,
    })

    const pending = pipeline.enqueue({
      text: '이동 중 소개',
      gate: { kind: 'on_walk_started', leg: 0 },
    })

    publishReadyNavSync({
      mobilityPhase: 'calculating',
      isAutoWalking: false,
      activeLeg: 0,
    })
    await Promise.resolve()
    expect(appendAssistant).not.toHaveBeenCalled()

    publishReadyNavSync({
      mobilityPhase: 'walking',
      isAutoWalking: true,
      activeLeg: 0,
    })

    await pending
    expect(appendAssistant).toHaveBeenCalledWith('이동 중 소개', undefined)
    pipeline.dispose()
  })

  it('sets mobility hold immediately when shelf dwell event fires', async () => {
    const onMobilityHoldChange = vi.fn()
    const pipeline = createAssistantOutputPipeline({
      appendAssistant: vi.fn(async () => undefined),
      speakAndWait: vi.fn(async () => undefined),
      isTtsEnabled: () => false,
      onMobilityHoldChange,
    })

    void pipeline.enqueue({
      text: '서가에 도착했어요.',
      gate: { kind: 'on_shelf_arrived', leg: 0 },
    })

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: 1,
    })

    expect(onMobilityHoldChange).toHaveBeenCalledWith(true)
    pipeline.dispose()
  })

  it('sets mobility hold around destination arrival narration', async () => {
    vi.useFakeTimers()
    const appendAssistant = vi.fn(async () => undefined)
    const onMobilityHoldChange = vi.fn()
    const pipeline = createAssistantOutputPipeline({
      appendAssistant,
      speakAndWait: vi.fn(async () => undefined),
      isTtsEnabled: () => true,
      onMobilityHoldChange,
    })

    const pending = pipeline.enqueue({
      text: '서가에 도착했어요.',
      gate: { kind: 'on_shelf_arrived', leg: 0 },
    })

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: 1,
    })
    publishReadyNavSync({ activeLeg: 0 })

    expect(onMobilityHoldChange).toHaveBeenNthCalledWith(1, true)
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
    expect(onMobilityHoldChange).toHaveBeenLastCalledWith(false)
    pipeline.dispose()
    vi.useRealTimers()
  })

  it('keeps mobility hold through batched shelf brief messages', async () => {
    vi.useFakeTimers()
    const onMobilityHoldChange = vi.fn()
    const pipeline = createAssistantOutputPipeline({
      appendAssistant: vi.fn(async () => undefined),
      speakAndWait: vi.fn(async () => undefined),
      isTtsEnabled: () => false,
      onMobilityHoldChange,
    })

    const pending = pipeline.enqueueMany([
      {
        text: '첫 안내',
        gate: { kind: 'on_shelf_arrived', leg: 0 },
        mobilityHoldThrough: true,
      },
      {
        text: '둘째 안내',
        gate: { kind: 'immediate' },
        mobilityHoldThrough: true,
      },
      {
        text: '셋째 안내',
        gate: { kind: 'immediate' },
      },
    ])

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: 1,
    })
    publishReadyNavSync({ activeLeg: 0 })

    await vi.advanceTimersByTimeAsync(10_000)
    await pending
    expect(onMobilityHoldChange).toHaveBeenNthCalledWith(1, true)
    expect(onMobilityHoldChange).toHaveBeenCalledTimes(3)
    expect(onMobilityHoldChange).toHaveBeenLastCalledWith(false)
    pipeline.dispose()
    vi.useRealTimers()
  })
})
