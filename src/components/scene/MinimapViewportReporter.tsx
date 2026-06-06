import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { ViewMode } from '../../types/scene'
import { worldXzToMinimapUv } from '../../utils/minimapBounds'
import { flipMinimapV } from '../../utils/overviewDisplayFlip'

const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const hit = new Vector3()

/** NDC 모서리: 화면 위→아래와 동일한 순서로 사각형(overview 투영과 정합). */
const NDC_CORNERS = [
  new Vector2(-1, 1),
  new Vector2(1, 1),
  new Vector2(1, -1),
  new Vector2(-1, -1),
] as const

function round4(n: number) {
  return Math.round(n * 1e4) / 1e4
}

export type MinimapUvPoint = { u: number; v: number }

export function MinimapViewportReporter({
  mode,
  onMinimapViewportUv,
}: {
  mode: ViewMode
  onMinimapViewportUv: (quad: MinimapUvPoint[] | null) => void
}) {
  const { camera } = useThree()
  const raycaster = useMemo(() => new Raycaster(), [])
  const lastSerialized = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      lastSerialized.current = null
      onMinimapViewportUv(null)
    }
  }, [onMinimapViewportUv])

  useFrame(() => {
    const isOverviewLike = mode === 'overview' || mode === 'edit'
    if (!isOverviewLike) {
      if (lastSerialized.current !== null) {
        lastSerialized.current = null
        onMinimapViewportUv(null)
      }
      return
    }
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    const pts: MinimapUvPoint[] = []
    for (const ndc of NDC_CORNERS) {
      raycaster.setFromCamera(ndc, camera)
      const ok = raycaster.ray.intersectPlane(floorPlane, hit)
      if (!ok) {
        if (lastSerialized.current !== 'fail') {
          lastSerialized.current = 'fail'
          onMinimapViewportUv(null)
        }
        return
      }
      const { u, v } = worldXzToMinimapUv(hit.x, hit.z)
      pts.push({ u, v: flipMinimapV(v) })
    }

    const serialized = pts.map((p) => `${round4(p.u)},${round4(p.v)}`).join('|')
    if (serialized === lastSerialized.current) return
    lastSerialized.current = serialized
    onMinimapViewportUv(pts)
  })

  return null
}
