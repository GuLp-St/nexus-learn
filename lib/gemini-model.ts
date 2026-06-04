// Fallback order: Firestore config → GEMINI_MODEL env → hardcoded default
const HARDCODED_DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"

function getEnvGeminiModel(): string | null {
  const fromEnv =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : null
}
type CacheEntry = { value: string; expiresAt: number }

let cachedModel: CacheEntry | null = null

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function extractModelFromDoc(data: Record<string, unknown>): string | null {
  // Supported shapes:
  // - { geminiModel: "..." }
  // - { model: "..." }
  // - { modelName: "..." }
  // - { gemini: { model: "..." } }
  const direct = data.geminiModel ?? data.model ?? data.modelName
  if (isNonEmptyString(direct)) return direct.trim()

  const gemini = data.gemini
  if (gemini && typeof gemini === "object") {
    const nestedModel =
      (gemini as Record<string, unknown>).model ??
      (gemini as Record<string, unknown>).modelName
    if (isNonEmptyString(nestedModel)) return nestedModel.trim()
  }

  return null
}

/**
 * Fetch the Gemini model name from Firestore so changing a single DB value
 * updates the whole system. Falls back to `DEFAULT_GEMINI_MODEL`.
 *
 * Firestore path (recommended):
 * - collection: `config`
 * - doc: `ai`
 * - field: `geminiModel` (string)
 */
export async function getGeminiModelName(): Promise<string> {
  const now = Date.now()
  if (cachedModel && cachedModel.expiresAt > now) return cachedModel.value

  try {
    const { db } = await import("./firebase")
    const { doc, getDoc } = await import("firebase/firestore")

    // Try a few common config doc locations (in priority order).
    // This stays safe: we're only reading a *model name*, not secrets.
    const candidates: Array<[collection: string, docId: string]> = [
      ["config", "ai"],
      ["config", "gemini"],
      ["config", "models"],
      ["settings", "ai"],
      ["settings", "gemini"],
    ]

    for (const [collection, docId] of candidates) {
      const snap = await getDoc(doc(db, collection, docId))
      if (!snap.exists()) continue

      const data = snap.data() as Record<string, unknown>
      const fromDb = extractModelFromDoc(data)
      if (fromDb) {
        cachedModel = { value: fromDb, expiresAt: now + 60_000 }
        return fromDb
      }
    }
  } catch {
    // Ignore and fall back to default.
  }

  const fallback = getEnvGeminiModel() ?? HARDCODED_DEFAULT_GEMINI_MODEL
  cachedModel = { value: fallback, expiresAt: now + 60_000 }
  return fallback
}

export function invalidateGeminiModelCache(): void {
  cachedModel = null
}

