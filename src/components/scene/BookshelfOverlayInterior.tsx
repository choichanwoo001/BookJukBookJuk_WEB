import React, { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  Group,
  InstancedMesh,
  Mesh as ThreeMesh,
  Object3D,
} from 'three'
import type { MeshStandardMaterial as MeshStandardMaterialType } from 'three'
import type { FixtureRenderInstance } from '../../types/scene'
import {
  BOOKSHELF_PANEL_T,
  BOOKSHELF_PARTITION_T,
  BOOKSHELF_SHELF_T,
  MIN_BOOKSHELF_DETAIL_D,
  MIN_BOOKSHELF_DETAIL_W,
  computeIslandLayout,
  computeWallLayout,
  isWallAttachedShelf,
  shelfOpenSignTowardCorridor,
  type IslandLayout,
  type WallLayout,
} from '../../utils/bookshelfOverlayLayout'

const _dummy = new Object3D()
const _tmpColor = new Color()

function IslandShelfMesh({
  layout,
  h,
  w,
  d,
  shellMaterial,
  woodMaterial,
  booksRef,
}: {
  layout: IslandLayout
  h: number
  w: number
  d: number
  shellMaterial: MeshStandardMaterialType
  woodMaterial: MeshStandardMaterialType
  booksRef: React.RefObject<InstancedMesh | null>
}) {
  const ph = h - 2 * BOOKSHELF_PANEL_T - 1e-4
  return (
    <>
      <mesh position={[0, h * 0.5 - BOOKSHELF_PANEL_T * 0.5, 0]}>
        <boxGeometry args={[w - 1e-4, BOOKSHELF_PANEL_T, d - 1e-4]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -h * 0.5 + BOOKSHELF_PANEL_T * 0.5, 0]}>
        <boxGeometry args={[w - 1e-4, BOOKSHELF_PANEL_T, d - 1e-4]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      {layout.partitionsX.map((p) => (
        <mesh key={p.key} position={[p.x, 0, layout.zShelfCenter]}>
          <boxGeometry args={[BOOKSHELF_PARTITION_T, ph, layout.depthZ]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.partitionsZ.map((p) => (
        <mesh key={p.key} position={[0, 0, p.z]}>
          <boxGeometry args={[layout.innerW, ph, BOOKSHELF_PARTITION_T]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.shelfYs.map((y, idx) => (
        <mesh key={`shelf-${idx}`} position={[0, y, layout.zShelfCenter]}>
          <boxGeometry args={[layout.innerW, BOOKSHELF_SHELF_T, layout.innerD]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      <instancedMesh ref={booksRef} args={[undefined, undefined, layout.books.length]}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.65} metalness={0.05} vertexColors />
      </instancedMesh>
    </>
  )
}

function WallShelfMesh({
  layout,
  h,
  w,
  d,
  wInner,
  shellMaterial,
  woodMaterial,
  booksRef,
}: {
  layout: WallLayout
  h: number
  w: number
  d: number
  wInner: number
  shellMaterial: MeshStandardMaterialType
  woodMaterial: MeshStandardMaterialType
  booksRef: React.RefObject<InstancedMesh | null>
}) {
  return (
    <>
      <mesh position={[0, 0, -d * 0.5 + BOOKSHELF_PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, h - 1e-4, BOOKSHELF_PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[-w * 0.5 + BOOKSHELF_PANEL_T * 0.5, 0, BOOKSHELF_PANEL_T * 0.5]}>
        <boxGeometry args={[BOOKSHELF_PANEL_T, h - 1e-4, d - BOOKSHELF_PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[w * 0.5 - BOOKSHELF_PANEL_T * 0.5, 0, BOOKSHELF_PANEL_T * 0.5]}>
        <boxGeometry args={[BOOKSHELF_PANEL_T, h - 1e-4, d - BOOKSHELF_PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, h * 0.5 - BOOKSHELF_PANEL_T * 0.5, BOOKSHELF_PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, BOOKSHELF_PANEL_T, d - BOOKSHELF_PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -h * 0.5 + BOOKSHELF_PANEL_T * 0.5, BOOKSHELF_PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, BOOKSHELF_PANEL_T, d - BOOKSHELF_PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      {layout.partitions.map((p) => (
        <mesh key={p.key} position={[p.x, 0, layout.zShelfCenter]}>
          <boxGeometry args={[BOOKSHELF_PARTITION_T, h - 2 * BOOKSHELF_PANEL_T - 1e-4, layout.depthZ]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.shelfYs.map((y, idx) => (
        <mesh key={`shelf-${idx}`} position={[0, y, layout.zShelfCenter]}>
          <boxGeometry args={[wInner, BOOKSHELF_SHELF_T, layout.depthZ]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      <instancedMesh ref={booksRef} args={[undefined, undefined, layout.books.length]}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.65} metalness={0.05} vertexColors />
      </instancedMesh>
    </>
  )
}

function SimpleOverlayBox({
  cx,
  cz,
  w,
  h,
  d,
  yaw,
  material,
}: Pick<FixtureRenderInstance, 'cx' | 'cz' | 'w' | 'h' | 'd' | 'yaw'> & {
  material: MeshStandardMaterialType
}) {
  return (
    <group position={[cx, h * 0.5, cz]} rotation={[0, yaw, 0]}>
      <mesh scale={[w, h, d]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  )
}

const DetailedShelf = React.memo(function DetailedShelf({
  instance,
  shellMaterial,
  woodMaterial,
  mode,
}: {
  instance: FixtureRenderInstance
  shellMaterial: MeshStandardMaterialType
  woodMaterial: MeshStandardMaterialType
  mode: 'wall' | 'island'
}) {
  const { cx, cz, w, h, d, yaw } = instance
  const wInner = w - 2 * BOOKSHELF_PANEL_T
  const hInner = h - 2 * BOOKSHELF_PANEL_T
  const booksRef = useRef<InstancedMesh>(null)

  const layout = useMemo<IslandLayout | WallLayout>(() => {
    if (mode === 'island') return computeIslandLayout(cx, cz, w, h, d, hInner)
    return computeWallLayout(cx, cz, w, h, d, wInner, hInner)
  }, [cx, cz, w, h, d, wInner, hInner, mode])

  const openSign = useMemo(
    () => (mode === 'wall' ? shelfOpenSignTowardCorridor(cx, cz, yaw) : 1),
    [mode, cx, cz, yaw],
  )

  useLayoutEffect(() => {
    const mesh = booksRef.current
    if (!mesh) return
    layout.books.forEach((b, i) => {
      _dummy.position.set(b.x, b.y, b.z)
      _dummy.scale.set(b.sx, b.sy, b.sz)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)
      mesh.setColorAt!(i, _tmpColor.set(b.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [layout.books])

  return (
    <group position={[cx, h * 0.5, cz]} rotation={[0, yaw, 0]}>
      {layout.mode === 'island' ? (
        <IslandShelfMesh
          layout={layout}
          h={h}
          w={w}
          d={d}
          shellMaterial={shellMaterial}
          woodMaterial={woodMaterial}
          booksRef={booksRef}
        />
      ) : (
        <group scale={[1, 1, openSign]}>
          <WallShelfMesh
            layout={layout}
            h={h}
            w={w}
            d={d}
            wInner={wInner}
            shellMaterial={shellMaterial}
            woodMaterial={woodMaterial}
            booksRef={booksRef}
          />
        </group>
      )}
    </group>
  )
})

export function BookshelfOverlayInterior({
  instances,
  shellMaterial,
  woodMaterial,
  disableRaycast,
}: {
  instances: FixtureRenderInstance[]
  shellMaterial: MeshStandardMaterialType
  woodMaterial: MeshStandardMaterialType
  disableRaycast?: boolean
}) {
  const groupRef = useRef<Group>(null)

  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.traverse((obj) => {
      if (obj instanceof InstancedMesh) {
        obj.raycast = disableRaycast
          ? () => {}
          : InstancedMesh.prototype.raycast.bind(obj)
      } else if (obj instanceof ThreeMesh) {
        obj.raycast = disableRaycast
          ? () => {}
          : ThreeMesh.prototype.raycast.bind(obj)
      }
    })
  }, [disableRaycast, instances.length])

  return (
    <group ref={groupRef}>
      {instances.map((inst, index) => {
        if (inst.w < MIN_BOOKSHELF_DETAIL_W || inst.d < MIN_BOOKSHELF_DETAIL_D) {
          return (
            <SimpleOverlayBox
              key={`simple-${index}-${inst.cx}-${inst.cz}`}
              {...inst}
              material={shellMaterial}
            />
          )
        }
        return (
          <DetailedShelf
            key={`detail-${index}-${inst.cx}-${inst.cz}`}
            instance={inst}
            shellMaterial={shellMaterial}
            woodMaterial={woodMaterial}
            mode={isWallAttachedShelf(inst.cx, inst.cz, inst.d) ? 'wall' : 'island'}
          />
        )
      })}
    </group>
  )
}
