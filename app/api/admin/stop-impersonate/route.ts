import { NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-auth"
import { AuthError } from "@/lib/verify-firebase-token"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminAuth } from "@/lib/firebase-admin"

export const runtime = "nodejs"

/** Restore admin session after impersonation using the saved admin ID token. */
export async function POST(request: NextRequest) {
  try {
    const returnToken = request.headers.get("X-Admin-Return-Token")?.trim()
    if (!returnToken) {
      throw new AuthError("Missing admin return token", 400)
    }

    let adminUid: string
    try {
      const decoded = await getAdminAuth().verifyIdToken(returnToken)
      adminUid = decoded.uid
    } catch {
      throw new AuthError(
        "Admin session expired — sign in again with your admin account",
        401
      )
    }

    const stillAdmin = await isUserAdmin(adminUid)
    if (!stillAdmin) {
      throw new AuthError("Return token is not an admin account", 403)
    }

    const customToken = await getAdminAuth().createCustomToken(adminUid)
    return NextResponse.json({ customToken, adminUid })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
