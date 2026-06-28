import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenEnabled) return
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await document.documentElement.requestFullscreen()
    } catch (error) {
      console.warn('[fullscreen] toggle failed', error)
    }
  }, [])

  return {
    isFullscreen,
    toggleFullscreen,
    fullscreenSupported: document.fullscreenEnabled,
  }
}
