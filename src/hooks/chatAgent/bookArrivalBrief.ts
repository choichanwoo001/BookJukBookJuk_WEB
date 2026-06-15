import type { DemoBookDef } from '../../data/demoScenario'
import type { PipelineItem } from './assistantOutputPipeline'

export const TTS_MAX_TEXT_LENGTH = 300

export function buildBookArrivalBriefItems(
  def: DemoBookDef,
  leg: number,
  options?: { holdMobilityAfterBrief?: boolean },
): PipelineItem[] {
  const holdAfter = options?.holdMobilityAfterBrief === true
  return [
    {
      text: `「${def.title}」 서가에 도착했어요. ${def.synopsisBrief}`,
      gate: { kind: 'on_shelf_arrived', leg },
      mobilityHoldThrough: true,
    },
    {
      text: def.reviewBrief,
      gate: { kind: 'immediate' },
      mobilityHoldThrough: true,
    },
    {
      text: def.authorBioBrief,
      gate: { kind: 'immediate' },
      ...(holdAfter ? { mobilityHoldThrough: true } : {}),
    },
  ]
}
