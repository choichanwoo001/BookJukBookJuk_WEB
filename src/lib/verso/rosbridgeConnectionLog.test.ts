import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeWebSocketCloseCode,
  formatRosbridgeEvent,
  formatRosbridgeOutgoingCommand,
  formatRosbridgeOutgoingWaypoints,
  formatRosbridgePath,
  formatRosbridgeStatus,
  logMissionNavStart,
  logMissionPublishAttempt,
  logMissionPublishResult,
  logMissionPublishSkipped,
  logRosbridgeConnectClose,
  validateRosbridgeUrl,
} from './rosbridgeConnectionLog'

describe('rosbridgeConnectionLog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('describes common close codes', () => {
    expect(describeWebSocketCloseCode(1006)).toContain('비정상 종료')
    expect(describeWebSocketCloseCode(1000)).toContain('정상 종료')
  })

  it('rejects non-WebSocket URLs', () => {
    expect(validateRosbridgeUrl('http://127.0.0.1:9090')).toMatch(/ws:\/\//)
    expect(validateRosbridgeUrl('ws://192.168.0.10:9090')).toBeNull()
  })

  it('forwards close details to dev terminal endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    logRosbridgeConnectClose('ws://127.0.0.1:9090', 1006, '', false)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const terminalCall = fetchMock.mock.calls.find((call) => call[0] === '/verso-rosbridge-log')
    expect(terminalCall).toBeDefined()
    const init = terminalCall![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.level).toBe('error')
    expect(body.message).toContain('[verso-rosbridge]')
    expect(body.message).toContain('1006')
  })

  it('formats incoming and outgoing robot messages for terminal trace', () => {
    expect(
      formatRosbridgeStatus({
        x: 12.3,
        y: 4.5,
        heading: 1.57,
        mode: 'escort',
        isMoving: true,
        currentWaypointId: 'book_001',
        remainingWaypoints: 2,
      }),
    ).toContain('mode=escort')
    expect(
      formatRosbridgePath({ poses: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }),
    ).toContain('2 poses')
    expect(
      formatRosbridgeEvent({ event: 'waypoint_arrived', waypointId: 'book_001', label: '테스트' }),
    ).toContain('waypoint_arrived')
    expect(
      formatRosbridgeOutgoingWaypoints([{ id: 'wp_0', x: 1.2, y: 3.4, label: '책' }]),
    ).toContain('/verso/waypoints')
    expect(formatRosbridgeOutgoingCommand('escort')).toContain('set_mode')
  })

  it('formats mission publish trace for terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const waypoints = [{ id: 'book2', x: 1.2, y: 3.4, label: '오직 두 사람' }]
    logMissionNavStart('ok_proceed', 1)
    logMissionPublishAttempt('SET_DIRECT_GOALS', waypoints)
    logMissionPublishResult(waypoints, true, true)
    logMissionPublishSkipped('START_NAVIGATION', '경로 goal 없음')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const terminalCalls = fetchMock.mock.calls.filter((call) => call[0] === '/verso-rosbridge-log')
    const messages = terminalCalls.map((call) => {
      const init = call[1] as RequestInit
      return JSON.parse(String(init.body)).message as string
    })
    expect(messages.some((m) => m.includes('[안내시작] ok_proceed'))).toBe(true)
    expect(messages.some((m) => m.includes('[목적지 전송] SET_DIRECT_GOALS'))).toBe(true)
    expect(messages.some((m) => m.includes('[목적지 전송 완료]'))).toBe(true)
    expect(messages.some((m) => m.includes('[목적지 미전송] START_NAVIGATION'))).toBe(true)
  })

  it('falls back to browser console when dev terminal forwarding fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)

    logRosbridgeConnectClose('ws://127.0.0.1:9090', 1006, '', false)

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('1006')
  })
})
