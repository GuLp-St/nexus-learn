import { NextRequest, NextResponse } from "next/server"
import { checkAndHandleExpiredChallengesAdmin } from "@/lib/challenge-expire-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Auth for external schedulers (e.g. cron-job.org).
 * Prefer header; query ?secret= is supported for simple cron UI setups.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const authHeader = request.headers.get("authorization")
  if (authHeader === `Bearer ${secret}`) return true

  const cronHeader = request.headers.get("x-cron-secret")
  if (cronHeader === secret) return true

  const querySecret = request.nextUrl.searchParams.get("secret")
  if (querySecret === secret) return true

  return false
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await checkAndHandleExpiredChallengesAdmin()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[cron/challenges-expire]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sweep failed" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
