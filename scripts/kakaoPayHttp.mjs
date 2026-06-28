import https from 'node:https'

/**
 * Node fetch(undici) rejects response headers with non-Latin-1 bytes.
 * Kakao Pay responses can include such headers; use https directly.
 */
export function postKakaoPayJson(url, secretKey, body) {
  const payload = JSON.stringify(body)
  const parsed = new URL(url)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          Authorization: `SECRET_KEY ${secretKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ statusCode: res.statusCode ?? 500, json: JSON.parse(text) })
          } catch {
            reject(new Error(text || `Kakao Pay HTTP ${res.statusCode ?? 500}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/** Header-safe secret key (Latin-1 printable ASCII only). */
export function sanitizeKakaoPaySecretKey(raw) {
  return String(raw ?? '').trim().replace(/[^\x21-\x7E]/g, '')
}

/** Kakao Pay Ready API item_name — ASCII only (body UTF-8 is fine; keep API label simple). */
export function kakaoPayApiItemName(lineItems) {
  const count = Array.isArray(lineItems) ? lineItems.length : 0
  if (count <= 0) return 'BookJuk bookstore order'
  if (count === 1) return 'BookJuk bookstore book'
  return `BookJuk bookstore books x${count}`
}

/** UI / receipt display label (Korean allowed). */
export function summarizeItemNameDisplay(lineItems) {
  const titles = lineItems.map((item) => String(item?.title ?? '').trim()).filter(Boolean)
  if (titles.length === 0) return '북죽 서점 도서'
  if (titles.length === 1) return titles[0].slice(0, 100)
  return `${titles[0].slice(0, 80)} 외 ${titles.length - 1}권`.slice(0, 100)
}
