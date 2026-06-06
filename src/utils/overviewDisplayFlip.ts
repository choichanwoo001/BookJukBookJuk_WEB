import { events } from '@react-three/fiber'

type PointerEventsFactory = typeof events
type PointerEventsStore = Parameters<PointerEventsFactory>[0]

/**
 * 오버뷰/편집 Canvas CSS `scaleY(-1)`로 미니맵 PNG와 화면 방향을 맞출 때 사용.
 * 렌더만 뒤집고 마우스·레이캐스트·팬 입력은 이 플래그 기준으로 보정한다.
 */
export const OVERVIEW_DISPLAY_FLIP_Y = true

export function clientYToNdcY(clientY: number, rectTop: number, rectHeight: number): number {
  const t = (clientY - rectTop) / rectHeight
  const standard = -(t * 2 - 1)
  return OVERVIEW_DISPLAY_FLIP_Y ? -standard : standard
}

export function overviewPanDy(dy: number): number {
  return OVERVIEW_DISPLAY_FLIP_Y ? -dy : dy
}

export function flipMinimapV(v: number): number {
  return OVERVIEW_DISPLAY_FLIP_Y ? 1 - v : v
}

/** R3F 포인터 이벤트: CSS 상하반전과 동일하게 NDC y를 보정. */
export function createOverviewFlipEvents(): (
  store: PointerEventsStore,
) => ReturnType<PointerEventsFactory> {
  return (store) => {
    const base = events(store)
    return {
      ...base,
      compute(event, state, previous) {
        base.compute?.(event, state, previous)
        state.pointer.y = -state.pointer.y
      },
    }
  }
}
