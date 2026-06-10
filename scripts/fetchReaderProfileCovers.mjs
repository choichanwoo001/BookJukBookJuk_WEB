#!/usr/bin/env node
/**
 * readerProfiles.ts 에서 coverUrl 없는 책을 Aladin ItemSearch로 조회해 coverUrl 을 채웁니다.
 * npm run covers:reader
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchAladin } from './identifyApiCore.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const READER_PROFILES_PATH = join(__dirname, '..', 'src', 'data', 'readerProfiles.ts')
const DELAY_MS = 250

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeText(input) {
  return input
    .toLowerCase()
    .replace(/[\s\-_~.,!?()[\]{}'"`]/g, '')
    .trim()
}

function titleMatches(expected, actual) {
  const a = normalizeText(expected)
  const b = normalizeText(actual)
  if (!a || !b) return false
  return b.includes(a) || a.includes(b)
}

function authorMatches(expected, actual) {
  const exp = normalizeText(expected)
  const act = normalizeText(actual)
  if (!exp || !act) return false
  if (act.includes(exp) || exp.includes(act)) return true
  const surname = expected.trim().slice(0, 1)
  return surname.length > 0 && act.includes(normalizeText(surname))
}

/** @typedef {{ id: string, title: string, author: string, hasCover: boolean }} BookRef */

/** @returns {BookRef[]} */
function collectBooksWithoutCover(content) {
  /** @type {BookRef[]} */
  const books = []
  const blockRe = /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:\\'|[^'])*)',\s*author:\s*'((?:\\'|[^'])*)',([\s\S]*?)\n\s*\}/g
  let match
  while ((match = blockRe.exec(content)) !== null) {
    const [, id, title, author, rest] = match
    const hasCover = /coverUrl\s*:/.test(rest)
    if (!hasCover) {
      books.push({ id, title, author, hasCover: false })
    }
  }
  return books
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} content
 * @param {string} bookId
 * @param {string} coverUrl
 */
function insertCoverUrl(content, bookId, coverUrl) {
  const idPattern = new RegExp(
    `(id:\\s*'${escapeRegExp(bookId)}',\\s*\\n\\s*title:\\s*'(?:\\\\'|[^'])*',\\s*\\n\\s*author:\\s*'(?:\\\\'|[^'])*',)`,
  )
  if (!idPattern.test(content)) {
    throw new Error(`id '${bookId}' 블록을 찾지 못했습니다.`)
  }
  const blockCheck = new RegExp(
    `id:\\s*'${escapeRegExp(bookId)}'[\\s\\S]*?coverUrl\\s*:`,
  )
  if (blockCheck.test(content)) {
    return content
  }
  const escapedCover = coverUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const indent = content.slice(0, content.search(idPattern)).split('\n').pop()?.match(/^\s*/)?.[0] ?? ''
  const coverIndent = `${indent}  `
  return content.replace(idPattern, `$1\n${coverIndent}coverUrl: '${escapedCover}',`)
}

async function main() {
  let content = readFileSync(READER_PROFILES_PATH, 'utf8')
  const targets = collectBooksWithoutCover(content)

  if (targets.length === 0) {
    console.log('[covers:reader] coverUrl 없는 책이 없습니다.')
    return
  }

  console.log(`[covers:reader] ${targets.length}권 조회 시작…`)

  let updated = 0
  let skipped = 0

  for (const book of targets) {
    await sleep(DELAY_MS)
    const result = await searchAladin(book.title)
    const cover = result.cover?.trim() ?? ''

    if (!cover) {
      console.warn(`[skip] ${book.id} "${book.title}" — Aladin cover 없음`)
      skipped += 1
      continue
    }

    if (!titleMatches(book.title, result.title)) {
      console.warn(
        `[warn] ${book.id} "${book.title}" — 제목 불일치 (Aladin: "${result.title}"), cover만 적용`,
      )
    } else if (!authorMatches(book.author, result.author)) {
      console.warn(
        `[warn] ${book.id} "${book.title}" — 저자 불일치 (기대: ${book.author}, Aladin: ${result.author}), cover만 적용`,
      )
    }

    content = insertCoverUrl(content, book.id, cover)
    updated += 1
    console.log(`[ok] ${book.id} "${book.title}" → ${cover}`)
  }

  writeFileSync(READER_PROFILES_PATH, content, 'utf8')
  console.log(`\n[covers:reader] 완료: ${updated}권 갱신, ${skipped}권 스킵`)
  if (skipped > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[covers:reader] 실패:', err)
  process.exit(1)
})
