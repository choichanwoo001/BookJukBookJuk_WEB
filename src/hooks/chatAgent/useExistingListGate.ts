import { useCallback, useRef, useState } from 'react'
import type { ToolResult } from '../../agent/types'

export type ExistingListGate = {
  status: 'inactive' | 'awaiting' | 'confirmed'
  editCount: number
  hintShown: boolean
}

const initialExistingListGate = (): ExistingListGate => ({
  status: 'inactive',
  editCount: 0,
  hintShown: false,
})

export function useExistingListGate() {
  const gateRef = useRef<ExistingListGate>(initialExistingListGate())
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const updateGate = useCallback(
    (patch: Partial<ExistingListGate>) => {
      gateRef.current = { ...gateRef.current, ...patch }
      bump()
    },
    [bump],
  )

  const runEditFollowUp = useCallback(
    async (result: ToolResult, appendAssistantAndStore: (text: string, attachments?: string[]) => Promise<void>) => {
      if (gateRef.current.status !== 'awaiting') return
      if (!result.ok || result.toolName !== 'shoppingListTool') return
      const prev = gateRef.current
      const nextCount = prev.editCount + 1
      if (nextCount === 1) {
        gateRef.current = { ...prev, editCount: 1 }
        bump()
        await appendAssistantAndStore('리스트를 수정했어요. 이제 이 리스트로 확정하고 진행할까요? "진행"이라고 답해 주세요.')
      } else if (nextCount === 2 && !prev.hintShown) {
        gateRef.current = { ...prev, editCount: 2, hintShown: true }
        bump()
        await appendAssistantAndStore('수정이 끝나고 시작하고 싶을 땐 "진행"이라고 입력해 주세요. 매번 묻지는 않을게요.')
      } else {
        gateRef.current = { ...prev, editCount: nextCount }
        bump()
      }
    },
    [bump],
  )

  return {
    gateRef,
    updateGate,
    runEditFollowUp,
  }
}
