import { useRef } from 'react'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { PerspectiveCamera } from '@react-three/drei'
import {
  TOP_DOWN_CAMERA_Y_M,
  TOP_DOWN_DEFAULT_FOV,
} from '../../../config/constants'
import {
  OverviewZoomController,
  TopDownCameraRig,
  TopDownZoomController,
  OverviewPanController,
} from '../CameraControllers'
import { TopDownPlayerMarker } from '../TopDownPlayerMarker'
import { MinimapViewportReporter } from '../MinimapViewportReporter'
import type { MinimapUvPoint } from '../MinimapViewportReporter'
import type { ViewMode } from '../../../types/scene'
import { useAssertDefaultCamera } from '../../../hooks/useAssertDefaultCamera'

type TopDownRigProps = {
  controlsEnabled: boolean
  robotFollowMode?: boolean
  yawRef: RefObject<number>
}

export function TopDownRig({
  controlsEnabled,
  robotFollowMode = false,
  yawRef,
}: TopDownRigProps) {
  const cameraRef = useRef<ThreePerspectiveCamera | null>(null)
  useAssertDefaultCamera(cameraRef, true)

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        key="top-down-camera"
        makeDefault
        fov={TOP_DOWN_DEFAULT_FOV}
        position={[0, TOP_DOWN_CAMERA_Y_M, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <TopDownCameraRig
        yawRef={yawRef}
        enabled={controlsEnabled}
        robotFollowMode={robotFollowMode}
      />
      <TopDownZoomController enabled={controlsEnabled} />
      <TopDownPlayerMarker />
    </>
  )
}

type OverviewRigProps = {
  mode: ViewMode
  isEdit: boolean
  controlsEnabled: boolean
  onMinimapViewportUv?: (quad: MinimapUvPoint[] | null) => void
}

/**
 * 오버뷰/편집 카메라 리그.
 *
 * 시각 동일성 가드(#3): `<PerspectiveCamera key="overview-camera" makeDefault>`는 이 컴포넌트의
 * 자식 노드 레벨에서 직접 렌더링한다.
 */
export function OverviewRig({
  mode,
  isEdit,
  controlsEnabled,
  onMinimapViewportUv,
}: OverviewRigProps) {
  return (
    <>
      <PerspectiveCamera
        key="overview-camera"
        makeDefault
        position={[0, 50, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fov={64}
      />
      <OverviewZoomController />
      {!isEdit && controlsEnabled && <OverviewPanController />}
      {isEdit && controlsEnabled && (
        <>
          <OverviewPanController button={2} />
          <OverviewPanController button={0} requireSpaceKey />
        </>
      )}
      {onMinimapViewportUv && (
        <MinimapViewportReporter mode={mode} onMinimapViewportUv={onMinimapViewportUv} />
      )}
    </>
  )
}
