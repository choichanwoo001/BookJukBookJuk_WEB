/**
 * DB 시드: `bookshelves` upsert + `books.shelf_id` / `books.shelf_level` 배치.
 * - 섹터별 책 → 해당 섹터 책장들에 라운드로빈(shelf_id).
 * - 같은 책장에 배정된 책들 → 그 책장의 levels(기본 5)에 라운드로빈(shelf_level, 1=최하단).
 *
 * 사용: 프로젝트 루트에서 `npm run seed:book-shelf` 또는 `npx tsx scripts/seedBookShelfId.ts`
 * 미리보기만: `--dry-run` (PATCH/bookshelves upsert 없이 통계·매핑 출력; 단수는 로컬 기본 5)
 * 필요:
 * - VITE_SUPABASE_URL
 * - 실제 DB 반영(기본): SUPABASE_SERVICE_ROLE_KEY — `bookshelves` upsert·`books` PATCH 는 RLS 때문에 anon 키 불가
 * - 미리보기(--dry-run): VITE_SUPABASE_PUBLISHABLE_KEY 로 books 조회 가능하면 충분
 *
 * DB 마이그레이션 (`db/migrations/202605040000*.sql`) 적용 후 실행하는 것을 권장한다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DISPLAY_SHELF_IDS } from '../src/data/displayShelfOverrides'
import { SHELF_SECTOR_ASSIGNMENTS } from '../src/data/shelfSectorAssignments'
import { assignBooksToShelvesRoundRobin, assignLevelsRoundRobin } from '../src/utils/bookShelfDistribution'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const DEFAULT_LEVELS = 5
const ACTIVE_SHELF_SECTOR_ASSIGNMENTS = SHELF_SECTOR_ASSIGNMENTS.filter(
  (row) => !DISPLAY_SHELF_IDS.has(row.id),
)

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

type BookshelfLevelsRow = { id: string; levels: number }

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

async function fetchBookshelvesLevels(baseUrl: string, key: string): Promise<Map<string, number>> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/bookshelves?select=id,levels`
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`bookshelves fetch failed ${res.status}: ${t}`)
  }
  const data = (await res.json()) as BookshelfLevelsRow[]
  return new Map(data.map((r) => [r.id, r.levels]))
}

async function upsertBookshelves(baseUrl: string, key: string): Promise<void> {
  const rows = ACTIVE_SHELF_SECTOR_ASSIGNMENTS.map((r) => ({
    id: r.id,
    sector: r.sector,
    cx: r.cx,
    cy: 0,
    cz: r.cz,
    w: r.w,
    d: r.d,
    yaw: r.yaw,
    levels: DEFAULT_LEVELS,
  }))
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/bookshelves`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`bookshelves upsert failed ${res.status}: ${t}`)
  }
}

async function patchBookShelfPlacement(
  baseUrl: string,
  key: string,
  bookId: string,
  shelfId: string,
  shelfLevel: number,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/books?id=eq.${encodeURIComponent(bookId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ shelf_id: shelfId, shelf_level: shelfLevel }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`PATCH ${bookId} failed ${res.status}: ${t}`)
  }
}

function defaultLevelsByShelfId(): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of ACTIVE_SHELF_SECTOR_ASSIGNMENTS) {
    m.set(r.id, DEFAULT_LEVELS)
  }
  return m
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const envFile = loadDotEnv()
  const baseUrl = process.env.VITE_SUPABASE_URL ?? envFile.VITE_SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? envFile.SUPABASE_SERVICE_ROLE_KEY
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? envFile.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!baseUrl) {
    console.error('Missing VITE_SUPABASE_URL (.env 또는 환경변수)')
    process.exit(1)
  }

  const keyDryRun = publishableKey ?? serviceRoleKey

  if (dryRun) {
    if (!keyDryRun) {
      console.error(
        'Missing key: set VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY for --dry-run',
      )
      process.exit(1)
    }
  } else if (!serviceRoleKey) {
    console.error(
      [
        'SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.',
        'bookshelves upsert / books PATCH 는 Row Level Security 때문에 anon(발행용) 키로는 실패합니다.',
        'Supabase Dashboard → Settings → API → service_role 키를 .env 에 넣은 뒤 다시 실행하세요.',
      ].join('\n'),
    )
    process.exit(1)
  }

  const key = dryRun ? keyDryRun! : serviceRoleKey!

  const shelvesBySector = new Map<number, string[]>()
  for (const row of ACTIVE_SHELF_SECTOR_ASSIGNMENTS) {
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

  let levelsByShelf = defaultLevelsByShelfId()
  if (!dryRun) {
    console.log('Upserting bookshelves...')
    await upsertBookshelves(baseUrl, key)
    levelsByShelf = await fetchBookshelvesLevels(baseUrl, key)
    for (const r of ACTIVE_SHELF_SECTOR_ASSIGNMENTS) {
      if (!levelsByShelf.has(r.id)) {
        levelsByShelf.set(r.id, DEFAULT_LEVELS)
      }
    }
  }

  const books = await fetchAllBooks(baseUrl, key)
  const noSector = books.filter((b) => b.sector == null || Number.isNaN(b.sector as number))
  if (noSector.length) {
    console.warn(`Warning: ${noSector.length} books with null/invalid sector (placement will not be assigned here)`)
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

  const booksByShelf = new Map<string, string[]>()
  for (const [bid, sid] of shelfByBook) {
    const arr = booksByShelf.get(sid) ?? []
    arr.push(bid)
    booksByShelf.set(sid, arr)
  }
  for (const arr of booksByShelf.values()) {
    arr.sort((a, b) => a.localeCompare(b))
  }

  const levelByBook = new Map<string, number>()
  for (const [sid, bookIds] of booksByShelf) {
    const levels = levelsByShelf.get(sid) ?? DEFAULT_LEVELS
    const m = assignLevelsRoundRobin(bookIds, levels)
    for (const [bid, lvl] of m) levelByBook.set(bid, lvl)
  }

  if (dryRun) {
    console.log('\n=== dry-run: shelf + shelf_level preview (no DB writes) ===\n')
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

    const perLevel = new Map<number, number>()
    for (const lvl of levelByBook.values()) {
      perLevel.set(lvl, (perLevel.get(lvl) ?? 0) + 1)
    }
    console.log('\nTarget shelf_level counts (1 = lowest tier):')
    for (const lvl of [...perLevel.keys()].sort((a, b) => a - b)) {
      console.log(`  level ${lvl}: ${perLevel.get(lvl)} books`)
    }

    const perShelfLevel = new Map<string, Map<number, number>>()
    for (const [bid, sid] of shelfByBook) {
      const lvl = levelByBook.get(bid)
      if (lvl == null) continue
      let inner = perShelfLevel.get(sid)
      if (!inner) {
        inner = new Map()
        perShelfLevel.set(sid, inner)
      }
      inner.set(lvl, (inner.get(lvl) ?? 0) + 1)
    }
    console.log('\nPer shelf × level (book counts):')
    for (const sid of [...perShelfLevel.keys()].sort()) {
      const inner = perShelfLevel.get(sid)!
      const parts = [...inner.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lv, c]) => `L${lv}:${c}`)
      console.log(`  ${sid}: ${parts.join(', ')}`)
    }

    console.log('\nFull mapping (book id → shelf_id, shelf_level):')
    const lines = [...shelfByBook.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [bid, sid] of lines) {
      const lv = levelByBook.get(bid) ?? '?'
      console.log(`  ${bid} → ${sid}, level ${lv}`)
    }
    console.log(`\nTotal with placement: ${shelfByBook.size} / DB rows fetched: ${books.length}`)
    return
  }

  console.log(`Updating ${shelfByBook.size} books (shelf_id + shelf_level)...`)
  let ok = 0
  for (const [bookId, shelfId] of shelfByBook) {
    const shelfLevel = levelByBook.get(bookId)
    if (shelfLevel == null) {
      console.warn(`Skip ${bookId}: missing shelf_level`)
      continue
    }
    await patchBookShelfPlacement(baseUrl, key, bookId, shelfId, shelfLevel)
    ok++
    if (ok % 50 === 0) console.log(`  ... ${ok}`)
  }
  console.log(`Done. Patched ${ok} rows.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
