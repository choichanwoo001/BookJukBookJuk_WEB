function isTruthyFlag(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

export function isMapDevMode(): boolean {
  if (typeof window !== 'undefined') {
    const mapOnly = new URLSearchParams(window.location.search).get('mapOnly')
    if (isTruthyFlag(mapOnly ?? undefined)) return true
  }

  return isTruthyFlag(import.meta.env.VITE_MAP_DEV)
}
