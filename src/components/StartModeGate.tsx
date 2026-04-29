import { useEffect, useMemo, useState } from 'react'
import { loadShelfBooks } from '../lib/supabase/shelves'
import type { StartMode } from '../types/startMode'

type StartModeGateProps = {
  usersId: string
  onSelect: (mode: StartMode) => void
}

export default function StartModeGate({ usersId, onSelect }: StartModeGateProps) {
  const [listBookCount, setListBookCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)
  const [hoveredMode, setHoveredMode] = useState<StartMode | null>(null)

  useEffect(() => {
    let disposed = false
    const load = async () => {
      setLoading(true)
      setLoadMessage(null)
      const res = await loadShelfBooks(usersId, '쇼핑리스트')
      if (disposed) return
      if (!res.ok) {
        setListBookCount(null)
        setLoadMessage('리스트 상태를 확인하지 못했어요. 원하는 모드로 바로 시작할 수 있어요.')
        setLoading(false)
        return
      }
      setListBookCount(res.data.length)
      setLoading(false)
    }
    void load()
    return () => {
      disposed = true
    }
  }, [usersId])

  const hasList = useMemo(() => (listBookCount ?? 0) > 0, [listBookCount])
  const activeHint = useMemo(() => {
    if (hoveredMode === 'existing_list') {
      return '저장된 리스트를 바로 불러와 가장 빠르게 안내를 시작해요.'
    }
    if (hoveredMode === 'build_list_chat') {
      return '대화로 필요한 책을 먼저 정리한 뒤, 동선/탐색을 이어갈 수 있어요.'
    }
    if (hoveredMode === 'browse_no_list') {
      return '계획 없이 바로 출발해요. 화면 추천과 채팅 추천을 따라 즉흥적으로 둘러볼 수 있어요.'
    }
    if (loading) {
      return '기존 리스트를 확인하는 중…'
    }
    if (hasList) {
      return `쇼핑리스트에 ${listBookCount}권이 있어요. 기존 리스트 시작이 추천돼요.`
    }
    return '아직 저장된 쇼핑리스트가 없어요. 채팅 생성 또는 탐색 모드가 추천돼요.'
  }, [hasList, hoveredMode, listBookCount, loading])

  return (
    <section className="startModeGate" aria-label="시작 방식 선택">
      <div className="startModeCard">
        <h1>시작 방식을 선택해 주세요</h1>
        <p className="startModeDesc">
          로그인은 완료됐어요. 오늘 사용할 흐름을 고르면 맞춤 안내로 바로 시작할 수 있어요.
        </p>
        <p className="startModeHint">{activeHint}</p>
        {loadMessage && <p className="startModeWarning">{loadMessage}</p>}

        <div className="startModeButtons">
          <button
            type="button"
            data-primary={hasList}
            data-hovered={hoveredMode === 'existing_list'}
            onClick={() => onSelect('existing_list')}
            onMouseEnter={() => setHoveredMode('existing_list')}
            onFocus={() => setHoveredMode('existing_list')}
            onMouseLeave={() => setHoveredMode(null)}
            onBlur={() => setHoveredMode(null)}
            className="startModeButton"
          >
            <strong>기존 리스트로 시작</strong>
            <span>저장된 리스트를 불러와 안내를 바로 시작해요.</span>
          </button>
          <button
            type="button"
            data-primary={!hasList}
            data-hovered={hoveredMode === 'build_list_chat'}
            onClick={() => onSelect('build_list_chat')}
            onMouseEnter={() => setHoveredMode('build_list_chat')}
            onFocus={() => setHoveredMode('build_list_chat')}
            onMouseLeave={() => setHoveredMode(null)}
            onBlur={() => setHoveredMode(null)}
            className="startModeButton"
          >
            <strong>채팅으로 리스트 만들고 시작</strong>
            <span>대화로 필요한 책을 정리한 뒤 이동/탐색을 이어가요.</span>
          </button>
          <button
            type="button"
            data-primary={!hasList}
            data-hovered={hoveredMode === 'browse_no_list'}
            onClick={() => onSelect('browse_no_list')}
            onMouseEnter={() => setHoveredMode('browse_no_list')}
            onFocus={() => setHoveredMode('browse_no_list')}
            onMouseLeave={() => setHoveredMode(null)}
            onBlur={() => setHoveredMode(null)}
            className="startModeButton"
          >
            <strong>리스트 없이 둘러보기</strong>
            <span>계획 없이 바로 출발하고, 화면/채팅 추천을 보며 마음에 들면 저장해요.</span>
          </button>
        </div>
      </div>
    </section>
  )
}
