import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { Group } from 'three'
import { InstancedMesh, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three'
import {
  THIRD_PERSON_OCCLUDER_OPACITY,
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
  const rayDir = useRef(new Vector3())

  useEffect(() => {
    const node = worldRef.current
    return () => {
      if (node) resetThirdPersonOcclusion(node)
    }
  }, [worldRef])

  useFrame(() => {
    const world = worldRef.current
    if (!world) return

    resetThirdPersonOcclusion(world)

    if (!enabled) return
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    camera.getWorldPosition(camWorld.current)
    anchorWorld.current.copy(anchorLocal.current).applyMatrix4(world.matrixWorld)

    const dist = camWorld.current.distanceTo(anchorWorld.current)
    if (dist < 1e-4) return

    rayDir.current.subVectors(anchorWorld.current, camWorld.current).normalize()
    const raycaster = raycasterRef.current
    raycaster.set(camWorld.current, rayDir.current)
    raycaster.far = dist
    raycaster.near = 0

    const hits = raycaster.intersectObject(world, true)
    for (const hit of hits) {
      if (hit.distance >= dist - 1e-3) continue
      if (isExcludedFromCameraCollision(hit.object)) continue

      const obj = hit.object
      if (obj instanceof InstancedMesh) {
        const id = hit.instanceId
        if (id === undefined || id === null) continue
        const attr = obj.geometry.getAttribute('instanceOpacity')
        if (!attr) continue
        attr.setX(id, THIRD_PERSON_OCCLUDER_OPACITY)
        attr.needsUpdate = true
      } else if (obj instanceof Mesh) {
        const mesh = obj
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
    }
  })

  return null
}
