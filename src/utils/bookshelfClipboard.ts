import {
  MAX_FIXTURE_PLAN_M,
  MIN_FIXTURE_PLAN_M,
  BOOKSHELF_DUPLICATE_MIN_OFFSET,
  BOOKSHELF_DUPLICATE_RATIO,
} from '../config/constants'
import type { FixtureRenderInstance } from '../types/scene'

export function clampFixturePlanDimension(value: number): number {
  return Math.min(MAX_FIXTURE_PLAN_M, Math.max(MIN_FIXTURE_PLAN_M, value))
}

/** Offset copy so the duplicate does not sit on top of the source. */
export function offsetDuplicateBookshelf(source: FixtureRenderInstance): FixtureRenderInstance {
  return {
    ...source,
    kind: 'bookshelf',
    cx: source.cx + Math.max(BOOKSHELF_DUPLICATE_MIN_OFFSET, source.w * BOOKSHELF_DUPLICATE_RATIO),
    cz: source.cz + Math.max(BOOKSHELF_DUPLICATE_MIN_OFFSET, source.d * BOOKSHELF_DUPLICATE_RATIO),
  }
}

/** Parse a single bookshelf from clipboard JSON (object, or array from "전체 복사"). */
export function parseBookshelfFromClipboardText(text: string): FixtureRenderInstance | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.trim())
  } catch {
    return null
  }
  if (Array.isArray(parsed) && parsed.length > 0) {
    parsed = parsed[0]
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const cx = typeof o.cx === 'number' ? o.cx : Number(o.cx)
  const cz = typeof o.cz === 'number' ? o.cz : Number(o.cz)
  const w = typeof o.w === 'number' ? o.w : Number(o.w)
  const d = typeof o.d === 'number' ? o.d : Number(o.d)
  const yaw = typeof o.yaw === 'number' ? o.yaw : Number(o.yaw)
  const h = typeof o.h === 'number' ? o.h : Number(o.h)
  if (![cx, cz, w, d, yaw, h].every(Number.isFinite)) return null
  return {
    kind: 'bookshelf',
    cx,
    cz,
    w: clampFixturePlanDimension(w),
    d: clampFixturePlanDimension(d),
    yaw,
    h: clampFixturePlanDimension(h),
  }
}
