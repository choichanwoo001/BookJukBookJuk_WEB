import type { Object3D } from 'three'

export function isExcludedFromCameraCollision(object: Object3D): boolean {
  let o: Object3D | null = object
  while (o) {
    if (o.userData?.excludeCameraCollision === true) return true
    o = o.parent
  }
  return false
}
