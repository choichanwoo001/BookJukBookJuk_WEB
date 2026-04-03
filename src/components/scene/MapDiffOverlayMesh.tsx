import { useEffect, useMemo, useState } from 'react'
import { PlaneGeometry, Texture, TextureLoader, SRGBColorSpace } from 'three'
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

const Y_OFFSET = 0.018

/**
 * Full-map RGBA texture: same placement as processMap (pxToWorld − mapImageOffset).
 * Toggle visibility off to hide the layer without changing map data.
 */
export function MapDiffOverlayMesh({ visible }: { visible: boolean }) {
  const [texture, setTexture] = useState<Texture | null>(null)

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

  if (!texture) return null

  return (
    <mesh visible={visible} position={position} geometry={geometry} frustumCulled={false} renderOrder={2}>
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
