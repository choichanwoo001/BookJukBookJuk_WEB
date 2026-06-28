#!/usr/bin/env node
/**
 * 시나리오 4권 표지를 알라딘 API에서 받아 book_recognition/refs/ 에 저장.
 * npm run refs:fetch
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REFS_DIR = join(__dirname, '..', 'book_recognition', 'refs')

const ALADIN_KEY = process.env.ALADIN_TTB_KEY ?? 'ttbaracho01102229001'

/** refs 파일명 stem → 알라딘 검색어 (순서대로 시도) */
const BOOKS = [
  {
    file: '어른이된다는것.jpg',
    queries: ['어른이 된다는 것 김창진', '어른이 된다는 것 에세이스트', '어른이 된다는 것'],
    skipIfExists: true,
  },
  { file: '오직두사람.jpg', queries: ['오직 두 사람 김영하'] },
  { file: '단한사람.jpeg', queries: ['단 한 사람 최진영'] },
  { file: '너무나많은여름이.jpg', queries: ['너무나 많은 여름이 김연수'] },
]

function parseAladinJs(text) {
  const s = text.trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  return JSON.parse(s.slice(start, end + 1))
}

async function searchAladin(query) {
  const params = new URLSearchParams({
    TTBKey: ALADIN_KEY,
    Query: query,
    QueryType: 'Title',
    MaxResults: '1',
    Cover: 'Big',
    output: 'js',
    Version: '20131101',
    SearchTarget: 'Book',
  })
  const res = await fetch(`http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?${params}`)
  if (!res.ok) throw new Error(`Aladin HTTP ${res.status} for "${query}"`)
  const data = parseAladinJs(await res.text())
  const items = data?.item
  const item = Array.isArray(items) ? items[0] : items
  if (!item?.cover) throw new Error(`No cover for "${query}"`)
  return {
    title: item.title ?? query,
    author: item.author ?? '',
    isbn13: item.isbn13 ?? item.isbn ?? '',
    coverUrl: item.cover,
  }
}

async function downloadCover(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Cover download failed: ${url} (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  mkdirSync(REFS_DIR, { recursive: true })
  let ok = 0
  for (const book of BOOKS) {
    const dest = join(REFS_DIR, book.file)
    if (book.skipIfExists && existsSync(dest)) {
      console.log(`[skip] ${book.file} — 기존 파일 유지`)
      ok += 1
      continue
    }
    let saved = false
    for (const query of book.queries) {
      try {
        const meta = await searchAladin(query)
        const buf = await downloadCover(meta.coverUrl)
        writeFileSync(dest, buf)
        console.log(`[ok] ${book.file} ← "${meta.title}" / ${meta.author} (isbn=${meta.isbn13}, q="${query}")`)
        ok += 1
        saved = true
        break
      } catch (e) {
        console.warn(`[try] ${book.file} q="${query}": ${e instanceof Error ? e.message : e}`)
      }
    }
    if (!saved) {
      console.error(`[fail] ${book.file}: 모든 검색어 실패`)
    }
  }
  console.log(`\n${ok}/${BOOKS.length}권 표지 저장 → ${REFS_DIR}`)
  if (ok < BOOKS.length) process.exit(1)
}

main()
