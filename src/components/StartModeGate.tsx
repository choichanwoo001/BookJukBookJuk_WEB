import type { StartMode } from '../types/startMode'

type StartModeGateProps = {
  onSelect: (mode: StartMode) => void
}

export default function StartModeGate({ onSelect }: StartModeGateProps) {
  return (
    <section className="startModeGate" aria-label="시작 방식 선택">
      <div className="startModeCard">
        <h1>시작 방식을 선택해 주세요</h1>
        <p className="startModeDesc">기존 앱 내부에서 사용할 추천/리스트 모드를 고릅니다.</p>

        <div className="startModeButtons">
          <button type="button" onClick={() => onSelect('existing_list')} className="startModeButton">
            <strong>기존 리스트로 시작</strong>
            <span>저장된 리스트를 불러와 바로 안내를 시작해요.</span>
          </button>
          <button type="button" onClick={() => onSelect('build_list_chat')} className="startModeButton">
            <strong>채팅으로 리스트 만들기</strong>
            <span>필요한 책을 대화로 정리한 뒤 동선과 추천을 이어가요.</span>
          </button>
          <button type="button" onClick={() => onSelect('browse_no_list')} className="startModeButton">
            <strong>리스트 없이 둘러보기</strong>
            <span>추천을 보며 마음에 드는 책을 나중에 담을 수 있어요.</span>
          </button>
        </div>
      </div>
    </section>
  )
}
