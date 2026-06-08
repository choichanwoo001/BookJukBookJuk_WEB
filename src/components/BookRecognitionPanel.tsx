import { useCallback } from 'react'

import { useBookRecognitionCamera } from '../hooks/useBookRecognitionCamera'



export type BookRecognitionPanelProps = {

  busy: boolean

  onCapture: (reason: 'add' | 'remove' | 'browse', imageBase64: string) => void | Promise<void>

  onBrowse?: (imageBase64: string) => void | Promise<void>

  placement?: 'map' | 'chat'

}



export function BookRecognitionPanel({

  busy,

  placement = 'map',

}: BookRecognitionPanelProps) {

  const {

    videoRef,

    isActive,

    error,

    start,

    stop,

  } = useBookRecognitionCamera()



  const handleToggle = useCallback(async () => {

    if (isActive) {

      stop()

      return

    }

    await start()

  }, [isActive, start, stop])



  return (

    <div

      className={`bookRecognitionPanel${placement === 'map' ? ' mapCameraPip' : ''}`}

      data-placement={placement}

    >

      <div className="bookRecognitionHeader">

        <span className="bookRecognitionTitle">책 표지 인식</span>

        <button
          type="button"
          className="bookRecognitionCameraButton"
          onClick={() => void handleToggle()}
          disabled={busy}
          data-active={isActive}
        >
          {isActive ? '카메라 끄기' : '카메라 켜기'}
        </button>

      </div>

      <div className="bookRecognitionPreviewWrap">

        <video

          ref={videoRef}

          className="bookRecognitionVideo"

          playsInline

          muted

          aria-label="책 표지 인식 카메라 미리보기"

        />

        {!isActive && (

          <div className="bookRecognitionVideoPlaceholder">카메라 미리보기</div>

        )}

      </div>

      {error && (

        <p className="bookRecognitionError" role="alert">

          {error}

        </p>

      )}

    </div>

  )

}


