import {
  GoogleGenerativeAI,
  type GenerateContentRequest,
  type GenerativeModel,
  type Tool,
} from "@google/generative-ai"
import { getGeminiApiKeys } from "./gemini-keys"
import { recordGeminiKeyUsage } from "./api-key-usage"
import { getGeminiModelName } from "./gemini-model"

export type ModelOptions = {
  tools?: Tool[]
  systemInstruction?: string
}

let roundRobin = 0

export function isGeminiRateLimitError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error)

  return (
    /429|rate.?limit|quota|resource.?exhausted|overloaded|too many requests/i.test(
      message
    ) || /limit:\s*0/i.test(message)
  )
}

async function buildClients(): Promise<{ keys: string[]; clients: GoogleGenerativeAI[] }> {
  const keys = await getGeminiApiKeys()
  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Add geminiApiKeys to Firestore config/ai or set NEXT_PUBLIC_GEMINI_API_KEY in .env.local"
    )
  }
  return {
    keys,
    clients: keys.map((key) => new GoogleGenerativeAI(key)),
  }
}

function resolveKeyIndex(preferred: number | undefined, keyCount: number): number {
  if (keyCount === 0) return 0
  if (preferred !== undefined) return preferred % keyCount
  const idx = roundRobin % keyCount
  roundRobin++
  return idx
}

/**
 * Get a GenerativeModel bound to a specific key index (for parallel tasks).
 */
export async function getPooledModel(
  options: ModelOptions = {},
  preferredKeyIndex?: number
): Promise<{ model: GenerativeModel; keyIndex: number }> {
  const { keys, clients } = await buildClients()
  const keyIndex = resolveKeyIndex(preferredKeyIndex, keys.length)
  const modelName = await getGeminiModelName()

  const model = clients[keyIndex].getGenerativeModel({
    model: modelName,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.systemInstruction
      ? { systemInstruction: options.systemInstruction }
      : {}),
  })

  return { model, keyIndex }
}

/**
 * Run generateContent with automatic key rotation on rate limits.
 */
export async function poolGenerateContent(
  request: string | GenerateContentRequest,
  options: ModelOptions = {},
  preferredKeyIndex?: number
) {
  const { keys, clients } = await buildClients()
  const modelName = await getGeminiModelName()
  const startIdx = resolveKeyIndex(preferredKeyIndex, keys.length)

  let lastError: unknown

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (startIdx + attempt) % keys.length
    try {
      const model = clients[keyIndex].getGenerativeModel({
        model: modelName,
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.systemInstruction
          ? { systemInstruction: options.systemInstruction }
          : {}),
      })
      const result = await model.generateContent(request)
      recordGeminiKeyUsage(keyIndex)
      return { response: result.response, keyIndex }
    } catch (error) {
      lastError = error
      if (!isGeminiRateLimitError(error)) throw error
      recordGeminiKeyUsage(keyIndex, true)
      console.warn(
        `[Gemini Pool] Rate limit on key #${keyIndex + 1}/${keys.length}, trying next...`
      )
    }
  }

  throw lastError ?? new Error("All Gemini API keys exhausted")
}

/** Convenience: return response text only. */
export async function poolGenerateText(
  request: string | GenerateContentRequest,
  options: ModelOptions = {},
  preferredKeyIndex?: number
): Promise<string> {
  const { response } = await poolGenerateContent(request, options, preferredKeyIndex)
  return response.text()
}

/**
 * Run independent tasks in parallel, each pinned to a different API key when possible.
 * Use for per-file upload analysis, parallel quiz batches, etc.
 * Results are returned in the same order as `items`.
 */
export async function mapParallelWithKeys<T, R>(
  items: T[],
  fn: (item: T, keyIndex: number, index: number) => Promise<R>,
  maxConcurrency?: number
): Promise<R[]> {
  if (items.length === 0) return []

  const { keys } = await buildClients()
  const concurrency = Math.min(
    maxConcurrency ?? items.length,
    items.length,
    Math.max(keys.length, 1)
  )

  const results: R[] = new Array(items.length)
  let nextItem = 0

  async function worker() {
    while (true) {
      const index = nextItem++
      if (index >= items.length) break
      const keyIndex = index % keys.length

      results[index] = await runWithKeyRetry(
        (ki) => fn(items[index], ki, index),
        keyIndex
      )
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

/** Retry a task across all keys when rate-limited. */
export async function runWithKeyRetry<T>(
  fn: (keyIndex: number) => Promise<T>,
  preferredKeyIndex?: number
): Promise<T> {
  const { keys } = await buildClients()
  const startIdx = resolveKeyIndex(preferredKeyIndex, keys.length)
  let lastError: unknown

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (startIdx + attempt) % keys.length
    try {
      const result = await fn(keyIndex)
      recordGeminiKeyUsage(keyIndex)
      return result
    } catch (error) {
      lastError = error
      if (!isGeminiRateLimitError(error)) throw error
      recordGeminiKeyUsage(keyIndex, true)
      console.warn(
        `[Gemini Pool] Rate limit on key #${keyIndex + 1}/${keys.length}, retrying...`
      )
    }
  }

  throw lastError ?? new Error("All Gemini API keys exhausted")
}
