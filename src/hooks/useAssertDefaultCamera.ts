import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'

/**
 * OverviewRig unmount 시 makeDefault 복원이 TopDownRig 카메라를 덮어쓰는 R3F 타이밍 이슈를 막는다.
 * 마운트 직후(및 한 프레임 뒤) topDown 카메라를 다시 default로 고정한다.
 */
export function useAssertDefaultCamera(
  cameraRef: RefObject<ThreePerspectiveCamera | null>,
  active: boolean,
) {
  const set = useThree((state) => state.set)

  useLayoutEffect(() => {
    if (!active) return

    let cancelled = false

    const apply = () => {
      if (cancelled) return
      const cam = cameraRef.current
      if (!cam) return
      set({ camera: cam })
      cam.updateProjectionMatrix()
    }

    apply()
    const raf1 = requestAnimationFrame(() => {
      apply()
      if (!cancelled) requestAnimationFrame(apply)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
    }
  }, [active, cameraRef, set])
}
