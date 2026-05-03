/**
 * DB books.shelf_id 시드: SHELF_SECTOR_ASSIGNMENTS 기준으로 섹터별 책장에 라운드로빈 배치.
 *
 * 사용: 프로젝트 루트에서 `npx tsx scripts/seedBookShelfId.ts`
 * 미리보기만: `npx tsx scripts/seedBookShelfId.ts --dry-run` (PATCH 없이 통계·매핑 출력)
 * 필요: .env 의 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (service_role 가능)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SHELF_SECTOR_ASSIGNMENTS } from '../src/data/shelfSectorAssignments'
import { assignBooksToShelvesRoundRobin } from '../src/utils/bookShelfDistribution'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadDotEnv(): Record<string, string> {
  const envPath = path.join(root, '.env')
  const out: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return out
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

type BookRow = { id: string; sector: number | null }

async function fetchAllBooks(baseUrl: string, key: string): Promise<BookRow[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/books?select=id,sector&order=id.asc`
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`books fetch failed ${res.status}: ${t}`)
  }
  const data = (await res.json()) as BookRow[]
  return data
}

async function patchBookShelfId(baseUrl: string, key: string, bookId: string, shelfId: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/books?id=eq.${encodeURIComponent(bookId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ shelf_id: shelfId }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`PATCH ${bookId} failed ${res.status}: ${t}`)
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const envFile = loadDotEnv()
  const baseUrl = process.env.VITE_SUPABASE_URL ?? envFile.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? envFile.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!baseUrl || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (.env 또는 환경변수)')
    process.exit(1)
  }

  const shelvesBySector = new Map<number, string[]>()
  for (const row of SHELF_SECTOR_ASSIGNMENTS) {
    const sec = row.sector
    if (typeof sec !== 'number' || sec < 0 || sec > 9) {
      console.error(`Invalid sector for ${row.id}: ${sec}`)
      process.exit(1)
    }
    const arr = shelvesBySector.get(sec) ?? []
    arr.push(row.id)
    shelvesBySector.set(sec, arr)
  }
  for (let s = 0; s <= 9; s++) {
    const arr = shelvesBySector.get(s)
    if (!arr || arr.length === 0) {
      console.error(`No shelves assigned to sector ${s} in SHELF_SECTOR_ASSIGNMENTS`)
      process.exit(1)
    }
    arr.sort((a, b) => a.localeCompare(b))
  }

  const books = await fetchAllBooks(baseUrl, key)
  const noSector = books.filter((b) => b.sector == null || Number.isNaN(b.sector as number))
  if (noSector.length) {
    console.warn(`Warning: ${noSector.length} books with null/invalid sector (shelf_id will not be assigned here)`)
  }

  const bySector = new Map<number, string[]>()
  for (const b of books) {
    if (b.sector == null || typeof b.sector !== 'number') continue
    const sec = b.sector
    const arr = bySector.get(sec) ?? []
    arr.push(b.id)
    bySector.set(sec, arr)
  }
  for (let s = 0; s <= 9; s++) {
    const ids = bySector.get(s)
    if (!ids || ids.length === 0) {
      console.warn(`Warning: no books with sector ${s}`)
      continue
    }
    ids.sort((a, b) => a.localeCompare(b))
  }

  const shelfByBook = new Map<string, string>()
  for (let s = 0; s <= 9; s++) {
    const bookIds = bySector.get(s)
    const shelfIds = shelvesBySector.get(s)
    if (!bookIds?.length || !shelfIds?.length) continue
    const m = assignBooksToShelvesRoundRobin(bookIds, shelfIds)
    for (const [bid, sid] of m) shelfByBook.set(bid, sid)
  }

  if (dryRun) {
    console.log('\n=== dry-run: shelf assignment preview (no DB writes) ===\n')
    console.log('Books per sector (assigned):')
    for (let s = 0; s <= 9; s++) {
      const n = bySector.get(s)?.length ?? 0
      const shelfCount = shelvesBySector.get(s)?.length ?? 0
      console.log(`  sector ${s}: ${n} books → ${shelfCount} shelves (round-robin)`)
    }
    const perShelf = new Map<string, number>()
    for (const sid of shelfByBook.values()) {
      perShelf.set(sid, (perShelf.get(sid) ?? 0) + 1)
    }
    console.log('\nTarget shelf_id counts after assignment:')
    for (const sid of [...perShelf.keys()].sort()) {
      console.log(`  ${sid}: ${perShelf.get(sid)} books`)
    }
    console.log('\nFull mapping (book id → shelf_id):')
    const lines = [...shelfByBook.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [bid, sid] of lines) {
      console.log(`  ${bid} → ${sid}`)
    }
    console.log(`\nTotal with shelf assignment: ${shelfByBook.size} / DB rows fetched: ${books.length}`)
    return
  }

  console.log(`Updating ${shelfByBook.size} books...`)
  let ok = 0
  for (const [bookId, shelfId] of shelfByBook) {
    await patchBookShelfId(baseUrl, key, bookId, shelfId)
    ok++
    if (ok % 50 === 0) console.log(`  ... ${ok}`)
  }
  console.log(`Done. Patched ${ok} rows.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
