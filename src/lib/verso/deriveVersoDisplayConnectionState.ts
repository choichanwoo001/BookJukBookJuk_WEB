import type { VersoConnectionState, VersoStatus } from './types'

/**
 * UI badge state — stricter than raw transport connectionState.
 * Mock backend (no activeUrl) and WS-only opens must not show "연결됨".
 */
export function deriveVersoDisplayConnectionState(
  activeUrl: string | null,
  connectionState: VersoConnectionState,
  lastStatus: VersoStatus | null,
): VersoConnectionState {
  if (!activeUrl?.trim()) {
    return 'disconnected'
  }
  if (connectionState === 'connected' && !lastStatus) {
    return 'connecting'
  }
  return connectionState
}
