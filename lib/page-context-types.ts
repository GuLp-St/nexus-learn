export type ActiveFocusType = "question" | "video" | "text-block" | "interaction" | "quiz-question"

export interface ActiveFocus {
  type: ActiveFocusType
  id: string
  content: string
}

export interface PageContext {
  route: string
  title: string
  /** High-level page summary for the model */
  description: string
  pageData?: Record<string, unknown>
  activeFocus?: ActiveFocus | null
  suggestedChips?: string[]
}

export function isLegacyPageContext(
  ctx: PageContext | { title: string; description: string; data?: unknown }
): ctx is { title: string; description: string; data?: unknown } {
  return ctx != null && "data" in ctx && !("pageData" in ctx)
}

export function normalizePageContext(
  ctx: PageContext | { title: string; description: string; data?: unknown } | null,
  route: string
): PageContext | null {
  if (!ctx) return null
  if (isLegacyPageContext(ctx)) {
    return {
      route,
      title: ctx.title,
      description: ctx.description,
      pageData: (ctx.data as Record<string, unknown>) ?? undefined,
      activeFocus: null,
      suggestedChips: undefined,
    }
  }
  return { ...ctx, route: ctx.route || route }
}
