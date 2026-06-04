import type { ActiveFocus, PageContext } from "./page-context-types"

export function buildPageContext(
  route: string,
  partial: Omit<PageContext, "route"> & { route?: string }
): PageContext {
  return {
    route: partial.route ?? route,
    title: partial.title,
    description: partial.description,
    pageData: partial.pageData,
    activeFocus: partial.activeFocus ?? null,
    suggestedChips: partial.suggestedChips,
  }
}

/** System context string for Gemini — never includes raw correct answers from quiz pageData. */
export function formatPageContextForPrompt(ctx: PageContext | null): string {
  if (!ctx) {
    return `[SYSTEM CONTEXT]
Current Page: Unknown (Context not set)
Page Description: The page context has not been set. Ask the user where they are or what they're looking at.`
  }

  const focusLine = ctx.activeFocus?.content
    ? `The user is currently focused on (${ctx.activeFocus.type}): ${ctx.activeFocus.content}`
    : "No specific on-screen focus detected."

  const safeData = sanitizePageDataForPrompt(ctx.pageData)

  return `[SYSTEM CONTEXT]
Route: ${ctx.route}
Current Page: ${ctx.title}
Page Description: ${ctx.description}
User Focus: ${focusLine}${safeData ? `\nPage Data (safe): ${JSON.stringify(safeData, null, 2)}` : ""}`
}

const STRIP_KEYS = new Set([
  "correctAnswer",
  "correctOrder",
  "correctLineId",
  "isCorrect",
  "suggestedAnswer",
])

/** Strip answer keys from page data before sending to the model. */
function sanitizePageDataForPrompt(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null
  return stripSensitiveFields(JSON.parse(JSON.stringify(data))) as Record<string, unknown>
}

function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveFields)
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k)) continue
      if (k === "options" && Array.isArray(v)) {
        out[k] = (v as Record<string, unknown>[]).map((opt) => {
          if (opt && typeof opt === "object") {
            const { isCorrect, ...rest } = opt as Record<string, unknown>
            void isCorrect
            return rest
          }
          return opt
        })
        continue
      }
      out[k] = stripSensitiveFields(v)
    }
    return out
  }
  return value
}

export function defaultChipsForRoute(route: string): string[] {
  if (route === "/" || route === "") {
    return ["What are my quests today?", "How do I earn more Nexon?"]
  }
  if (route === "/journey") {
    return ["Daily Quests", "My Stats"]
  }
  if (route.match(/^\/journey\/[^/]+$/)) {
    return ["Summarize Course", "What's Next?"]
  }
  if (route.includes("/lessons/")) {
    return ["Summarize this section", "Explain simply"]
  }
  if (route.includes("/quiz")) {
    return ["Give me a hint", "Help me understand this question"]
  }
  return ["Tell me more", "Help me understand"]
}

export function resolveSuggestedChips(ctx: PageContext | null, route: string): string[] {
  if (ctx?.suggestedChips && ctx.suggestedChips.length > 0) {
    return ctx.suggestedChips.slice(0, 4)
  }
  return defaultChipsForRoute(route)
}

export function textFromLessonBlock(block: { type: string; content?: string; question?: string }): string {
  if (block.type === "text" && block.content) {
    return block.content.slice(0, 1200)
  }
  if (block.question) {
    return block.question.slice(0, 800)
  }
  return `${block.type} block`
}

export function activeFocusFromLessonBlock(
  block: { type: string; content?: string; question?: string },
  index: number
): ActiveFocus {
  if (block.type === "text") {
    return {
      type: "text-block",
      id: `block-${index}`,
      content: (block.content || "").slice(0, 1200),
    }
  }
  return {
    type: "interaction",
    id: `block-${index}`,
    content: (block.question || block.type).slice(0, 800),
  }
}
