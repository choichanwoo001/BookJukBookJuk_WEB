import type { AgentContext, ToolCall } from '../../agent/types'
import { formatAbCandidateAttachments } from './helpers'
import type { Dispatch, SetStateAction } from 'react'

export type BuildFlowStep =
  | 'idle'
  | 'step1_question_1'
  | 'step1_question_2'
  | 'step2_theme_select'
  | 'step3_ab_pick'
  | 'step4_review_confirm'
  | 'confirmed'

export type ThemeOption = {
  id: string
  name: string
  description: string
  reason?: string
  keywords: string[]
}

export type RecommendationCandidate = {
  title: string
  authors: string
  reason: string
  reviewKeywords: string[]
}

export type BuildFlowSession = {
  step: BuildFlowStep
  answers: string[]
  themes: ThemeOption[]
  themeRegenerateCount: number
  selectedTheme: ThemeOption | null
  candidates: RecommendationCandidate[]
  candidateRefreshCount: number
}

export const initialBuildFlowSession = (): BuildFlowSession => ({
  step: 'idle',
  answers: [],
  themes: [],
  themeRegenerateCount: 0,
  selectedTheme: null,
  candidates: [],
  candidateRefreshCount: 0,
})

export const STEP1_Q1 = '요즘 어떤 순간에 읽을 책이 필요하세요?'
export const STEP1_Q2 = '읽고 나서 어떤 느낌이면 좋겠어요?'

function pickKeywords(text: string): string[] {
  return text
    .split(/[\s,./]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 3)
}

export function buildThemeOptions(answers: string[]): ThemeOption[] {
  const merged = answers.join(' ').toLowerCase()
  const qKeywords = pickKeywords(answers.join(' '))
  if (/(퇴근|출근|잠들기|밤|피곤|지침)/.test(merged)) {
    return [
      { id: 'theme_reflective_essay', name: '감정 정리 에세이', description: '짧게 읽으며 하루 감정을 정돈하는 흐름', keywords: ['공감', '짧은호흡', ...qKeywords] },
      { id: 'theme_light_psychology', name: '가벼운 심리 인사이트', description: '관계/감정 패턴을 부담 없이 이해하는 구성', keywords: ['심리', '관계', ...qKeywords] },
      { id: 'theme_comfort_fiction', name: '잔잔한 위로 소설', description: '긴장을 내려놓는 몰입형 이야기 중심', keywords: ['위로', '몰입', ...qKeywords] },
    ]
  }
  if (/(동기|성장|목표|집중|공부|일)/.test(merged)) {
    return [
      { id: 'theme_growth_essay', name: '성장 에세이', description: '실패/회복 경험을 통해 동기를 올리는 타입', keywords: ['성장', '회복', ...qKeywords] },
      { id: 'theme_behavior_psychology', name: '행동 심리학', description: '습관과 집중 패턴을 이해하는 실용형', keywords: ['습관', '집중', ...qKeywords] },
      { id: 'theme_momentum_fiction', name: '몰입감 있는 성장 소설', description: '주인공의 변화 과정으로 에너지를 받는 전개', keywords: ['서사', '몰입', ...qKeywords] },
    ]
  }
  return [
    { id: 'theme_empathy_essay', name: '공감 중심 에세이', description: '가벼운 문장으로 생각을 정리하기 좋은 선택', keywords: ['공감', ...qKeywords] },
    { id: 'theme_daily_psychology', name: '일상 심리학', description: '일상 문제를 심리 관점으로 풀어보는 구성', keywords: ['일상', '심리', ...qKeywords] },
    { id: 'theme_healing_story', name: '힐링 스토리 소설', description: '잔잔한 이야기로 호흡을 고르는 타입', keywords: ['힐링', '스토리', ...qKeywords] },
  ]
}

export function parseThemeSelection(text: string, themes: ThemeOption[]): ThemeOption | null {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('다시')) return null
  const byIndex = normalized.match(/([123])\s*(번)?/)
  if (byIndex) {
    const index = Number.parseInt(byIndex[1], 10) - 1
    return themes[index] ?? null
  }
  return themes.find((theme) => normalized.includes(theme.name.toLowerCase())) ?? null
}

function keywordOverlapScore(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    const k = keyword.trim().toLowerCase()
    if (!k) continue
    if (normalized.includes(k)) score += 1
  }
  return score
}

export function rankThemeCandidates(
  candidates: { title: string; authors: string }[],
  theme: ThemeOption,
): { title: string; authors: string }[] {
  const keywords = theme.keywords.slice(0, 5)
  if (keywords.length === 0) return candidates
  return [...candidates].sort((a, b) => {
    const aText = `${a.title} ${a.authors}`
    const bText = `${b.title} ${b.authors}`
    const aScore = keywordOverlapScore(aText, keywords)
    const bScore = keywordOverlapScore(bText, keywords)
    if (aScore !== bScore) return bScore - aScore
    return 0
  })
}

type BuildFlowHandlerParams = {
  buildFlow: BuildFlowSession
  intentText: string
  appendAssistantAndStore: (text: string, attachments?: string[]) => Promise<void>
  setBuildFlow: Dispatch<SetStateAction<BuildFlowSession>>
  loadThemesForAnswers: (answers: string[]) => Promise<ThemeOption[]>
  loadCandidatesForTheme: (theme: ThemeOption, refreshCount: number) => Promise<RecommendationCandidate[]>
  runToolWithFallback: (toolCall: ToolCall, intentTypeForOutcome: string, extraContextPatch?: Partial<AgentContext>) => Promise<unknown>
  shoppingListCount: number
}

type HandlerStateSetter = Dispatch<SetStateAction<BuildFlowSession>>

export async function handleBuildFlowInput(params: Omit<BuildFlowHandlerParams, 'setBuildFlow'> & { setBuildFlow: HandlerStateSetter }): Promise<boolean> {
  const {
    buildFlow,
    intentText,
    appendAssistantAndStore,
    setBuildFlow,
    loadThemesForAnswers,
    loadCandidatesForTheme,
    runToolWithFallback,
    shoppingListCount,
  } = params

  if (buildFlow.step === 'step1_question_1') {
    const answers = [intentText]
    setBuildFlow((prev) => ({ ...prev, step: 'step1_question_2', answers }))
    await appendAssistantAndStore(STEP1_Q2)
    return true
  }

  if (buildFlow.step === 'step1_question_2') {
    const answers = [...buildFlow.answers, intentText].slice(0, 2)
    const themes = await loadThemesForAnswers(answers)
    setBuildFlow((prev) => ({
      ...prev,
      step: 'step2_theme_select',
      answers,
      themes,
      selectedTheme: null,
      candidates: [],
    }))
    await appendAssistantAndStore(
      '답변을 바탕으로 어울리는 테마 3가지를 골랐어요. 아래에서 하나를 선택해 주세요.',
      themes.map((theme, index) => `${index + 1}. ${theme.name} - ${theme.description}`),
    )
    return true
  }

  if (buildFlow.step === 'step2_theme_select') {
    if (intentText.includes('다시')) {
      if (buildFlow.themeRegenerateCount >= 2) {
        await appendAssistantAndStore('테마 재추천은 여기까지 가능해요. 현재 제안에서 골라 주세요.')
        return true
      }
      const nextThemes = await loadThemesForAnswers([...buildFlow.answers].reverse())
      setBuildFlow((prev) => ({
        ...prev,
        themes: nextThemes,
        themeRegenerateCount: prev.themeRegenerateCount + 1,
      }))
      await appendAssistantAndStore(
        '새로운 테마 3가지를 준비했어요.',
        nextThemes.map((theme, index) => `${index + 1}. ${theme.name} - ${theme.description}`),
      )
      return true
    }
    const selectedTheme = parseThemeSelection(intentText, buildFlow.themes)
    if (!selectedTheme) {
      await appendAssistantAndStore('1~3번 중에서 테마를 골라 주세요. 필요하면 "다시 추천"도 가능해요.')
      return true
    }
    const candidates = await loadCandidatesForTheme(selectedTheme, buildFlow.candidateRefreshCount)
    if (candidates.length < 2) {
      await appendAssistantAndStore('추천 후보를 준비하지 못했어요. 테마를 다시 골라볼까요?')
      return true
    }
    setBuildFlow((prev) => ({
      ...prev,
      step: 'step3_ab_pick',
      selectedTheme,
      candidates,
    }))
    await appendAssistantAndStore(
      `"${selectedTheme.name}" 기준으로 2권을 골랐어요. 리스트에 담을 책을 선택해 주세요.`,
      formatAbCandidateAttachments(candidates),
    )
    return true
  }

  if (buildFlow.step === 'step3_ab_pick') {
    const lower = intentText.toLowerCase()
    const chooseA = lower.includes('a')
    const chooseB = lower.includes('b')
    if (intentText.includes('다른') || intentText.includes('2권')) {
      if (buildFlow.candidateRefreshCount >= 2 || !buildFlow.selectedTheme) {
        await appendAssistantAndStore('다른 2권 보기는 여기까지 가능해요. 현재 후보에서 골라 주세요.')
        return true
      }
      const nextRefreshCount = buildFlow.candidateRefreshCount + 1
      const candidates = await loadCandidatesForTheme(buildFlow.selectedTheme, nextRefreshCount)
      if (candidates.length < 2) {
        await appendAssistantAndStore('다른 후보를 더 찾지 못했어요. 현재 후보에서 선택해 주세요.')
        return true
      }
      setBuildFlow((prev) => ({
        ...prev,
        candidates,
        candidateRefreshCount: nextRefreshCount,
      }))
      await appendAssistantAndStore('다른 2권을 준비했어요.', formatAbCandidateAttachments(candidates))
      return true
    }
    const toAddTitles: string[] = []
    if (intentText.includes('둘 다')) {
      toAddTitles.push(buildFlow.candidates[0]?.title ?? '', buildFlow.candidates[1]?.title ?? '')
    } else if (chooseA) {
      toAddTitles.push(buildFlow.candidates[0]?.title ?? '')
    } else if (chooseB) {
      toAddTitles.push(buildFlow.candidates[1]?.title ?? '')
    }
    const targets = toAddTitles.filter((title) => title.length > 0)
    if (targets.length === 0) {
      await appendAssistantAndStore('A 담기 / B 담기 / 둘 다 담기 중에서 선택해 주세요.')
      return true
    }
    for (const title of targets) {
      await runToolWithFallback({ name: 'shoppingListTool', args: { action: 'add', hint: `책 추가 ${title}` } }, 'add_book')
    }
    setBuildFlow((prev) => ({ ...prev, step: 'step4_review_confirm' }))
    await appendAssistantAndStore(`현재 리스트는 ${shoppingListCount}권이에요. 이 리스트로 확정할까요?`)
    return true
  }

  if (buildFlow.step === 'step4_review_confirm') {
    if (intentText.includes('확정') || /^진행/.test(intentText)) {
      setBuildFlow((prev) => ({ ...prev, step: 'confirmed' }))
      await appendAssistantAndStore('리스트 확정을 완료했어요. 이 목록으로 다음 단계를 진행할 수 있어요.')
      return true
    }
    if (intentText.includes('한 권 더') || intentText.includes('더 고르')) {
      if (!buildFlow.selectedTheme) {
        await appendAssistantAndStore('먼저 테마를 다시 선택해 주세요.')
        setBuildFlow((prev) => ({ ...prev, step: 'step2_theme_select' }))
        return true
      }
      const candidates = await loadCandidatesForTheme(buildFlow.selectedTheme, buildFlow.candidateRefreshCount + 1)
      if (candidates.length < 2) {
        await appendAssistantAndStore('후보를 더 준비하지 못했어요. 현재 리스트를 확정하거나 다른 요청을 입력해 주세요.')
        return true
      }
      setBuildFlow((prev) => ({
        ...prev,
        step: 'step3_ab_pick',
        candidates,
        candidateRefreshCount: prev.candidateRefreshCount + 1,
      }))
      await appendAssistantAndStore('좋아요. 한 권 더 고를 수 있도록 2권을 다시 보여드릴게요.', formatAbCandidateAttachments(candidates))
      return true
    }
    return false
  }

  if (buildFlow.step === 'confirmed') {
    await appendAssistantAndStore('리스트는 이미 확정된 상태예요. 새로 고르려면 시작 모드를 다시 선택해 주세요.')
    return true
  }

  return false
}
