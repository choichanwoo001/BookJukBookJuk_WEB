#!/usr/bin/env node
/**
 * 시나리오 refs 안내 — 표지는 book_recognition/refs/ 에 수동 관리.
 * npm run refs:demo
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REFS_DIR = join(__dirname, '..', 'book_recognition', 'refs')

const EXPECTED = [
  { file: '어른이된다는것.jpg', title: '어른이 된다는 것', authors: '우치다 타츠루' },
  { file: '오직두사람.jpg', title: '오직 두 사람', authors: '김영하' },
  { file: '단한사람.jpeg', title: '단 한 사람', authors: '최진영' },
  { file: '시선으로부터.webp', title: '시선으로부터', authors: '정세랑' },
]

let ok = 0
for (const book of EXPECTED) {
  const path = join(REFS_DIR, book.file)
  if (existsSync(path)) {
    console.log(`[ok] ${book.title} (${book.authors}) → ${book.file}`)
    ok += 1
  } else {
    console.error(`[missing] ${book.file} — ${book.title} / ${book.authors}`)
  }
}

console.log(`\n${ok}/${EXPECTED.length}권 refs/ 확인 (자동 생성 없음, README.md 참고)`)
if (ok < EXPECTED.length) process.exit(1)
