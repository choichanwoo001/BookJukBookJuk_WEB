import { MeshStandardMaterial } from 'three'

/**
 * InstancedMesh용: geometry에 `instanceOpacity`(InstancedBufferAttribute)가 있을 때
 * 최종 알파에 곱한다. 기본값은 1.0으로 채운다.
 */
export function createPerInstanceOpacityMaterial(base: MeshStandardMaterial): MeshStandardMaterial {
  const m = base.clone()
  m.transparent = true
  m.depthWrite = false
  m.opacity = 1
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
attribute float instanceOpacity;
varying float vInstanceOpacity;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vInstanceOpacity = instanceOpacity;
#include <begin_vertex>`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying float vInstanceOpacity;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
gl_FragColor.a *= vInstanceOpacity;`,
    )
  }
  m.customProgramCacheKey = () => `perInstanceOpacity_${base.uuid}`
  return m
}
