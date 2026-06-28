import { useCallback, useRef, useState } from 'react'

export type ExistingListGateStatus =
  | 'inactive'
  | 'awaiting_nav'
  | 'nav_started'

export type ExistingListGate = {
  status: ExistingListGateStatus
}

const initialExistingListGate = (): ExistingListGate => ({
  status: 'inactive',
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

  return {
    gateRef,
    updateGate,
  }
}
