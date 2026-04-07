import { InstancedMesh, Mesh, Object3D } from 'three'

/** 3인칭 가림 반투명 해제: 인스턴스 알파·메시 재질 원복 */
export function resetThirdPersonOcclusion(world: Object3D): void {
  world.traverse((obj) => {
    if (obj instanceof InstancedMesh) {
      const attr = obj.geometry.getAttribute('instanceOpacity')
      if (attr) {
        const arr = attr.array as Float32Array
        arr.fill(1)
        attr.needsUpdate = true
      }
    }
    if (obj instanceof Mesh && obj.userData.__occlusionBaseMaterial !== undefined) {
      obj.material = obj.userData.__occlusionBaseMaterial
    }
  })
}
