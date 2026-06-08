/** Bump when tour content changes — users below this version see the welcome prompt again. */
export const ONBOARDING_VERSION = 1

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center"

export type TourStep = {
  id: string
  /** Exact pathname, or "*" for any authenticated page */
  route: string
  target?: string
  /** Try each id in order — first visible match wins (e.g. mobile vs desktop bell) */
  targets?: string[]
  title: string
  body: string
  placement?: TourPlacement
  /** Navigate before showing this step */
  navigateTo?: string
  /** Open mobile sidebar so nav targets are visible */
  openSidebar?: boolean
  /** Close mobile sidebar (e.g. before highlighting the header notification bell) */
  closeSidebar?: boolean
  /** Briefly open Nexus chat panel (used on chatbot intro step) */
  openChatbot?: boolean
}

export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    placement: "center",
    title: "Welcome to NexusLearn!",
    body:
      "I'm Nexus, your learning companion. This quick tour shows where everything lives — daily rewards, courses, friends, and how to get help anytime.",
  },
  {
    id: "chatbot",
    route: "*",
    target: "chatbot-fab",
    placement: "left",
    title: "I'm always here",
    body:
      "Tap my icon anytime to ask questions, get quiz hints, or restart this tour. You can drag me to move me around the screen.",
  },
  {
    id: "create-course",
    route: "/",
    target: "create-course-cta",
    placement: "bottom",
    title: "Create your first course",
    body:
      "Start here to generate a course from a topic (AI) or upload PDF, Word, or PowerPoint files. Each new journey costs 150 Nexon — earn it from quests and quizzes.",
  },
  {
    id: "daily-quests",
    route: "/",
    target: "daily-quests",
    placement: "bottom",
    title: "Daily quests",
    body:
      "Complete quests every day for XP and Nexon. Claim rewards when a quest fills up — they're the fastest way to fund your next course.",
  },
  {
    id: "nav-journey",
    route: "/journey",
    navigateTo: "/journey",
    target: "nav-journey",
    placement: "right",
    openSidebar: true,
    title: "Your Journey Map",
    body:
      "All your courses live here. Open a course to see modules, lessons, and quizzes on a visual roadmap. Progress unlocks the next lessons automatically.",
  },
  {
    id: "nav-leaderboard",
    route: "/leaderboard",
    navigateTo: "/leaderboard",
    target: "nav-leaderboard",
    placement: "right",
    openSidebar: true,
    title: "Leaderboard",
    body:
      "See how you rank by XP against other learners. A little friendly competition keeps the streak going.",
  },
  {
    id: "nav-social",
    route: "/friends",
    navigateTo: "/friends",
    target: "nav-social",
    placement: "right",
    openSidebar: true,
    title: "Friends & challenges",
    body:
      "Add friends, chat, and send 1v1 quiz challenges. Powered mode adds live duels with power-ups — great for revising with classmates.",
  },
  {
    id: "nav-store",
    route: "/store",
    navigateTo: "/store",
    target: "nav-store",
    placement: "right",
    openSidebar: true,
    title: "Store & cosmetics",
    body:
      "Spend Style Shards and Nexon on avatar frames, themes, and wallpapers. Level up to unlock more generated course slots.",
  },
  {
    id: "notifications",
    route: "*",
    targets: ["notifications-mobile", "notifications-desktop"],
    placement: "bottom",
    closeSidebar: true,
    title: "Notifications",
    body:
      "Friend requests, challenge invites, course-ready alerts, and quest reminders all land here. Check the bell so you never miss a duel.",
  },
  {
    id: "create-modes",
    route: "/create-course",
    navigateTo: "/create-course",
    target: "create-mode-tabs",
    placement: "bottom",
    title: "Two ways to build a course",
    body:
      "AI Topic — type a subject and pick a difficulty path. Upload Files — drop lecture slides or notes (PDF, DOCX, PPTX). You can also use the Browse Library tab to add existing community courses.",
  },
  {
    id: "finish",
    route: "/",
    navigateTo: "/",
    placement: "center",
    title: "You're all set!",
    body:
      "Explore at your own pace. Ask me \"show me around\" or \"restart tutorial\" anytime to run this tour again. Happy learning!",
  },
]

const TUTORIAL_TRIGGER_PATTERNS = [
  /\b(show|give|start|run|take)\s+(me\s+)?(the\s+)?(a\s+)?(quick\s+)?(site\s+)?tour\b/i,
  /\b(show|guide)\s+me\s+around\b/i,
  /\b(restart|redo|repeat|start\s+over)\s+(the\s+)?(tutorial|tour|onboarding)\b/i,
  /\bhow\s+do\s+i\s+(use|navigate)\s+(the\s+)?(app|site)\b/i,
  /\bwhere\s+(do\s+i\s+)?(start|begin)\b/i,
  /\bhelp\s+me\s+get\s+started\b/i,
  /\btutorial\b/i,
  /\bonboarding\b/i,
]

export function isTutorialTrigger(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  return TUTORIAL_TRIGGER_PATTERNS.some((re) => re.test(t))
}

export function tutorialStartReply(): string {
  return "Starting your site tour now — I'll highlight each important area. Use Next to continue or Skip tour if you want to explore on your own. You can ask me to show you around again anytime!"
}

export const TOUR_CHIP_LABEL = "Show me around"
