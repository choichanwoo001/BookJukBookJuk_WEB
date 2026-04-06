import { Color } from 'three'

export function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(cx: number, cz: number, ...rest: number[]) {
  let h = Math.imul(cx * 1000, 31) ^ Math.imul(cz * 1000, 17)
  for (const r of rest) h = Math.imul(h ^ r, 0x9e3779b9)
  return h >>> 0
}

export function bookColorHex(seed: number): string {
  const rnd = mulberry32(seed)
  const c = new Color().setHSL(rnd(), 0.42 + rnd() * 0.28, 0.36 + rnd() * 0.22)
  return `#${c.getHexString()}`
}
