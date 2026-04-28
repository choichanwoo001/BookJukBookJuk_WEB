export type BookRecognitionResult = {
  ok: boolean
  title?: string
  author?: string
  isbn13?: string
  price?: number | string
  message: string
  errorCode?: string
}

export type IdentifyBookPayload = {
  reason: 'add' | 'remove'
  hintText?: string
  imageBase64?: string
}

type HostBridge = {
  identifyBook: (payload: IdentifyBookPayload) => Promise<BookRecognitionResult>
}

declare global {
  interface Window {
    __BOOK_RECOGNITION_BRIDGE__?: HostBridge
  }
}

export interface IBookRecognitionClient {
  identifyBook(payload: IdentifyBookPayload): Promise<BookRecognitionResult>
}

const TIMEOUT_MS = 7000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isRetryableHttpResult(r: BookRecognitionResult): boolean {
  const c = r.errorCode ?? ''
  return c === 'HTTP_UNREACHABLE' || c === 'HTTP_CLIENT_ERROR' || c === 'BRIDGE_TIMEOUT'
}

class LocalProcessBridgeClient implements IBookRecognitionClient {
  async identifyBook(payload: IdentifyBookPayload): Promise<BookRecognitionResult> {
    const host = window.__BOOK_RECOGNITION_BRIDGE__
    if (!host?.identifyBook) {
      return {
        ok: false,
        message:
          '로컬 book_recognition 브리지가 연결되지 않았습니다. 호스트에서 __BOOK_RECOGNITION_BRIDGE__.identifyBook 을 주입해주세요.',
        errorCode: 'BRIDGE_NOT_CONNECTED',
      }
    }

    try {
      return await Promise.race([
        host.identifyBook(payload),
        new Promise<BookRecognitionResult>((resolve) => {
          window.setTimeout(() => {
            resolve({
              ok: false,
              message: '책 인식 시간이 초과되었습니다.',
              errorCode: 'BRIDGE_TIMEOUT',
            })
          }, TIMEOUT_MS)
        }),
      ])
    } catch {
      return {
        ok: false,
        message: '로컬 프로세스 호출에 실패했습니다.',
        errorCode: 'BRIDGE_PROCESS_ERROR',
      }
    }
  }
}

function normalizeResult(data: Record<string, unknown> | null): BookRecognitionResult {
  if (!data) {
    return { ok: false, message: '응답이 비어 있어요.', errorCode: 'EMPTY_JSON' }
  }
  return {
    ok: Boolean(data.ok),
    title: data.title as string | undefined,
    author: data.author as string | undefined,
    isbn13: data.isbn13 as string | undefined,
    price: (data.price as string | number | undefined) ?? undefined,
    message: String(data.message ?? '알 수 없는 응답'),
    errorCode: data.errorCode as string | undefined,
  }
}

class HttpBookRecognitionClient implements IBookRecognitionClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async identifyBook(payload: IdentifyBookPayload): Promise<BookRecognitionResult> {
    const base = this.baseUrl.replace(/\/$/, '')
    const url = `${base}/identify`

    const attempt = async (): Promise<BookRecognitionResult> => {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: payload.reason,
            hintText: payload.hintText,
            imageBase64: payload.imageBase64,
          }),
          signal: controller.signal,
        })
        const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null
        if (!res.ok) {
          const fastApiDetail = raw && typeof (raw as { detail?: unknown }).detail === 'string'
            ? String((raw as { detail: string }).detail)
            : null
          const message =
            (typeof raw?.message === 'string' ? String(raw.message) : null) ||
            fastApiDetail ||
            res.statusText
          const statusErrorCode = res.status === 502 ? 'HTTP_BAD_GATEWAY' : `HTTP_${res.status}`
          return {
            ok: false,
            message: `HTTP ${res.status}: ${message}`,
            errorCode: (raw?.errorCode as string | undefined) ?? statusErrorCode,
          }
        }
        return normalizeResult(raw)
      } finally {
        window.clearTimeout(timer)
      }
    }

    try {
      const first = await attempt()
      if (first.ok || !isRetryableHttpResult(first)) {
        return first
      }
      await sleep(400)
      const second = await attempt()
      return second.ok ? second : first
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === 'AbortError') {
          return {
            ok: false,
            message: '책 인식 시간이 초과되었습니다.',
            errorCode: 'BRIDGE_TIMEOUT',
          }
        }
        if (e.message.includes('Failed to fetch') || e.name === 'TypeError') {
          return {
            ok: false,
            message: 'HTTP identify 서버에 연결할 수 없어요. uvicorn이 127.0.0.1:8787에서 실행 중인지 확인하세요.',
            errorCode: 'HTTP_UNREACHABLE',
          }
        }
        return { ok: false, message: e.message, errorCode: 'HTTP_CLIENT_ERROR' }
      }
      return { ok: false, message: 'HTTP 호출에 실패했어요.', errorCode: 'HTTP_UNREACHABLE' }
    }
  }
}

/** HTTP 우선, `HTTP_UNREACHABLE` / `HTTP_CLIENT_ERROR` 시 window 브리지로 재시도 */
class HttpWithWindowFallbackClient implements IBookRecognitionClient {
  private http: HttpBookRecognitionClient
  private local: LocalProcessBridgeClient

  constructor(http: HttpBookRecognitionClient, local: LocalProcessBridgeClient) {
    this.http = http
    this.local = local
  }

  async identifyBook(payload: IdentifyBookPayload): Promise<BookRecognitionResult> {
    const r = await this.http.identifyBook(payload)
    const retryCodes = new Set(['HTTP_UNREACHABLE', 'HTTP_CLIENT_ERROR'])
    if (!r.errorCode || !retryCodes.has(r.errorCode)) {
      return r
    }
    if (!window.__BOOK_RECOGNITION_BRIDGE__?.identifyBook) {
      return r
    }
    const l = await this.local.identifyBook(payload)
    if (l.errorCode === 'BRIDGE_NOT_CONNECTED') {
      return r
    }
    return l
  }
}

let defaultClient: IBookRecognitionClient | null = null

function buildClient(): IBookRecognitionClient {
  const mode = import.meta.env.VITE_BOOK_RECOGNITION_MODE
  if (mode === 'window') {
    return new LocalProcessBridgeClient()
  }

  const base =
    import.meta.env.VITE_BOOK_RECOGNITION_API_BASE?.trim() || '/book-recognition'
  const http = new HttpBookRecognitionClient(base)

  if (mode === 'http_only') {
    return http
  }

  return new HttpWithWindowFallbackClient(http, new LocalProcessBridgeClient())
}

export function getBookRecognitionClient(): IBookRecognitionClient {
  if (!defaultClient) {
    defaultClient = buildClient()
  }
  return defaultClient
}
