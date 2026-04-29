import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Mesh as ThreeMesh, PlaneGeometry, Texture, TextureLoader, SRGBColorSpace } from 'three'
import {
  MAP_IMAGE_HEIGHT_PX,
  MAP_IMAGE_ORIGIN_X,
  MAP_IMAGE_ORIGIN_Z,
  MAP_IMAGE_WIDTH_PX,
  MAP_RESOLUTION,
  mapImageOffsetX,
  mapImageOffsetZ,
} from '../../data/mapData'
import { MAP_DIFF_PUBLIC_PATH } from '../../data/mapDiffOverlayMeta'
import { getMinimapWorldBounds } from '../../utils/minimapBounds'

const Y_OFFSET = 0.018

/**
 * Full-map RGBA texture: same placement as processMap (pxToWorld − mapImageOffset).
 * UV는 `worldXzToMinimapUv`(이미지 상단=maxZ) / exportFloorMap2d와 동일하게 월드 XZ로 샘플한다.
 * (`rotateX`만 쓰면 기본 UV가 회전된 정점과 맞지 않을 수 있음.)
 * Toggle visibility off to hide the layer without changing map data.
 */
export function MapDiffOverlayMesh({ visible }: { visible: boolean }) {
  const [texture, setTexture] = useState<Texture | null>(null)
  const meshRef = useRef<ThreeMesh>(null)

  useEffect(() => {
    const loader = new TextureLoader()
    let disposed = false
    let current: Texture | null = null
    loader.load(
      MAP_DIFF_PUBLIC_PATH,
      (tex) => {
        if (disposed) {
          tex.dispose()
          return
        }
        tex.flipY = false
        tex.colorSpace = SRGBColorSpace
        tex.needsUpdate = true
        current = tex
        setTexture(tex)
      },
      undefined,
      () => {
        setTexture(null)
      },
    )
    return () => {
      disposed = true
      current?.dispose()
      setTexture(null)
    }
  }, [])

  const { geometry, position } = useMemo(() => {
    const sx = (MAP_IMAGE_WIDTH_PX - 1) * MAP_RESOLUTION
    const sz = (MAP_IMAGE_HEIGHT_PX - 1) * MAP_RESOLUTION
    const g = new PlaneGeometry(sx, sz)
    g.rotateX(-Math.PI / 2)
    const cx = MAP_IMAGE_ORIGIN_X + sx * 0.5 - mapImageOffsetX
    const cz = MAP_IMAGE_ORIGIN_Z + sz * 0.5 - mapImageOffsetZ
    const { minX, maxZ, spanX, spanZ } = getMinimapWorldBounds()
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cx
      const wz = pos.getZ(i) + cz
      uv.setXY(i, (wx - minX) / spanX, (maxZ - wz) / spanZ)
    }
    uv.needsUpdate = true
    return {
      geometry: g,
      position: [cx, Y_OFFSET, cz] as const,
    }
  }, [])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  useLayoutEffect(() => {
    if (meshRef.current) {
      meshRef.current.raycast = () => {}
    }
  }, [texture])

  if (!texture) return null

  return (
    <mesh ref={meshRef} visible={visible} position={position} geometry={geometry} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        opacity={1}
        alphaTest={0.04}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}
