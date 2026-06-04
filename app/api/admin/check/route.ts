import { NextRequest, NextResponse } from "next/server"
import { isUserAdmin, requireAdmin } from "@/lib/admin-auth"
import { verifyRequestUserId } from "@/lib/verify-firebase-token"
import { adminErrorResponse } from "@/lib/admin-route-utils"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const uid = await verifyRequestUserId(request)
    const isAdmin = await isUserAdmin(uid)
    return NextResponse.json({ isAdmin, uid })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
