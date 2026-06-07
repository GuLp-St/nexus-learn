import type { ChatMessage } from "@/lib/gemini"

export interface ChatbotSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

const STORAGE_KEY = "nexus-chatbot-sessions"
const ACTIVE_KEY = "nexus-chatbot-active-session"

function loadAll(): ChatbotSession[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatbotSession[]) : []
  } catch {
    return []
  }
}

function saveAll(sessions: ChatbotSession[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)))
}

export function listChatbotSessions(): ChatbotSession[] {
  return loadAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveSessionId(id: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(ACTIVE_KEY, id)
}

export function createChatbotSession(title = "New chat"): ChatbotSession {
  const session: ChatbotSession = {
    id: `chat_${Date.now()}`,
    title,
    messages: [],
    updatedAt: Date.now(),
  }
  const sessions = loadAll()
  sessions.unshift(session)
  saveAll(sessions)
  setActiveSessionId(session.id)
  return session
}

export function updateChatbotSession(
  id: string,
  patch: Partial<Pick<ChatbotSession, "title" | "messages">>
) {
  const sessions = loadAll()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx < 0) return
  sessions[idx] = {
    ...sessions[idx],
    ...patch,
    updatedAt: Date.now(),
  }
  saveAll(sessions)
}

export function deleteChatbotSession(id: string) {
  const sessions = loadAll().filter((s) => s.id !== id)
  saveAll(sessions)
  if (getActiveSessionId() === id) {
    if (sessions[0]) setActiveSessionId(sessions[0].id)
    else localStorage.removeItem(ACTIVE_KEY)
  }
}

export function titleFromFirstMessage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return "New chat"
  return trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed
}

export function getOrCreateActiveSession(): ChatbotSession {
  const activeId = getActiveSessionId()
  const sessions = loadAll()
  const existing = activeId ? sessions.find((s) => s.id === activeId) : null
  if (existing) return existing
  return createChatbotSession()
}
