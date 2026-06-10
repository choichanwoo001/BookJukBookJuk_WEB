import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBookRecognitionClient,
  setBookRecognitionClientForTests,
  type IBookRecognitionClient,
} from './bookRecognitionBridge'

describe('bookRecognitionBridge', () => {
  afterEach(() => {
    setBookRecognitionClientForTests(null)
    vi.unstubAllGlobals()
  })

  it('uses injected client for identifyBook', async () => {
    const identifyBook = vi.fn().mockResolvedValue({
      ok: true,
      title: '미움받을 용기',
      message: '인식 성공',
    })
    const mock: IBookRecognitionClient = { identifyBook }
    setBookRecognitionClientForTests(mock)

    const result = await getBookRecognitionClient().identifyBook({
      reason: 'add',
      imageBase64: 'abc',
    })

    expect(result.ok).toBe(true)
    expect(identifyBook).toHaveBeenCalledWith({
      reason: 'add',
      imageBase64: 'abc',
    })
  })
})
