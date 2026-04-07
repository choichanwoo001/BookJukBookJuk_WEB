import { MeshStandardMaterial } from 'three'

export type PerInstanceOpacityOptions = {
  /**
   * false(기본)은 투명 큐 + 깊이 미기록으로 벽처럼 큰 면이 배경/정렬 때문에 사라지는 경우가 있음.
   * true면 불투명에 가깝게 깊이 버퍼에 기록(인스턴스 알파는 여전히 곱해짐).
   */
  depthWrite?: boolean
}

/**
 * InstancedMesh용: geometry에 `instanceOpacity`(InstancedBufferAttribute)가 있을 때
 * 최종 알파에 곱한다. 기본값은 1.0으로 채운다.
 *
 * 알파 수정은 tonemapping/fog/premultiplied_alpha 이후 마지막에 적용한다
 * (opaque_fragment 직후에 곱하면 이후 단계에서 알파가 깨질 수 있음).
 */
export function createPerInstanceOpacityMaterial(
  base: MeshStandardMaterial,
  options?: PerInstanceOpacityOptions,
): MeshStandardMaterial {
  const m = base.clone()
  m.transparent = true
  m.depthWrite = options?.depthWrite ?? true
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
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
gl_FragColor.a *= vInstanceOpacity;`,
    )
  }
  m.customProgramCacheKey = () =>
    `perInstanceOpacity_${base.uuid}_${m.depthWrite ? 'dw1' : 'dw0'}`
  return m
}
