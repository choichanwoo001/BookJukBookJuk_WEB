import { useMemo } from 'react'
import type { ShoppingListEntry } from '../agent/types'
import { isDemoMode } from '../config/demoMode'
import { resolveDemoMissionKeys } from '../data/demoScenario'

export function DemoModeWarningBanner({ plannedBooks }: { plannedBooks: ShoppingListEntry[] }) {
  const show = useMemo(() => {
    if (isDemoMode()) return false
    if (plannedBooks.length === 0) return false
    return resolveDemoMissionKeys(plannedBooks).length > 0
  }, [plannedBooks])

  if (!show) return null

  return (
    <div className="demoModeWarningBanner" role="status">
      데모 자동 이동이 꺼져 있습니다.{' '}
      <code className="demoModeWarningBannerCode">.env</code>에{' '}
      <code className="demoModeWarningBannerCode">VITE_DEMO_MODE=true</code> 설정 후 dev 서버를 재시작하세요.
    </div>
  )
}
