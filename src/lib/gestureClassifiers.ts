/** MediaPipe 손 랜드마크 규칙 기반 제스처 분류 (Python gesture_classifiers.py 포트). */

export type HandLandmark = { x: number; y: number; z?: number }

export type GestureId =
  | 'stop'
  | 'follow_me'
  | 'lead_again'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'ok_sign'

const EXTEND_RATIO = 1.08
const THUMB_EXTEND_RATIO = 1.05
const OK_TOUCH_RATIO = 0.55

function dist(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function fingerExtended(lm: HandLandmark[], tipId: number, pipId: number): boolean {
  const w = lm[0]
  const tip = lm[tipId]
  const pip = lm[pipId]
  return dist(w, tip) > dist(w, pip) * EXTEND_RATIO
}

function thumbExtended(lm: HandLandmark[]): boolean {
  const w = lm[0]
  const tip = lm[4]
  const ip = lm[3]
  return dist(w, tip) > dist(w, ip) * THUMB_EXTEND_RATIO
}

function allFingers(lm: HandLandmark[]): Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', boolean> {
  return {
    thumb: thumbExtended(lm),
    index: fingerExtended(lm, 8, 6),
    middle: fingerExtended(lm, 12, 10),
    ring: fingerExtended(lm, 16, 14),
    pinky: fingerExtended(lm, 20, 18),
  }
}

function isOpenPalm(lm: HandLandmark[]): boolean {
  return Object.values(allFingers(lm)).every(Boolean)
}

function isOkSign(lm: HandLandmark[]): boolean {
  const f = allFingers(lm)
  const touch = dist(lm[4], lm[8]) < dist(lm[5], lm[17]) * OK_TOUCH_RATIO
  return touch && f.middle && f.ring && f.pinky
}

function isThumbPoseBase(lm: HandLandmark[]): boolean {
  const f = allFingers(lm)
  return f.thumb && !f.index && !f.middle && !f.ring && !f.pinky
}

function isThumbsUp(lm: HandLandmark[]): boolean {
  if (!isThumbPoseBase(lm)) return false
  return lm[4].y < lm[3].y && lm[4].y < lm[0].y
}

function isThumbsDown(lm: HandLandmark[]): boolean {
  if (!isThumbPoseBase(lm)) return false
  return lm[4].y > lm[3].y && lm[4].y > lm[0].y
}

function isLeadAgain(lm: HandLandmark[]): boolean {
  const f = allFingers(lm)
  if (!(f.index && f.thumb)) return false
  if (f.middle || f.ring || f.pinky) return false
  const touch = dist(lm[4], lm[8]) < dist(lm[5], lm[17]) * OK_TOUCH_RATIO
  return !touch
}

function isFist(lm: HandLandmark[]): boolean {
  const f = allFingers(lm)
  return !Object.values(f).some(Boolean)
}

export function classifyOneHandGesture(lm: HandLandmark[]): GestureId | null {
  if (isOpenPalm(lm)) return 'stop'
  if (isThumbsUp(lm)) return 'thumbs_up'
  if (isThumbsDown(lm)) return 'thumbs_down'
  if (isOkSign(lm)) return 'ok_sign'
  if (isLeadAgain(lm)) return 'lead_again'
  if (isFist(lm)) return 'follow_me'
  return null
}

export const GESTURE_CONFIRM_FRAMES = 15
export const GESTURE_COOLDOWN_FRAMES = 45

export const GESTURE_LABELS_KO: Record<GestureId, string> = {
  stop: '정지 (손 펼침)',
  follow_me: '나 따라와 (주먹)',
  lead_again: '다시 리드 (검지+엄지 ㄴ)',
  thumbs_up: '엄지 올림 (담기)',
  thumbs_down: '엄지 내림 (빼기)',
  ok_sign: 'OK 사인',
}
