import { NextResponse } from "next/server"
import { AuthError } from "./verify-firebase-token"

export function adminErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : "Internal server error"
  console.error("[admin API]", error)
  return NextResponse.json({ error: message }, { status: 500 })
}
