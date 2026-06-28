import { existsSync, readdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REFS_DIR = join(__dirname, '..', 'book_recognition', 'refs')

const REF_CATALOG = [
  { file: '어른이된다는것.jpg', query: '어른이 된다는 것' },
  { file: '오직두사람.jpg', query: '오직 두 사람' },
  { file: '단한사람.jpeg', query: '단 한 사람' },
  { file: '너무나많은여름이.jpg', query: '너무나 많은 여름이' },
]

const REF_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

let refs = []

export async function loadRefs() {
  const loaded = []
  for (const entry of REF_CATALOG) {
    const path = join(REFS_DIR, entry.file)
    if (!existsSync(path)) {
      console.warn(`[book-identify] refs 없음: ${entry.file}`)
      continue
    }
    loaded.push({ ...entry, path })
  }

  if (existsSync(REFS_DIR)) {
    for (const name of readdirSync(REFS_DIR)) {
      const ext = extname(name).toLowerCase()
      if (!REF_EXTS.has(ext)) continue
      if (REF_CATALOG.some((r) => r.file === name)) continue
      const stem = name.slice(0, -ext.length)
      loaded.push({ file: name, query: stem, path: join(REFS_DIR, name) })
    }
  }

  refs = loaded
  return loaded
}

export function getRefCount() {
  return refs.length
}
