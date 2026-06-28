import { z } from 'zod'

function zodMessage(result: { success: true } | { success: false; error: z.ZodError }): string | null {
  if (result.success) return null
  const first = result.error.issues[0]
  return first?.message ?? '인자가 올바르지 않습니다.'
}

const shoppingListArgs = z
  .object({
    action: z.string().min(1),
    hint: z.string().optional(),
    imageBase64: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const action = val.action.trim().toLowerCase()
    if (!['add', 'remove', 'delete'].includes(action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action은 add/remove만 지원합니다. (delete는 remove로 자동 처리됩니다.)',
      })
    }
    const hasHint = Boolean(val.hint?.trim())
    const hasImage = Boolean(val.imageBase64?.trim())
    if (!hasHint && !hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'hint 또는 imageBase64 중 하나는 필요합니다.',
      })
    }
  })

const mobilityArgs = z.object({
  action: z.enum(['pause', 'resume', 'guidance', 'escort']),
})

const routeArgs = z.object({
  mode: z.string().min(1),
})

const recommendationArgs = z.object({
  mode: z.enum(['taste', 'location', 'rating', 'book_alternative']).optional(),
  seedBookId: z.string().optional(),
  negativeReason: z.string().optional(),
})

const bookSearchArgs = z.object({
  query: z.string().min(1),
  limit: z.number().optional(),
})

const goalCheckArgs = z.object({
  mode: z.string().min(1),
})

const fallbackArgs = z.object({
  reason: z.string().optional(),
})

export function validateShoppingListArgs(args: Record<string, unknown>): string | null {
  return zodMessage(shoppingListArgs.safeParse(args))
}

export function validateMobilityArgs(args: Record<string, unknown>): string | null {
  return zodMessage(mobilityArgs.safeParse(args))
}

export function validateRouteArgs(args: Record<string, unknown>): string | null {
  return zodMessage(routeArgs.safeParse(args))
}

export function validateRecommendationArgs(args: Record<string, unknown>): string | null {
  return zodMessage(recommendationArgs.safeParse(args))
}

export function validateBookSearchArgs(args: Record<string, unknown>): string | null {
  return zodMessage(bookSearchArgs.safeParse(args))
}

export function validateGoalCheckArgs(args: Record<string, unknown>): string | null {
  return zodMessage(goalCheckArgs.safeParse(args))
}

export function validateFallbackArgs(args: Record<string, unknown>): string | null {
  return zodMessage(fallbackArgs.safeParse(args))
}
