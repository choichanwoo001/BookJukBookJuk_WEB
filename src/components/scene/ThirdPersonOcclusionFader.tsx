import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { Group } from 'three'
import type { Intersection } from 'three'
import { InstancedMesh, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three'
import {
  THIRD_PERSON_OCCLUDER_OPACITY,
  THIRD_PERSON_OCCLUSION_ANCHOR_CONE_M,
  THIRD_PERSON_OCCLUSION_RAY_OFFSET_M,
  THIRD_PERSON_OCCLUSION_RELEASE_DELAY_FRAMES,
  THIRD_PERSON_TARGET_HEIGHT_M,
} from '../../config/constants'
import { isExcludedFromCameraCollision } from '../../utils/cameraCollision'
import { resetThirdPersonOcclusion } from '../../utils/thirdPersonOcclusion'

function cloneOcclusionFadeMaterial(base: MeshStandardMaterial): MeshStandardMaterial {
  const c = base.clone()
  c.transparent = true
  c.opacity = THIRD_PERSON_OCCLUDER_OPACITY
  c.depthWrite = false
  return c
}

/** 카메라–앵커 직선 주변 오프셋(정규화된 right/up 계수). 얇은 벽 단일 레이 미스 완화. */
const OCCLUSION_RAY_OFFSET_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 0.65],
  [0, -0.65],
]

/** 앵커 쪽 끝점 cone (동일 계수 체계, `THIRD_PERSON_OCCLUSION_ANCHOR_CONE_M`로 스케일). */
const OCCLUSION_ANCHOR_OFFSET_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 0.55],
  [0, -0.55],
]

type FadeEntry =
  | { kind: 'mesh'; key: string; mesh: Mesh; miss: number }
  | { kind: 'inst'; key: string; mesh: InstancedMesh; instanceId: number; miss: number }

function meshKey(mesh: Mesh): string {
  return `m:${mesh.uuid}`
}

function instKey(mesh: InstancedMesh, id: number): string {
  return `i:${mesh.uuid}:${id}`
}

export function ThirdPersonOcclusionFader({
  enabled,
  worldRef,
}: {
  enabled: boolean
  worldRef: RefObject<Group | null>
}) {
  const { camera } = useThree()
  const raycasterRef = useRef(new Raycaster())
  const camWorld = useRef(new Vector3())
  const anchorLocal = useRef(new Vector3(0, THIRD_PERSON_TARGET_HEIGHT_M, 0))
  const anchorWorld = useRef(new Vector3())
  const rayTarget = useRef(new Vector3())
  const dirMain = useRef(new Vector3())
  const worldUp = useRef(new Vector3(0, 1, 0))
  const right = useRef(new Vector3())
  const orthUp = useRef(new Vector3())
  const rayOrigin = useRef(new Vector3())
  const rayDir = useRef(new Vector3())
  const fadeStateRef = useRef<Map<string, FadeEntry>>(new Map())

  useEffect(() => {
    const node = worldRef.current
    return () => {
      fadeStateRef.current.clear()
      if (node) resetThirdPersonOcclusion(node)
    }
  }, [worldRef])

  useFrame(() => {
    const world = worldRef.current
    if (!world) return

    resetThirdPersonOcclusion(world)

    if (!enabled) {
      fadeStateRef.current.clear()
      return
    }
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    camera.getWorldPosition(camWorld.current)
    anchorWorld.current.copy(anchorLocal.current).applyMatrix4(world.matrixWorld)

    const dist = camWorld.current.distanceTo(anchorWorld.current)
    if (dist < 1e-4) return

    dirMain.current.subVectors(anchorWorld.current, camWorld.current).normalize()

    right.current.crossVectors(worldUp.current, dirMain.current)
    if (right.current.lengthSq() < 1e-8) {
      right.current.set(1, 0, 0).cross(dirMain.current)
    }
    right.current.normalize()
    orthUp.current.crossVectors(dirMain.current, right.current).normalize()

    const R = THIRD_PERSON_OCCLUSION_RAY_OFFSET_M
    const A = THIRD_PERSON_OCCLUSION_ANCHOR_CONE_M
    const raycaster = raycasterRef.current

    const candidates = new Map<string, FadeEntry>()

    const considerHit = (hit: Intersection, segmentFar: number) => {
      const eps = Math.max(1e-3, 1e-4 * segmentFar)
      if (hit.distance >= segmentFar - eps) return
      if (isExcludedFromCameraCollision(hit.object)) return

      const obj = hit.object
      if (obj instanceof InstancedMesh) {
        const id = hit.instanceId
        if (id === undefined || id === null) return
        if (!obj.geometry.getAttribute('instanceOpacity')) return
        const key = instKey(obj, id)
        if (!candidates.has(key)) {
          candidates.set(key, { kind: 'inst', key, mesh: obj, instanceId: id, miss: 0 })
        }
      } else if (obj instanceof Mesh) {
        const mat = obj.material
        if (Array.isArray(mat)) return
        if (!(mat instanceof MeshStandardMaterial)) return
        const key = meshKey(obj)
        if (!candidates.has(key)) {
          candidates.set(key, { kind: 'mesh', key, mesh: obj, miss: 0 })
        }
      }
    }

    for (const [ou, ov] of OCCLUSION_RAY_OFFSET_UV) {
      for (const [eu, ev] of OCCLUSION_ANCHOR_OFFSET_UV) {
        rayOrigin.current
          .copy(camWorld.current)
          .addScaledVector(right.current, ou * R)
          .addScaledVector(orthUp.current, ov * R)

        rayTarget.current
          .copy(anchorWorld.current)
          .addScaledVector(right.current, eu * A)
          .addScaledVector(orthUp.current, ev * A)

        rayDir.current.subVectors(rayTarget.current, rayOrigin.current)
        const segFar = rayOrigin.current.distanceTo(rayTarget.current)
        if (segFar < 1e-4) continue
        rayDir.current.multiplyScalar(1 / segFar)

        raycaster.set(rayOrigin.current, rayDir.current)
        raycaster.far = segFar
        raycaster.near = 0

        const hits = raycaster.intersectObject(world, true)
        for (const hit of hits) {
          considerHit(hit, segFar)
        }
      }
    }

    const prev = fadeStateRef.current
    const next = new Map<string, FadeEntry>()

    for (const [k, v] of candidates) {
      if (v.kind === 'mesh') {
        next.set(k, { kind: 'mesh', key: k, mesh: v.mesh, miss: 0 })
      } else {
        next.set(k, {
          kind: 'inst',
          key: k,
          mesh: v.mesh,
          instanceId: v.instanceId,
          miss: 0,
        })
      }
    }

    for (const [k, v] of prev) {
      if (next.has(k)) continue
      const miss = v.miss + 1
      if (miss < THIRD_PERSON_OCCLUSION_RELEASE_DELAY_FRAMES) {
        next.set(k, { ...v, miss })
      }
    }

    fadeStateRef.current = next

    const pendingInstanced = new Map<InstancedMesh, Set<number>>()
    const pendingMeshes = new Set<Mesh>()

    for (const entry of next.values()) {
      if (entry.kind === 'inst') {
        let set = pendingInstanced.get(entry.mesh)
        if (!set) {
          set = new Set()
          pendingInstanced.set(entry.mesh, set)
        }
        set.add(entry.instanceId)
      } else {
        pendingMeshes.add(entry.mesh)
      }
    }

    for (const [mesh, ids] of pendingInstanced) {
      const attr = mesh.geometry.getAttribute('instanceOpacity')
      if (!attr) continue
      for (const id of ids) {
        attr.setX(id, THIRD_PERSON_OCCLUDER_OPACITY)
      }
      attr.needsUpdate = true
    }

    for (const mesh of pendingMeshes) {
      const mat = mesh.material
      if (Array.isArray(mat)) continue
      if (!(mat instanceof MeshStandardMaterial)) continue
      if (mesh.userData.__occlusionBaseMaterial === undefined) {
        mesh.userData.__occlusionBaseMaterial = mat
      }
      if (!mesh.userData.__occlusionFadeMaterial) {
        mesh.userData.__occlusionFadeMaterial = cloneOcclusionFadeMaterial(mesh.userData.__occlusionBaseMaterial)
      }
      mesh.material = mesh.userData.__occlusionFadeMaterial
    }
  })

  return null
}
