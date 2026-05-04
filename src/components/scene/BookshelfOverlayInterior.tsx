import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Mesh, Object3D } from 'three'
import type { MeshStandardMaterial as MeshStandardMaterialType } from 'three'
import type { FixtureRenderInstance } from '../../types/scene'
import { getShelfLevelsById } from '../../data/shelfSectorAssignments'
import { nearestWallInfo } from '../../utils/wallAlignment'
import { mulberry32, hashSeed, bookColorHex } from '../../utils/bookGeometryUtils'

const _dummy = new Object3D()
const _tmpColor = new Color()

const PANEL_T = 0.024
const PARTITION_T = 0.018
const SHELF_T = 0.016
const MIN_W_DETAIL = 0.28
const MIN_D_DETAIL = 0.18

/** 이보다 가까우면 벽면 배치로 보고 한 면만 개방 */
function isWallAttachedShelf(cx: number, cz: number, d: number): boolean {
  const hit = nearestWallInfo(cx, cz)
  if (!hit) return false
  return hit.distM < d * 0.52 + 0.28
}

/** 로컬 +Z 쪽 면을 열어 통로에서 내부가 보이게 함 */
const OPEN_AT_POS_Z = true

type BookSpec = {
  key: string
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: string
}

type IslandLayout = {
  mode: 'island'
  shelfYs: number[]
  books: BookSpec[]
  partitionsX: { x: number; key: string }[]
  partitionsZ: { z: number; key: string }[]
  depthZ: number
  zShelfCenter: number
  innerW: number
  innerD: number
}

type WallLayout = {
  mode: 'wall'
  shelfYs: number[]
  books: BookSpec[]
  partitions: { x: number; key: string }[]
  depthZ: number
  zShelfCenter: number
}

function computeIslandLayout(
  cx: number, cz: number, w: number, h: number, d: number, hInner: number, shelfTierCount: number,
): IslandLayout {
  const margin = PANEL_T
  const innerW = Math.max(0.06, w - 2 * margin)
  const innerD = Math.max(0.06, d - 2 * margin)
  const nBaysX = Math.max(1, Math.min(8, Math.floor(w / 0.35)))
  const nBaysZ = Math.max(1, Math.min(6, Math.floor(d / 0.35)))
  const mShelves = Math.max(2, Math.min(7, shelfTierCount))
  const bayW = innerW / nBaysX
  const bayD = innerD / nBaysZ
  const depthZ = innerD
  const zShelfCenter = 0

  const shelfYs: number[] = []
  for (let j = 1; j <= mShelves; j++) {
    const t = j / (mShelves + 1)
    shelfYs.push(-h * 0.5 + PANEL_T + t * hInner)
  }

  const books: BookSpec[] = []
  for (let iz = 0; iz < nBaysZ; iz++) {
    const z0 = -d * 0.5 + margin + iz * bayD
    const z1 = z0 + bayD
    const zCellMid = (z0 + z1) * 0.5
    const zSpan = z1 - z0
    for (let ix = 0; ix < nBaysX; ix++) {
      const x0 = -w * 0.5 + margin + ix * bayW
      const x1 = x0 + bayW
      for (const yShelf of shelfYs) {
        let xCursor = x0 + 0.015
        let bookIdx = 0
        const shelfSurfaceY = yShelf + SHELF_T * 0.5 + 0.008
        const rndRow = mulberry32(hashSeed(cx, cz, ix, iz, Math.round(yShelf * 1000)))
        while (xCursor < x1 - 0.03) {
          const seed = hashSeed(cx, cz, ix, iz, Math.round(yShelf * 1000), bookIdx)
          const rnd = mulberry32(seed)
          const thick = 0.016 + rnd() * 0.026
          const bH = 0.11 + rnd() * 0.13
          const bD = Math.min(zSpan - 0.04, zSpan * (0.55 + rnd() * 0.32))
          if (xCursor + thick > x1 - 0.02) break
          books.push({
            key: `i-${ix}-${iz}-${yShelf.toFixed(3)}-${bookIdx}`,
            x: xCursor + thick * 0.5,
            y: shelfSurfaceY + bH * 0.5,
            z: zCellMid,
            sx: thick,
            sy: bH,
            sz: bD,
            color: bookColorHex(seed),
          })
          xCursor += thick + 0.004 + rndRow() * 0.01
          bookIdx++
        }
      }
    }
  }

  const partitionsX: { x: number; key: string }[] = []
  for (let k = 1; k < nBaysX; k++) {
    partitionsX.push({ x: -w * 0.5 + margin + k * bayW, key: `px-${k}` })
  }
  const partitionsZ: { z: number; key: string }[] = []
  for (let k = 1; k < nBaysZ; k++) {
    partitionsZ.push({ z: -d * 0.5 + margin + k * bayD, key: `pz-${k}` })
  }

  return { mode: 'island', shelfYs, books, partitionsX, partitionsZ, depthZ, zShelfCenter, innerW, innerD }
}

function computeWallLayout(
  cx: number, cz: number, w: number, h: number, d: number, wInner: number, hInner: number, shelfTierCount: number,
): WallLayout {
  const nBays = Math.max(1, Math.min(8, Math.floor(w / 0.35)))
  const mShelves = Math.max(2, Math.min(7, shelfTierCount))
  const bayW = wInner / nBays
  const zBackInner = -d * 0.5 + PANEL_T
  const zFrontInner = OPEN_AT_POS_Z ? d * 0.5 - 0.03 : -d * 0.5 + PANEL_T
  const depthZ = Math.max(0.08, zFrontInner - zBackInner)
  const zShelfCenter = (zBackInner + zFrontInner) * 0.5
  const zBookBack = zBackInner + depthZ * 0.06
  const zBookFront = zFrontInner - depthZ * 0.1

  const shelfYs: number[] = []
  for (let j = 1; j <= mShelves; j++) {
    const t = j / (mShelves + 1)
    shelfYs.push(-h * 0.5 + PANEL_T + t * hInner)
  }

  const books: BookSpec[] = []
  for (let bay = 0; bay < nBays; bay++) {
    const x0 = -w * 0.5 + PANEL_T + bay * bayW
    const x1 = x0 + bayW
    for (const yShelf of shelfYs) {
      let xCursor = x0 + 0.02
      let bookIdx = 0
      const shelfSurfaceY = yShelf + SHELF_T * 0.5 + 0.008
      const rndRow = mulberry32(hashSeed(cx, cz, bay, Math.round(yShelf * 1000)))
      while (xCursor < x1 - 0.04) {
        const seed = hashSeed(cx, cz, bay, Math.round(yShelf * 1000), bookIdx)
        const rnd = mulberry32(seed)
        const thick = 0.018 + rnd() * 0.028
        const bH = 0.12 + rnd() * 0.14
        const bD = Math.min(zBookFront - zBookBack - 0.02, depthZ * (0.55 + rnd() * 0.28))
        if (xCursor + thick > x1 - 0.02) break
        const zc = (zBookBack + zBookFront) * 0.5
        books.push({
          key: `${bay}-${yShelf.toFixed(3)}-${bookIdx}`,
          x: xCursor + thick * 0.5,
          y: shelfSurfaceY + bH * 0.5,
          z: zc,
          sx: thick,
          sy: bH,
          sz: bD,
          color: bookColorHex(seed),
        })
        xCursor += thick + 0.004 + rndRow() * 0.012
        bookIdx++
      }
    }
  }

  const partitions: { x: number; key: string }[] = []
  for (let k = 1; k < nBays; k++) {
    partitions.push({ x: -w * 0.5 + PANEL_T + k * bayW, key: `p-${k}` })
  }

  return { mode: 'wall', shelfYs, books, partitions, depthZ, zShelfCenter }
}

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
  const ph = h - 2 * PANEL_T - 1e-4
  return (
    <>
      <mesh position={[0, h * 0.5 - PANEL_T * 0.5, 0]}>
        <boxGeometry args={[w - 1e-4, PANEL_T, d - 1e-4]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -h * 0.5 + PANEL_T * 0.5, 0]}>
        <boxGeometry args={[w - 1e-4, PANEL_T, d - 1e-4]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      {layout.partitionsX.map((p) => (
        <mesh key={p.key} position={[p.x, 0, layout.zShelfCenter]}>
          <boxGeometry args={[PARTITION_T, ph, layout.depthZ]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.partitionsZ.map((p) => (
        <mesh key={p.key} position={[0, 0, p.z]}>
          <boxGeometry args={[layout.innerW, ph, PARTITION_T]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.shelfYs.map((y, idx) => (
        <mesh key={`shelf-${idx}`} position={[0, y, layout.zShelfCenter]}>
          <boxGeometry args={[layout.innerW, SHELF_T, layout.innerD]} />
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
      <mesh position={[0, 0, -d * 0.5 + PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, h - 1e-4, PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[-w * 0.5 + PANEL_T * 0.5, 0, PANEL_T * 0.5]}>
        <boxGeometry args={[PANEL_T, h - 1e-4, d - PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[w * 0.5 - PANEL_T * 0.5, 0, PANEL_T * 0.5]}>
        <boxGeometry args={[PANEL_T, h - 1e-4, d - PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, h * 0.5 - PANEL_T * 0.5, PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, PANEL_T, d - PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -h * 0.5 + PANEL_T * 0.5, PANEL_T * 0.5]}>
        <boxGeometry args={[w - 1e-4, PANEL_T, d - PANEL_T]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>
      {layout.partitions.map((p) => (
        <mesh key={p.key} position={[p.x, 0, layout.zShelfCenter]}>
          <boxGeometry args={[PARTITION_T, h - 2 * PANEL_T - 1e-4, layout.depthZ]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      ))}
      {layout.shelfYs.map((y, idx) => (
        <mesh key={`shelf-${idx}`} position={[0, y, layout.zShelfCenter]}>
          <boxGeometry args={[wInner, SHELF_T, layout.depthZ]} />
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
  const wInner = w - 2 * PANEL_T
  const hInner = h - 2 * PANEL_T
  const booksRef = useRef<InstancedMesh>(null)

  const shelfTierCount = useMemo(
    () => Math.max(2, Math.min(7, getShelfLevelsById(instance.shelfId))),
    [instance.shelfId],
  )

  const layout = useMemo<IslandLayout | WallLayout>(() => {
    if (mode === 'island') return computeIslandLayout(cx, cz, w, h, d, hInner, shelfTierCount)
    return computeWallLayout(cx, cz, w, h, d, wInner, hInner, shelfTierCount)
  }, [cx, cz, w, h, d, wInner, hInner, mode, shelfTierCount])

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
      )}
    </group>
  )
})

function disableRaycastOnTree(root: Group | null) {
  if (!root) return
  root.traverse((obj) => {
    if (obj instanceof Mesh) obj.raycast = () => {}
  })
}

export function BookshelfOverlayInterior({
  instances,
  shellMaterial,
  woodMaterial,
}: {
  instances: FixtureRenderInstance[]
  shellMaterial: MeshStandardMaterialType
  woodMaterial: MeshStandardMaterialType
}) {
  const rootRef = useRef<Group>(null)

  useLayoutEffect(() => {
    disableRaycastOnTree(rootRef.current)
  }, [instances])

  return (
    <group ref={rootRef}>
      {instances.map((inst, index) => {
        if (inst.w < MIN_W_DETAIL || inst.d < MIN_D_DETAIL) {
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
