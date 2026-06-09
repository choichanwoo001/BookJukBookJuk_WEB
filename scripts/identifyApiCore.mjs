import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REFS_DIR = join(__dirname, '..', 'book_recognition', 'refs')

const REF_CATALOG = [
  { file: '어른이된다는것.jpg', query: '어른이 된다는 것' },
  { file: '오직두사람.jpg', query: '오직 두 사람' },
  { file: '단한사람.jpeg', query: '단 한 사람' },
  { file: '시선으로부터.webp', query: '시선으로부터' },
]

const REF_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MATCH_WIDTH = 200
const MATCH_HEIGHT = 300
const MATCH_MAX_MAD = 52
const MATCH_MIN_GAP_RATIO = 0.92

let refFingerprints = []

async function fingerprintImage(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(MATCH_WIDTH, MATCH_HEIGHT, { fit: 'cover' })
    .normalize()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, length: info.width * info.height }
}

function meanAbsDiff(a, b, length) {
  let sum = 0
  const n = Math.min(length, a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    sum += Math.abs(a[i] - b[i])
  }
  return sum / n
}

export async function loadRefs() {
  const loaded = []
  for (const entry of REF_CATALOG) {
    const path = join(REFS_DIR, entry.file)
    if (!existsSync(path)) {
      console.warn(`[book-identify] refs 없음: ${entry.file}`)
      continue
    }
    const buf = readFileSync(path)
    const fp = await fingerprintImage(buf)
    loaded.push({ ...entry, path, fingerprint: fp })
  }

  if (existsSync(REFS_DIR)) {
    for (const name of readdirSync(REFS_DIR)) {
      const ext = extname(name).toLowerCase()
      if (!REF_EXTS.has(ext)) continue
      if (REF_CATALOG.some((r) => r.file === name)) continue
      const stem = name.slice(0, -ext.length)
      const path = join(REFS_DIR, name)
      const buf = readFileSync(path)
      const fp = await fingerprintImage(buf)
      loaded.push({ file: name, query: stem, path, fingerprint: fp })
    }
  }

  refFingerprints = loaded
  return loaded
}

export function getRefCount() {
  return refFingerprints.length
}

async function matchRef(imageBuffer) {
  if (refFingerprints.length === 0) return null
  const queryFp = await fingerprintImage(imageBuffer)
  const scores = refFingerprints.map((ref) => ({
    ref,
    mad: meanAbsDiff(queryFp.data, ref.fingerprint.data, queryFp.length),
  }))
  scores.sort((a, b) => a.mad - b.mad)
  const best = scores[0]
  const second = scores[1]
  if (!best || best.mad > MATCH_MAX_MAD) return null
  if (second && second.mad < best.mad * MATCH_MIN_GAP_RATIO) return null
  return best.ref
}

function parseAladinJs(text) {
  const s = text.trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return null
  return JSON.parse(s.slice(start, end + 1))
}

async function searchAladin(query) {
  const key = process.env.ALADIN_TTB_KEY?.trim() || 'ttbaracho01102229001'
  const url = new URL('http://www.aladin.co.kr/ttb/api/ItemSearch.aspx')
  url.searchParams.set('TTBKey', key)
  url.searchParams.set('Query', query)
  url.searchParams.set('QueryType', 'Title')
  url.searchParams.set('MaxResults', '1')
  url.searchParams.set('Cover', 'Big')
  url.searchParams.set('output', 'js')
  url.searchParams.set('Version', '20131101')
  url.searchParams.set('SearchTarget', 'Book')
  url.searchParams.set('CategoryId', '0')
  url.searchParams.set('start', '1')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Aladin HTTP ${res.status}`)
  const data = parseAladinJs(await res.text())
  const items = data?.item
  const it = Array.isArray(items) ? items[0] : items
  if (!it || typeof it !== 'object') {
    return { title: query, author: '', isbn13: null, price: null }
  }
  return {
    title: String(it.title ?? query),
    author: String(it.author ?? ''),
    isbn13: it.isbn13 ?? it.isbn ?? null,
    price: it.priceSales ?? it.priceStandard ?? it.price ?? null,
  }
}

function decodeBase64Image(b64) {
  let s = String(b64).trim()
  if (s.startsWith('data:') && s.includes(',')) {
    s = s.split(',', 2)[1]
  }
  return Buffer.from(s, 'base64')
}

async function identifyFromImage(imageBuffer) {
  const matched = await matchRef(imageBuffer)
  if (!matched) {
    return {
      ok: false,
      message: '책 표지를 refs와 매칭하지 못했습니다. 등록 표지를 선명하게 비춰 주세요.',
      errorCode: 'BOOK_NOT_RECOGNIZED',
    }
  }
  const book = await searchAladin(matched.query)
  return {
    ok: true,
    title: book.title,
    author: book.author || null,
    isbn13: book.isbn13 ? String(book.isbn13) : null,
    price: book.price,
    message: '인식 성공',
    errorCode: null,
  }
}

/** @param {Record<string, unknown>} body */
export async function handleIdentifyRequest(body) {
  const hint = String(body.hintText ?? '').trim()
  const hasImg = Boolean(body.imageBase64 && String(body.imageBase64).trim())

  if (!hasImg && !hint) {
    return {
      ok: false,
      message: 'imageBase64 또는 hintText 중 하나는 필요합니다.',
      errorCode: 'BAD_REQUEST',
      status: 400,
    }
  }

  if (hasImg) {
    let imageBuffer
    try {
      imageBuffer = decodeBase64Image(body.imageBase64)
      await sharp(imageBuffer).metadata()
    } catch {
      return {
        ok: false,
        message: '이미지를 디코딩할 수 없습니다.',
        errorCode: 'IMAGE_DECODE_ERROR',
        status: 200,
      }
    }
    return { ...(await identifyFromImage(imageBuffer)), status: 200 }
  }

  const book = await searchAladin(hint)
  if (!book.title && !book.isbn13) {
    return {
      ok: false,
      message: '검색 결과가 없습니다.',
      errorCode: 'HINT_NO_RESULT',
      status: 200,
    }
  }
  return {
    ok: true,
    title: book.title,
    author: book.author || null,
    isbn13: book.isbn13 ? String(book.isbn13) : null,
    price: book.price,
    message: `"${hint}"(으)로 검색했어요.`,
    errorCode: null,
    status: 200,
  }
}
