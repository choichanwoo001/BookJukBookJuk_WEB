import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { DynamicDrawUsage, InstancedBufferAttribute } from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'

/**
 * Initializes (or grows) a per-instance `instanceOpacity` `InstancedBufferAttribute`
 * with all values set to 1, after the `InstancedMesh` is mounted.
 *
 * NOTE: This is the *mesh-time* binding (used by `PillarCylinderInstances` and
 * `RotatedFixtureInstances`). `WallRibbonMesh` requires the attribute to exist
 * *at geometry creation time* so the per-instance shader binds on the first
 * frame, and so it does NOT use this hook — see `Walls.tsx`.
 */
export function useInstanceOpacityAttribute(
  meshRef: RefObject<ThreeInstancedMesh | null>,
  count: number,
): void {
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || count === 0) return
    const geo = mesh.geometry
    let attr = geo.getAttribute('instanceOpacity') as InstancedBufferAttribute | undefined
    if (!attr || attr.count !== count) {
      attr = new InstancedBufferAttribute(new Float32Array(count), 1)
      attr.setUsage(DynamicDrawUsage)
      geo.setAttribute('instanceOpacity', attr)
    }
    for (let i = 0; i < count; i++) {
      attr.setX(i, 1)
    }
    attr.needsUpdate = true
  }, [meshRef, count])
}
