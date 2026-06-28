import { lazy, Suspense } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'

const Map3DView = lazy(() => import('./Map3DView'))

export function MapDevShell() {
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  return (
    <main className="mapDevShell">
      <Suspense fallback={<div className="map3DLoading" role="status">지도 불러오는 중...</div>}>
        <Map3DView
          standalone
          activePane="map"
          onActivateMap={() => {}}
          busy={false}
          onBookCapture={() => {}}
          usersId={null}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onResetOnboarding={() => window.location.reload()}
        />
      </Suspense>
    </main>
  )
}
