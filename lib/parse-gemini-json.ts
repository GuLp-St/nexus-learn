/** Extract the outermost JSON object or array from model text. */
export function extractJsonPayload(text: string): string {
  let jsonText = text.trim()

  const firstBrace = jsonText.indexOf("{")
  const lastBrace = jsonText.lastIndexOf("}")
  const firstBracket = jsonText.indexOf("[")
  const lastBracket = jsonText.lastIndexOf("]")

  if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    jsonText = jsonText.substring(firstBrace, lastBrace + 1)
  } else if (firstBracket !== -1 && lastBracket !== -1) {
    jsonText = jsonText.substring(firstBracket, lastBracket + 1)
  } else if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "")
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "")
  }

  return jsonText.trim()
}

/** Fix common invalid escapes and control chars that break JSON.parse on Gemini output. */
export function sanitizeGeminiJsonText(jsonText: string): string {
  let s = jsonText

  // Remove BOM / zero-width chars
  s = s.replace(/^\uFEFF/, "")

  // Strip trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1")

  // Remove invalid backslash escapes (e.g. \S, \', \x)
  s = s.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})(.|$)/g, "$1")

  return s
}

export function parseGeminiJson<T>(text: string): T {
  const extracted = extractJsonPayload(text)
  const attempts = [
    extracted,
    sanitizeGeminiJsonText(extracted),
    sanitizeGeminiJsonText(extracted.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")),
  ]

  let lastError: unknown
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T
    } catch (err) {
      lastError = err
    }
  }

  throw lastError ?? new Error("Failed to parse Gemini JSON response")
}
