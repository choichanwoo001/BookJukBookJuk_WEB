import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  readStoredVersoRosbridgeUrl,
  readVersoRosbridgeDefaultUrl,
  writeStoredVersoRosbridgeUrl,
} from '../../lib/verso/env'
import type { VersoConnectionState } from '../../lib/verso/types'

const STATE_LABEL: Record<VersoConnectionState, string> = {
  disconnected: '미연결',
  connecting: '연결 중…',
  connected: '연결됨',
  error: '오류',
}

export type VersoConnectionPanelProps = {
  connectionState: VersoConnectionState
  onConnect: (url: string) => void
  onDisconnect: () => void
}

export function VersoConnectionPanel({
  connectionState,
  onConnect,
  onDisconnect,
}: VersoConnectionPanelProps) {
  const [draftUrl, setDraftUrl] = useState(() => readStoredVersoRosbridgeUrl())
  const [expanded, setExpanded] = useState(false)
  const isConnected = connectionState === 'connected' || connectionState === 'connecting'
  const showRetryLabel = isConnected || connectionState === 'error'

  const handleUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDraftUrl(e.target.value)
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const trimmed = draftUrl.trim()
      writeStoredVersoRosbridgeUrl(trimmed)
      if (trimmed) {
        onConnect(trimmed)
      } else {
        onDisconnect()
      }
    },
    [draftUrl, onConnect, onDisconnect],
  )

  const handleDisconnect = useCallback(() => {
    writeStoredVersoRosbridgeUrl('')
    setDraftUrl(readVersoRosbridgeDefaultUrl())
    onDisconnect()
  }, [onDisconnect])

  return (
    <div className="versoConnectionPanel">
      <button
        type="button"
        className="versoConnectionToggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        로봇
        <span className={`versoConnectionBadge versoConnectionBadge--${connectionState}`}>
          {STATE_LABEL[connectionState]}
        </span>
      </button>
      {expanded && (
        <form className="versoConnectionForm" onSubmit={handleSubmit}>
          <label className="versoConnectionLabel" htmlFor="verso-rosbridge-url">
            rosbridge URL
          </label>
          <input
            id="verso-rosbridge-url"
            className="versoConnectionInput"
            type="text"
            value={draftUrl}
            onChange={handleUrlChange}
            placeholder="ws://로봇IP:9090"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="versoConnectionActions">
            <button type="submit">
              {showRetryLabel ? '재연결' : '연결'}
            </button>
            {isConnected && (
              <button type="button" onClick={handleDisconnect}>
                해제
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
