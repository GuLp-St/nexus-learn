/** Layout: keep the floating button out of the fixed sidebar (w-64 = 256px). */
export const CHATBOT_SIDEBAR_WIDTH_PX = 256
export const CHATBOT_BUTTON_SIZE_PX = 56
export const CHATBOT_EDGE_PADDING_PX = 12
export const CHATBOT_POSITION_KEY = "nexus-chatbot-position-v2"

export type ChatbotSavedPosition = {
  version: 2
  xPct: number
  yPct: number
}

export function getChatbotSafeBounds(buttonSize = CHATBOT_BUTTON_SIZE_PX) {
  if (typeof window === "undefined") {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }
  const isDesktop = window.innerWidth >= 1024
  const minX = (isDesktop ? CHATBOT_SIDEBAR_WIDTH_PX : 0) + CHATBOT_EDGE_PADDING_PX
  const minY = CHATBOT_EDGE_PADDING_PX
  const maxX = window.innerWidth - buttonSize - CHATBOT_EDGE_PADDING_PX
  const maxY = window.innerHeight - buttonSize - CHATBOT_EDGE_PADDING_PX
  return {
    minX,
    minY,
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function clampChatbotPixels(x: number, y: number, buttonSize = CHATBOT_BUTTON_SIZE_PX) {
  const { minX, minY, maxX, maxY } = getChatbotSafeBounds(buttonSize)
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  }
}

export function pixelsToPercent(x: number, y: number, buttonSize = CHATBOT_BUTTON_SIZE_PX): ChatbotSavedPosition {
  const { minX, minY, width, height } = getChatbotSafeBounds(buttonSize)
  const xPct = width > 0 ? (x - minX) / width : 1
  const yPct = height > 0 ? (y - minY) / height : 0.5
  return {
    version: 2,
    xPct: Math.max(0, Math.min(1, xPct)),
    yPct: Math.max(0, Math.min(1, yPct)),
  }
}

export function percentToPixels(saved: ChatbotSavedPosition, buttonSize = CHATBOT_BUTTON_SIZE_PX) {
  const { minX, minY, width, height } = getChatbotSafeBounds(buttonSize)
  const x = minX + saved.xPct * width
  const y = minY + saved.yPct * height
  return clampChatbotPixels(x, y, buttonSize)
}

export function getDefaultChatbotPixels(buttonSize = CHATBOT_BUTTON_SIZE_PX) {
  const { minX, minY, maxX, maxY } = getChatbotSafeBounds(buttonSize)
  return clampChatbotPixels(maxX, minY + (maxY - minY) * 0.45, buttonSize)
}

export function loadChatbotPosition(buttonSize = CHATBOT_BUTTON_SIZE_PX): { x: number; y: number } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CHATBOT_POSITION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ChatbotSavedPosition
      if (parsed?.version === 2 && typeof parsed.xPct === "number" && typeof parsed.yPct === "number") {
        return percentToPixels(parsed, buttonSize)
      }
    }
    const legacy = localStorage.getItem("nexus-chatbot-position")
    if (legacy) {
      const { x, y } = JSON.parse(legacy) as { x: number; y: number }
      if (typeof x === "number" && typeof y === "number") {
        const clamped = clampChatbotPixels(x, y, buttonSize)
        saveChatbotPosition(clamped.x, clamped.y, buttonSize)
        return clamped
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveChatbotPosition(x: number, y: number, buttonSize = CHATBOT_BUTTON_SIZE_PX) {
  if (typeof window === "undefined") return
  const clamped = clampChatbotPixels(x, y, buttonSize)
  const saved = pixelsToPercent(clamped.x, clamped.y, buttonSize)
  localStorage.setItem(CHATBOT_POSITION_KEY, JSON.stringify(saved))
}
