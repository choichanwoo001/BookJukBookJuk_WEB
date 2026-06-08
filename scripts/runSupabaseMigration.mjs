import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sqlPath = resolve(root, 'supabase', 'migrate_once.sql')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(root, '.env'))

const dbUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() || ''

if (!existsSync(sqlPath)) {
  console.error(`[db:migrate] SQL file not found: ${sqlPath}`)
  process.exit(1)
}

if (!dbUrl) {
  console.error('[db:migrate] DATABASE_URL (or SUPABASE_DB_URL) is not set.')
  console.error('')
  console.error('Supabase Dashboard → Project Settings → Database → Connection string (URI)')
  console.error('Add to .env:')
  console.error('  DATABASE_URL=postgresql://postgres.[ref]:[password]@...supabase.com:5432/postgres')
  console.error('')
  console.error('Or paste supabase/migrate_once.sql into SQL Editor and run manually (recommended).')
  process.exit(1)
}

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (psql.error) {
  console.error('[db:migrate] psql failed to start. Install PostgreSQL client (psql) or use SQL Editor.')
  console.error(psql.error.message)
  process.exit(1)
}

process.exit(psql.status ?? 1)
