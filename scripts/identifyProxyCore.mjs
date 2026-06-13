import { spawn } from 'node:child_process'

export const PYTHON_ORB_UNAVAILABLE = {
  ok: false,
  message: 'Python ORB 책 인식 API에 연결할 수 없습니다.',
  errorCode: 'PYTHON_ORB_API_UNAVAILABLE',
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function sendJson(res, status, body) {
  const { status: _drop, ...payload } = body
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export async function proxyIdentifyToPython(baseUrl, body) {
  const res = await fetch(`${baseUrl}/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  })
  const text = await res.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = {
      ok: false,
      message: text || `Python ORB API HTTP ${res.status}`,
      errorCode: `HTTP_${res.status}`,
    }
  }
  return { status: res.status, payload }
}

export function createPythonApiClient({
  host,
  port,
  cwd,
  disabled = false,
  stdio = 'inherit',
  onStdout,
  onStderr,
  onExit,
  onReadyExisting,
  onReadyStarted,
  onStartFailed,
  killOnProcessExit = false,
}) {
  const baseUrl = `http://${host}:${port}`

  async function isReady() {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(800) })
      return res.ok
    } catch {
      return false
    }
  }

  async function waitForReady(timeoutMs = 8000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (await isReady()) return true
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  async function ensure() {
    if (disabled) return false
    if (await isReady()) {
      onReadyExisting?.(baseUrl)
      return true
    }

    const python = process.env.PYTHON ?? 'python'
    const child = spawn(
      python,
      [
        '-m',
        'uvicorn',
        'book_recognition.api_server:app',
        '--host',
        host,
        '--port',
        String(port),
      ],
      { cwd, stdio, windowsHide: true },
    )

    child.stdout?.on('data', (chunk) => onStdout?.(chunk))
    child.stderr?.on('data', (chunk) => onStderr?.(chunk))
    child.on('exit', (code, signal) => onExit?.(code, signal))

    const ready = await waitForReady()
    if (ready) {
      if (killOnProcessExit) process.once('exit', () => child.kill())
      onReadyStarted?.(baseUrl, child)
      return true
    }

    child.kill()
    onStartFailed?.()
    return false
  }

  return {
    baseUrl,
    ensure,
    isReady,
    proxyIdentify: (body) => proxyIdentifyToPython(baseUrl, body),
  }
}
