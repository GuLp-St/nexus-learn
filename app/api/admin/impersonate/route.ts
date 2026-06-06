import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const adminUid = await requireAdmin(request)
    const body = await request.json()
    const targetUserId = (body.userId as string | undefined)?.trim()

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    if (targetUserId === adminUid) {
      return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 })
    }

    const db = getAdminFirestore()
    const userSnap = await db.collection("users").doc(targetUserId).get()
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const data = userSnap.data()!
    if (data.role === "admin") {
      return NextResponse.json({ error: "Cannot impersonate another admin" }, { status: 400 })
    }

    const customToken = await getAdminAuth().createCustomToken(targetUserId)

    return NextResponse.json({
      customToken,
      userId: targetUserId,
      nickname: data.nickname ?? null,
      email: data.email ?? null,
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
