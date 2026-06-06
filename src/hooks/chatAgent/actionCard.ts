import type { ChatActionCard, ShoppingListEntry } from '../../agent/types'
import type { StartMode } from '../../types/startMode'
import { candidateInShoppingList, type BuildFlowSession } from './buildFlow'

export function buildChatActionCard(
  startMode: StartMode,
  buildFlow: BuildFlowSession,
  shoppingList: ShoppingListEntry[],
): ChatActionCard | null {
  const shoppingListCount = shoppingList.length
    if (startMode !== 'build_list_chat') return null
    if (buildFlow.step === 'step2_theme_select') {
      const optionsList = buildFlow.themes.map((theme, index) => ({
        id: theme.id,
        label: `${index + 1}. ${theme.name}`,
        inputText: `${index + 1}번`,
      }))
      optionsList.push({ id: 'theme_regen', label: '다시 추천', inputText: '다시 추천' })
      return {
        title: '어울리는 테마를 골라 주세요',
        description: '답변 기반으로 고른 3가지입니다.',
        options: optionsList,
      }
    }
    if (buildFlow.step === 'step3_ab_pick' && buildFlow.candidates.length >= 2) {
      const [candidateA, candidateB] = buildFlow.candidates
      const aInList = candidateInShoppingList(candidateA, shoppingList)
      const bInList = candidateInShoppingList(candidateB, shoppingList)
      const options = [
        { id: 'add_a', label: 'A 담기', inputText: 'A 담기' },
        { id: 'add_b', label: 'B 담기', inputText: 'B 담기' },
        { id: 'add_both', label: '둘 다 담기', inputText: '둘 다 담기' },
      ]
      if (aInList) {
        options.push({ id: 'remove_a', label: 'A 담기 취소', inputText: 'A 빼기' })
      }
      if (bInList) {
        options.push({ id: 'remove_b', label: 'B 담기 취소', inputText: 'B 빼기' })
      }
      if (aInList && bInList) {
        options.push({ id: 'remove_both', label: '둘 다 담기 취소', inputText: '둘 다 빼기' })
      }
      options.push({ id: 'refresh_ab', label: '다른 2권 보기', inputText: '다른 2권 보기' })
      return {
        title: '어떤 책을 리스트에 담을까요?',
        description: 'A/B 중 선택하거나 담은 책은 빼기로 취소할 수 있어요.',
        options,
      }
    }
    if (buildFlow.step === 'step4_review_confirm') {
      const [candidateA, candidateB] = buildFlow.candidates
      const options = [
        { id: 'confirm', label: '이 리스트로 확정', inputText: '리스트 확정' },
        { id: 'more', label: '한 권 더 고르기', inputText: '한 권 더 고르기' },
      ]
      if (candidateA && candidateInShoppingList(candidateA, shoppingList)) {
        options.push({ id: 'remove_a', label: 'A 담기 취소', inputText: 'A 빼기' })
      }
      if (candidateB && candidateInShoppingList(candidateB, shoppingList)) {
        options.push({ id: 'remove_b', label: 'B 담기 취소', inputText: 'B 빼기' })
      }
      return {
        title: '리스트를 확정할까요?',
        description: `현재 ${shoppingListCount}권이 담겨 있어요.`,
        options,
      }
    }
    return null

}
