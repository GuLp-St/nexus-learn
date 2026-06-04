import { FieldValue } from "firebase/firestore"

/** Recursively remove `undefined` values — Firestore rejects them on write. */
export function omitUndefinedDeep<T>(input: T): T {
  if (input === undefined || input === null) {
    return input
  }
  if (input instanceof FieldValue) {
    return input
  }
  if (Array.isArray(input)) {
    return input.map((item) => omitUndefinedDeep(item)) as T
  }
  if (typeof input === "object" && (input as object).constructor === Object) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value === undefined) continue
      result[key] = omitUndefinedDeep(value)
    }
    return result as T
  }
  return input
}
