import { useEffect, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import Map3DView from './components/Map3DView'
import QrLoginGate from './components/QrLoginGate'
import StartModeGate from './components/StartModeGate'
import { clearCurrentWebSession } from './lib/supabase/qrLogin'
import type { StartMode } from './types/startMode'
import './styles/layout.css'

function App() {
  const [activePane, setActivePane] = useState<'map' | 'chat'>('map')
  const [usersId, setUsersId] = useState<string | null>(null)
  const [startMode, setStartMode] = useState<StartMode | null>(null)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenEnabled) {
        return
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await document.documentElement.requestFullscreen()
    } catch (error) {
      console.warn('[fullscreen] toggle failed', error)
    }
  }

  if (!usersId) {
    return <QrLoginGate onLoggedIn={setUsersId} />
  }
  if (!startMode) {
    return <StartModeGate usersId={usersId} onSelect={setStartMode} />
  }

  return (
    <main className="appShell">
      <div className="sessionBadge">
        <span>로그인 사용자: {usersId}</span>
        <button type="button" onClick={() => void toggleFullscreen()}>
          {isFullscreen ? '전체화면 종료' : '전체화면'}
        </button>
        <button
          type="button"
          onClick={() => {
            clearCurrentWebSession()
            setUsersId(null)
            setStartMode(null)
          }}
        >
          로그아웃
        </button>
      </div>
      <section className="mapPane" onPointerDown={() => setActivePane('map')}>
        <Map3DView activePane={activePane} onActivateMap={() => setActivePane('map')} />
      </section>
      <aside className="chatPane" onPointerDown={() => setActivePane('chat')}>
        <ChatPanel activePane={activePane} onActivateChat={() => setActivePane('chat')} startMode={startMode} />
      </aside>
    </main>
  )
}

export default App
