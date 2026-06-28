import type { VersoCommandAction, VersoEvent, VersoPath, VersoSetModeAction, VersoStatus, VersoWaypoint } from './types'
import { recordUiConnectionMessage, recordUiMissionMessage } from './rosbridgeUiLogStore'

const LOG_PREFIX = '[verso-rosbridge]'
const TERMINAL_LOG_ENDPOINT = '/verso-rosbridge-log'

type TerminalLogLevel = 'info' | 'warn' | 'error'

function writeBrowserLog(level: TerminalLogLevel, message: string): void {
  if (level === 'error') console.error(message)
  else if (level === 'warn') console.warn(message)
  else console.info(message)
}

async function forwardToDevTerminal(level: TerminalLogLevel, message: string): Promise<boolean> {
  try {
    const res = await fetch(TERMINAL_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message }),
    })
    return res.ok
  } catch {
    return false
  }
}

function writeTerminalLog(level: TerminalLogLevel, message: string): void {
  if (import.meta.env.DEV) {
    void forwardToDevTerminal(level, message).then((forwarded) => {
      // 터미널 전달 실패 시, 또는 연결 오류/경고는 브라우저에도 함께 표시
      if (!forwarded || level === 'error' || level === 'warn') {
        writeBrowserLog(level, message)
      }
    })
    return
  }

  writeBrowserLog(level, message)
}

export function describeWebSocketCloseCode(code: number): string {
  switch (code) {
    case 1000:
      return '정상 종료'
    case 1001:
      return '페이지 이동 또는 연결 종료'
    case 1002:
      return '프로토콜 오류'
    case 1003:
      return '지원하지 않는 데이터 형식'
    case 1006:
      return '비정상 종료 — 로봇 IP·포트(9090)·rosbridge 실행 여부·같은 Wi-Fi인지 확인'
    case 1007:
      return '잘못된 프레임 데이터'
    case 1011:
      return '서버 내부 오류'
    case 1015:
      return 'TLS 핸드셰이크 실패'
    default:
      return `알 수 없는 종료 코드 (${code})`
  }
}

export function validateRosbridgeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return `URL은 ws:// 또는 wss:// 로 시작해야 합니다 (현재: ${parsed.protocol})`
    }
    if (!parsed.hostname) {
      return '호스트(IP 또는 도메인)가 비어 있습니다'
    }
    return null
  } catch {
    return `URL 형식이 올바르지 않습니다: ${url}`
  }
}

export function logRosbridgeConnectAttempt(url: string, attempt: number): void {
  const message = `${LOG_PREFIX} 연결 시도 #${attempt}: ${url}`
  recordUiConnectionMessage(message)
  writeTerminalLog('info', message)
}

export function logRosbridgeConnectOpen(url: string): void {
  const message = `${LOG_PREFIX} WebSocket 연결됨 — /verso/status 수신 대기 중: ${url}`
  recordUiConnectionMessage(message)
  writeTerminalLog('info', message)
}

export function logRosbridgeConnectReady(url: string): void {
  const message = `${LOG_PREFIX} 로봇 연동 준비 완료 (/verso/status 수신): ${url}`
  recordUiConnectionMessage(message)
  writeTerminalLog('info', message)
}

export function logRosbridgeConnectError(url: string): void {
  const message =
    `${LOG_PREFIX} WebSocket 오류 발생: ${url}\n` +
    '  → 곧 이어지는 close code 로그에서 원인(1006=연결 거부/미도달 등)을 확인하세요.'
  recordUiConnectionMessage(message)
  writeTerminalLog('error', message)
}

export function logRosbridgeConnectClose(
  url: string,
  code: number,
  reason: string,
  wasClean: boolean,
): void {
  const reasonText = describeWebSocketCloseCode(code)
  const detail = reason.trim() ? `서버 메시지: ${reason.trim()}` : '서버 메시지 없음'
  const message =
    `${LOG_PREFIX} 연결 실패: ${url}\n` +
    `  → ${reasonText}\n` +
    `  → close code=${code}, clean=${wasClean}, ${detail}\n` +
    '  → 확인: rosbridge(9090) 실행, web_bridge_node 실행, 방화벽, IP/URL 오타'
  recordUiConnectionMessage(message)
  writeTerminalLog('error', message)
}

export function logRosbridgeStatusTimeout(url: string, timeoutMs: number): void {
  const message =
    `${LOG_PREFIX} WebSocket은 열렸지만 ${timeoutMs / 1000}초 안에 /verso/status가 없습니다: ${url}\n` +
    '  → web_bridge_node가 실행 중인지, 로봇 ROS2 스택이 올라왔는지 확인하세요.\n' +
    '  → 「연결」 버튼을 다시 눌러 재시도할 수 있습니다.'
  recordUiConnectionMessage(message)
  writeTerminalLog('warn', message)
}

export function logRosbridgeInvalidUrl(url: string, message: string): void {
  const full = `${LOG_PREFIX} 연결 불가 — ${message}\n  → 입력 URL: ${url}`
  recordUiConnectionMessage(full)
  writeTerminalLog('error', full)
}

export function formatRosbridgeStatus(status: VersoStatus): string {
  const wp = status.currentWaypointId ?? '—'
  return (
    `${LOG_PREFIX} ← /verso/status ` +
    `pos=(${status.x.toFixed(3)}, ${status.y.toFixed(3)}) ` +
    `heading=${status.heading.toFixed(4)} ` +
    `mode=${status.mode} moving=${status.isMoving} ` +
    `wp=${wp} remaining=${status.remainingWaypoints} ` +
    `| ${JSON.stringify(status)}`
  )
}

export function formatRosbridgePath(path: VersoPath): string {
  const n = path.poses.length
  if (n === 0) return `${LOG_PREFIX} ← /verso/path (empty)`
  const first = path.poses[0]
  const last = path.poses[n - 1]
  return (
    `${LOG_PREFIX} ← /verso/path ${n} poses ` +
    `start=(${first.x}, ${first.y}) end=(${last.x}, ${last.y}) ` +
    `| ${JSON.stringify(path)}`
  )
}

export function formatRosbridgeEvent(event: VersoEvent): string {
  const parts = [event.event]
  if (event.waypointId) parts.push(`waypointId=${event.waypointId}`)
  if (event.label) parts.push(`label=${event.label}`)
  return `${LOG_PREFIX} ← /verso/event ${parts.join(' ')} | ${JSON.stringify(event)}`
}

export function formatRosbridgeOutgoingWaypoints(waypoints: VersoWaypoint[]): string {
  return `${LOG_PREFIX} → /verso/waypoints ${JSON.stringify({ type: 'waypoints', waypoints })}`
}

export function formatRosbridgeOutgoingCommand(
  action: VersoCommandAction | VersoSetModeAction,
): string {
  if (action === 'guidance' || action === 'escort') {
    return `${LOG_PREFIX} → /verso/command ${JSON.stringify({ type: 'command', action: 'set_mode', mode: action })}`
  }
  return `${LOG_PREFIX} → /verso/command ${JSON.stringify({ type: 'command', action })}`
}

export function logRosbridgeIncomingStatus(status: VersoStatus): void {
  writeTerminalLog('info', formatRosbridgeStatus(status))
}

export function logRosbridgeIncomingPath(path: VersoPath): void {
  writeTerminalLog('info', formatRosbridgePath(path))
}

export function logRosbridgeIncomingEvent(event: VersoEvent): void {
  writeTerminalLog('info', formatRosbridgeEvent(event))
}

export function logRosbridgeOutgoingWaypoints(waypoints: VersoWaypoint[]): void {
  writeTerminalLog('info', formatRosbridgeOutgoingWaypoints(waypoints))
}

export function logRosbridgeOutgoingCommand(action: VersoCommandAction | VersoSetModeAction): void {
  writeTerminalLog('info', formatRosbridgeOutgoingCommand(action))
}

export type MissionPublishTrigger =
  | 'ok_proceed'
  | 'PREVIEW_NAV_PLAN'
  | 'SET_DIRECT_GOALS'
  | 'START_NAVIGATION'
  | 'GO_CHECKOUT'

function summarizeWaypoints(waypoints: VersoWaypoint[]): string {
  return waypoints
    .map((wp, i) => {
      const name = wp.label ?? wp.id
      return `${i + 1}.${name}(${wp.x.toFixed(2)},${wp.y.toFixed(2)})`
    })
    .join(' → ')
}

/** 오케이/시작 입력으로 안내가 트리거됐을 때 */
export function logMissionNavStart(trigger: MissionPublishTrigger, bookCount?: number): void {
  const books = bookCount != null && bookCount > 0 ? ` · 책 ${bookCount}권` : ''
  const message = `${LOG_PREFIX} [안내시작] ${trigger}${books}`
  recordUiMissionMessage(message)
  writeTerminalLog('info', message)
}

/** 맵 전환 시 로봇 미션 좌표(출발점 + 목적지) */
export function logRobotMapMissionContext(
  start: { x: number; y: number },
  waypoints: VersoWaypoint[],
): void {
  const message =
    `${LOG_PREFIX} [미션 좌표] 출발 map (${start.x.toFixed(3)}, ${start.y.toFixed(3)})\n` +
    `  → 목적지 ${summarizeWaypoints(waypoints)}`
  recordUiMissionMessage(message)
  writeTerminalLog('info', message)
}

/** 로봇으로 목적지를 보내기 직전 */
export function logMissionPublishAttempt(
  trigger: Exclude<MissionPublishTrigger, 'ok_proceed'>,
  waypoints: VersoWaypoint[],
): void {
  const message =
    `${LOG_PREFIX} [목적지 전송] ${trigger} · ${waypoints.length}곳\n` +
    `  → ${summarizeWaypoints(waypoints)}`
  recordUiMissionMessage(message)
  writeTerminalLog('info', message)
}

/** 전송이 생략됐을 때 (로봇 미연결, goal 없음 등) */
export function logMissionPublishSkipped(
  trigger: Exclude<MissionPublishTrigger, 'ok_proceed'>,
  reason: string,
): void {
  const message =
    `${LOG_PREFIX} [목적지 미전송] ${trigger}: ${reason}\n` +
    '  → UI 「로봇」 배지가 연결됨인지, /verso/status 수신 중인지 확인하세요.'
  recordUiMissionMessage(message)
  writeTerminalLog('warn', message)
}

/** waypoint / escort 발행 결과 */
export function logMissionPublishResult(
  waypoints: VersoWaypoint[],
  waypointsOk: boolean,
  escortOk: boolean,
): void {
  if (waypointsOk && escortOk) {
    const message =
      `${LOG_PREFIX} [목적지 전송 완료] waypoint ${waypoints.length}곳 + escort 모드\n` +
      `  → ${summarizeWaypoints(waypoints)}`
    recordUiMissionMessage(message)
    writeTerminalLog('info', message)
    return
  }
  if (waypointsOk && !escortOk) {
    const message = `${LOG_PREFIX} [목적지 부분 전송] waypoint는 전송됐으나 escort 모드 전환 실패`
    recordUiMissionMessage(message)
    writeTerminalLog('warn', message)
    return
  }
  const message =
    `${LOG_PREFIX} [목적지 전송 실패] /verso/waypoints 미발행 (로봇 미연결 또는 WebSocket 준비 안 됨)`
  recordUiMissionMessage(message)
  writeTerminalLog('warn', message)
}
