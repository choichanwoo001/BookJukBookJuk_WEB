export type ArrivalDedupeEvent =
  | { type: 'SHELF_ARRIVED'; legIndex: number; poolIndex: number | null }
  | { type: 'CHECKOUT_ARRIVED' }

export function buildArrivalDedupeKey(
  navigationRunId: number,
  event: ArrivalDedupeEvent,
): string {
  if (event.type === 'CHECKOUT_ARRIVED') return `${navigationRunId}:checkout`
  return `${navigationRunId}:shelf:${event.legIndex}:${event.poolIndex ?? 'none'}`
}

export function claimArrivalEvent(
  processedKeys: Set<string>,
  navigationRunId: number,
  event: ArrivalDedupeEvent,
): boolean {
  const key = buildArrivalDedupeKey(navigationRunId, event)
  if (processedKeys.has(key)) return false
  processedKeys.add(key)
  return true
}
