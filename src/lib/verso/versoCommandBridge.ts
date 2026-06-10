import type { VersoCommandAction, VersoConnectionState } from './types'

type PublishFn = (action: VersoCommandAction) => boolean

let publishFn: PublishFn | null = null
let connectionState: VersoConnectionState = 'disconnected'

export function registerVersoCommandBridge(
  state: VersoConnectionState,
  publish: PublishFn | null,
): void {
  connectionState = state
  publishFn = publish
}

export function getVersoConnectionState(): VersoConnectionState {
  return connectionState
}

export function tryPublishVersoCommand(action: VersoCommandAction): boolean {
  if (connectionState !== 'connected' || !publishFn) return false
  return publishFn(action)
}
