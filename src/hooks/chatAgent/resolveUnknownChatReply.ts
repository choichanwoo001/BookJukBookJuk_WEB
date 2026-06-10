import type { LlmPlan } from '../../agent/runtime/llmPlanner'
import { generateConversationalReply } from '../../agent/runtime/llmChatReply'
import type { AgentContext, AgentMessage } from '../../agent/types'
import { CHAT_AGENT_MESSAGES } from './messages'
import { isOffTopicUserMessage } from './offTopicClassifier'

export type UnknownChatReplyKind = 'off_topic' | 'conversational'

export async function resolveUnknownChatReply(input: {
  text: string
  llmPlan: LlmPlan | null
  context: AgentContext
  history: AgentMessage[]
}): Promise<{ kind: UnknownChatReplyKind; text: string; usedLlm: boolean }> {
  if (isOffTopicUserMessage(input.text)) {
    return { kind: 'off_topic', text: CHAT_AGENT_MESSAGES.offTopic, usedLlm: false }
  }

  const plannerDraft = input.llmPlan?.assistantDraft?.trim()
  if (plannerDraft) {
    return { kind: 'conversational', text: plannerDraft, usedLlm: true }
  }

  const generated = await generateConversationalReply({
    text: input.text,
    context: input.context,
    history: input.history,
  })
  if (generated) {
    return { kind: 'conversational', text: generated, usedLlm: true }
  }

  return { kind: 'conversational', text: CHAT_AGENT_MESSAGES.unknownFallback, usedLlm: false }
}
