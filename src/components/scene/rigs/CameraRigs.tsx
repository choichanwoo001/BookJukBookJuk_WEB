import type { RefObject } from 'react'
import { Group } from 'three'
import { PerspectiveCamera } from '@react-three/drei'
import {
  FIRST_PERSON_EYE_HEIGHT_M,
  FIRST_PERSON_PITCH_MIN,
  FIRST_PERSON_PITCH_MAX,
  MOUSE_LOOK_PITCH_MIN,
  MOUSE_LOOK_PITCH_MAX,
  THIRD_PERSON_PLAYER_SCALE_MULT,
} from '../../../config/constants'
import {
  CameraZoomController,
  OverviewZoomController,
  MouseLookController,
  FirstPersonCameraRig,
  ThirdPersonCameraRig,
  OverviewPanController,
} from '../CameraControllers'
import { StickmanPlayer } from '../StickmanPlayer'
import { MinimapViewportReporter } from '../MinimapViewportReporter'
import type { MinimapUvPoint } from '../MinimapViewportReporter'
import type { ViewMode } from '../../../types/scene'
import { ForwardArrowUpdater } from '../reporters/SceneReporters'

type WalkRigProps = {
  mode: 'firstPerson' | 'thirdPerson'
  walkFov: number
  controlsEnabled: boolean
  yawRef: RefObject<number>
  pitchRef: RefObject<number>
  characterYawRef: RefObject<number>
  worldRef: RefObject<Group | null>
  isFreeLookRef: RefObject<boolean>
  mouseLookDraggingRef: RefObject<boolean>
  forwardArrowRef?: RefObject<HTMLDivElement | null>
  onWalkFovChange?: (fov: number) => void
}

/**
 * 1인칭/3인칭 워크 리그.
 *
 * 시각 동일성 가드(#3): 분기별 `<PerspectiveCamera key=... makeDefault>`는 이 컴포넌트의
 * 자식 노드 레벨에서 직접 렌더링한다. 같은 mode 내에서 prop만 바뀌면 카메라는 update 되고,
 * mode가 바뀌면 key가 다르므로 unmount/remount 가 발생해 기존 동작과 동일한 mount 타이밍을 유지한다.
 */
export function WalkRig({
  mode,
  walkFov,
  controlsEnabled,
  yawRef,
  pitchRef,
  characterYawRef,
  worldRef,
  isFreeLookRef,
  mouseLookDraggingRef,
  forwardArrowRef,
  onWalkFovChange,
}: WalkRigProps) {
  if (mode === 'firstPerson') {
    return (
      <>
        <PerspectiveCamera
          key="first-person-camera"
          makeDefault
          position={[0, FIRST_PERSON_EYE_HEIGHT_M, 0]}
          rotation={[0, 0, 0]}
          fov={walkFov}
        />
        <FirstPersonCameraRig
          yawRef={yawRef}
          pitchRef={pitchRef}
          enabled={controlsEnabled}
        />
        <CameraZoomController enabled={controlsEnabled} onFovChange={onWalkFovChange} />
        <MouseLookController
          yawRef={yawRef}
          pitchRef={pitchRef}
          enabled={controlsEnabled}
          isFreeLookRef={isFreeLookRef}
          mouseLookDraggingRef={mouseLookDraggingRef}
          pitchMin={FIRST_PERSON_PITCH_MIN}
          pitchMax={FIRST_PERSON_PITCH_MAX}
        />
        <StickmanPlayer characterYawRef={characterYawRef} worldRef={worldRef} visible={false} />
        {forwardArrowRef && <ForwardArrowUpdater yawRef={yawRef} domRef={forwardArrowRef} />}
      </>
    )
  }

  return (
    <>
      <PerspectiveCamera
        key="third-person-camera"
        makeDefault
        fov={walkFov}
      />
      <ThirdPersonCameraRig
        yawRef={yawRef}
        pitchRef={pitchRef}
        enabled={controlsEnabled}
      />
      <CameraZoomController enabled={controlsEnabled} onFovChange={onWalkFovChange} />
      <MouseLookController
        yawRef={yawRef}
        pitchRef={pitchRef}
        enabled={controlsEnabled}
        isFreeLookRef={isFreeLookRef}
        mouseLookDraggingRef={mouseLookDraggingRef}
        pitchMin={MOUSE_LOOK_PITCH_MIN}
        pitchMax={MOUSE_LOOK_PITCH_MAX}
        applyRotationToCamera={false}
      />
      <StickmanPlayer
        characterYawRef={characterYawRef}
        worldRef={worldRef}
        visible
        scaleMultiplier={THIRD_PERSON_PLAYER_SCALE_MULT}
      />
      {forwardArrowRef && <ForwardArrowUpdater yawRef={yawRef} domRef={forwardArrowRef} />}
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
      {isEdit && (
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
