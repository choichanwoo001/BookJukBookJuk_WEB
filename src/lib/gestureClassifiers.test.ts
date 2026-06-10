import { describe, expect, it } from 'vitest'
import { classifyOneHandGesture, type HandLandmark } from './gestureClassifiers'

function pt(x: number, y: number): HandLandmark {
  return { x, y }
}

function fullLm(
  wrist: HandLandmark,
  thumbTip: HandLandmark,
  indexTip: HandLandmark,
  middleTip: HandLandmark,
  ringTip: HandLandmark,
  pinkyTip: HandLandmark,
  joints: Partial<Record<'thumbIp' | 'indexPip' | 'middlePip' | 'ringPip' | 'pinkyPip', HandLandmark>> = {},
): HandLandmark[] {
  const pts: HandLandmark[] = Array.from({ length: 21 }, () => pt(0, 0))
  pts[0] = wrist
  pts[3] = joints.thumbIp ?? pt(wrist.x + 0.02, wrist.y + 0.02)
  pts[4] = thumbTip
  pts[5] = pt(wrist.x + 0.04, wrist.y)
  pts[6] = joints.indexPip ?? pt(wrist.x + 0.04, wrist.y - 0.04)
  pts[8] = indexTip
  pts[9] = pt(wrist.x + 0.05, wrist.y)
  pts[10] = joints.middlePip ?? pt(wrist.x + 0.05, wrist.y - 0.04)
  pts[12] = middleTip
  pts[13] = pt(wrist.x + 0.06, wrist.y)
  pts[14] = joints.ringPip ?? pt(wrist.x + 0.06, wrist.y - 0.03)
  pts[16] = ringTip
  pts[17] = pt(wrist.x + 0.07, wrist.y)
  pts[18] = joints.pinkyPip ?? pt(wrist.x + 0.07, wrist.y - 0.02)
  pts[20] = pinkyTip
  return pts
}

describe('classifyOneHandGesture', () => {
  it('classifies open palm as stop', () => {
    const w = pt(0.5, 0.7)
    const far = pt(0.5, 0.2)
    const lm = fullLm(w, far, far, far, far, far)
    expect(classifyOneHandGesture(lm)).toBe('stop')
  })

  it('classifies fist as follow_me', () => {
    const w = pt(0.5, 0.7)
    const tip = pt(0.502, 0.698)
    const joint = pt(0.5, 0.45)
    const lm = fullLm(w, tip, tip, tip, tip, tip, {
      thumbIp: joint,
      indexPip: joint,
      middlePip: joint,
      ringPip: joint,
      pinkyPip: joint,
    })
    expect(classifyOneHandGesture(lm)).toBe('follow_me')
  })

  it('classifies L-shape as lead_again', () => {
    const w = pt(0.5, 0.7)
    const lm = fullLm(
      w,
      pt(0.42, 0.68),
      pt(0.5, 0.35),
      pt(0.52, 0.68),
      pt(0.54, 0.68),
      pt(0.56, 0.68),
      {
        thumbIp: pt(0.46, 0.68),
        indexPip: pt(0.5, 0.55),
        middlePip: pt(0.52, 0.66),
        ringPip: pt(0.54, 0.66),
        pinkyPip: pt(0.56, 0.66),
      },
    )
    expect(classifyOneHandGesture(lm)).toBe('lead_again')
  })
})
