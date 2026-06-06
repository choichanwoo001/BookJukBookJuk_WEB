const LS_KEY = 'bjbj:verso-rosbridge-url'

export function readVersoRosbridgeDefaultUrl(): string {
  return import.meta.env.VITE_VERSO_ROSBRIDGE_URL?.trim() ?? ''
}

export function readStoredVersoRosbridgeUrl(): string {
  try {
    const stored = localStorage.getItem(LS_KEY)?.trim() ?? ''
    if (stored) return stored
  } catch {
    // ignore
  }
  return readVersoRosbridgeDefaultUrl()
}

export function writeStoredVersoRosbridgeUrl(url: string): void {
  try {
    const trimmed = url.trim()
    if (trimmed) {
      localStorage.setItem(LS_KEY, trimmed)
    } else {
      localStorage.removeItem(LS_KEY)
    }
  } catch {
    // ignore
  }
}
