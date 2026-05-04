import type { FixtureRenderInstance } from '../types/scene'

export type VirtualDisplayBook = {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  yaw: number
}

function fnv1aHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * 진열대 상판 위 가상 책 배치.
 * - 행(level) 개념 없이 상판 슬롯 기반으로만 생성
 * - shelfId를 seed로 써서 재실행 시 동일 배치 유지
 */
export function buildVirtualTopBooks(
  inst: Pick<FixtureRenderInstance, 'shelfId' | 'w' | 'd' | 'h'>,
): VirtualDisplayBook[] {
  const idSeed = inst.shelfId ?? `${inst.w.toFixed(3)}_${inst.d.toFixed(3)}_${inst.h.toFixed(3)}`
  const rand = mulberry32(fnv1aHash(idSeed))

  const marginX = 0.12
  const marginZ = 0.1
  const usableW = Math.max(0.2, inst.w - marginX * 2)
  const usableD = Math.max(0.18, inst.d - marginZ * 2)
  const laneDepth = 0.17
  const laneGap = 0.06
  const slotWidth = 0.055
  const slotGap = 0.02
  const laneCount = Math.max(1, Math.floor((usableD + laneGap) / (laneDepth + laneGap)))
  const slotCount = Math.max(2, Math.floor((usableW + slotGap) / (slotWidth + slotGap)))
  const bookCount = clamp(Math.floor(slotCount * laneCount * 0.82), 3, 180)

  const out: VirtualDisplayBook[] = []
  for (let lane = 0; lane < laneCount; lane++) {
    const zBase = -usableD * 0.5 + laneDepth * 0.5 + lane * (laneDepth + laneGap)
    for (let slot = 0; slot < slotCount; slot++) {
      if (out.length >= bookCount) break
      if (rand() < 0.12) continue

      const xBase = -usableW * 0.5 + slotWidth * 0.5 + slot * (slotWidth + slotGap)
      const w = 0.028 + rand() * 0.034
      const h = 0.18 + rand() * 0.14
      const d = 0.12 + rand() * 0.07
      const lean = (rand() - 0.5) * 0.18
      out.push({
        x: xBase + (rand() - 0.5) * 0.016,
        z: zBase + (rand() - 0.5) * 0.014,
        y: inst.h + h * 0.5 + 0.008,
        w,
        h,
        d,
        yaw: lean,
      })
    }
    if (out.length >= bookCount) break
  }
  return out
}
