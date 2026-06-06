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

/** Baseline context for every route — pages with setPageContext override this. */
export function defaultContextForRoute(route: string): PageContext {
  const chips = defaultChipsForRoute(route)

  if (route === "/" || route === "") {
    return {
      route,
      title: "Dashboard",
      description:
        "The user's home dashboard with daily quests, community activity, and quick links to learning.",
      suggestedChips: chips,
      pageData: { pageType: "dashboard" },
    }
  }
  if (route === "/auth") {
    return {
      route,
      title: "Sign In / Sign Up",
      description:
        "Authentication page. Users can sign in or create an account with email, password, and nickname.",
      suggestedChips: chips,
      pageData: { pageType: "auth" },
    }
  }
  if (route === "/create-course" || route.startsWith("/create-course/")) {
    return {
      route,
      title: "Create Course",
      description:
        "Course creation hub. Users can generate a journey from an AI topic, upload PDF/DOCX/PPTX materials, or browse the community library. Requires a one-time Nexon creation fee per mode.",
      suggestedChips: chips,
      pageData: { pageType: "create-course" },
    }
  }
  if (route === "/journey") {
    return {
      route,
      title: "Journey",
      description: "The user's course library and learning progress overview.",
      suggestedChips: chips,
      pageData: { pageType: "journey" },
    }
  }
  if (route.match(/^\/journey\/[^/]+\/publish$/)) {
    return {
      route,
      title: "Publish Course",
      description:
        "Page to publish a completed private course to the community library. Has level, quiz score, and Nexon requirements.",
      suggestedChips: chips,
      pageData: { pageType: "publish" },
    }
  }
  if (route.includes("/quiz/history")) {
    return {
      route,
      title: "Quiz History",
      description: "Past quiz attempts for a course with scores and review.",
      suggestedChips: chips,
      pageData: { pageType: "quiz-history" },
    }
  }
  if (route.match(/^\/journey\/[^/]+$/)) {
    return {
      route,
      title: "Course Detail",
      description: "A single course with modules, lessons, progress, and quizzes.",
      suggestedChips: chips,
      pageData: { pageType: "course-detail" },
    }
  }
  if (route.includes("/lessons/")) {
    return {
      route,
      title: "Lesson",
      description: "An interactive lesson with text blocks, videos, and practice interactions.",
      suggestedChips: chips,
      pageData: { pageType: "lesson" },
    }
  }
  if (route.includes("/quiz")) {
    return {
      route,
      title: "Quiz",
      description: "A module or final quiz. Help with hints and understanding, not answers.",
      suggestedChips: chips,
      pageData: { pageType: "quiz" },
    }
  }
  if (route === "/store") {
    return {
      route,
      title: "Store",
      description:
        "Cosmetics shop. Nexon buys items directly. Style Shards (from perfect module quizzes) open Nexus Cache loot boxes (5 shards each) for random unowned cosmetics. Free Nexus Caches come from final exam 100% rewards.",
      suggestedChips: chips,
      pageData: { pageType: "store" },
    }
  }
  if (route === "/leaderboard") {
    return {
      route,
      title: "Leaderboard",
      description: "XP rankings — global and friends leaderboards.",
      suggestedChips: chips,
      pageData: { pageType: "leaderboard" },
    }
  }
  if (route === "/friends") {
    return {
      route,
      title: "Friends",
      description: "Social page for friends list, friend requests, and challenges.",
      suggestedChips: chips,
      pageData: { pageType: "friends" },
    }
  }
  if (route === "/profile") {
    return {
      route,
      title: "My Profile",
      description: "The user's own profile with XP, badges, cosmetics, and stats.",
      suggestedChips: chips,
      pageData: { pageType: "profile" },
    }
  }
  if (route.match(/^\/profile\/[^/]+$/)) {
    return {
      route,
      title: "User Profile",
      description: "Another user's public profile and activity.",
      suggestedChips: chips,
      pageData: { pageType: "profile-other" },
    }
  }
  if (route.startsWith("/challenges/")) {
    return {
      route,
      title: "Challenge Quiz",
      description: "A competitive quiz challenge against a friend.",
      suggestedChips: chips,
      pageData: { pageType: "challenge" },
    }
  }
  if (route === "/admin/users") {
    return {
      route,
      title: "Admin — Users",
      description:
        "Admin panel to search users, edit XP/Nexon, manage course progress, badges, cosmetics, impersonate, or delete accounts.",
      suggestedChips: chips,
      pageData: { pageType: "admin-users" },
    }
  }
  if (route === "/admin/courses") {
    return {
      route,
      title: "Admin — Courses",
      description: "Admin panel to manage published community courses.",
      suggestedChips: chips,
      pageData: { pageType: "admin-courses" },
    }
  }
  if (route === "/admin/keys") {
    return {
      route,
      title: "Admin — API Keys",
      description: "Admin panel for Gemini and Cloudflare API key management and testing.",
      suggestedChips: chips,
      pageData: { pageType: "admin-keys" },
    }
  }
  if (route.startsWith("/courses/")) {
    return {
      route,
      title: "Course Lesson",
      description: "Legacy course lesson view with interactive content.",
      suggestedChips: chips,
      pageData: { pageType: "course-lesson" },
    }
  }

  return {
    route,
    title: "NexusLearn",
    description: `The user is on ${route || "an unknown page"}. Help them navigate or understand what they can do here.`,
    suggestedChips: chips,
    pageData: { pageType: "unknown", route },
  }
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
  if (route === "/auth") {
    return ["How do I create an account?", "What is NexusLearn?"]
  }
  if (route === "/create-course" || route.startsWith("/create-course/")) {
    return ["How does AI creation work?", "What file types can I upload?"]
  }
  if (route === "/store") {
    return ["What is Nexus Cache?", "How do I get Style Shards?", "How do I earn Nexon?"]
  }
  if (route === "/friends") {
    return ["How do I add friends?", "What are challenges?"]
  }
  if (route.startsWith("/admin/")) {
    return ["What can I do on this admin page?"]
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
