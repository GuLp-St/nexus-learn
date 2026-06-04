import type { NextRequest } from "next/server"
import { getAdminFirestore } from "./firebase-admin"
import { AuthError, verifyRequestUserId } from "./verify-firebase-token"

/** Check if a user is admin via `users/{uid}.role === "admin"` or `config/admins.userIds`. */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const db = getAdminFirestore()

  const userSnap = await db.collection("users").doc(userId).get()
  if (userSnap.exists && userSnap.data()?.role === "admin") {
    return true
  }

  const adminsSnap = await db.collection("config").doc("admins").get()
  if (adminsSnap.exists) {
    const userIds = adminsSnap.data()?.userIds
    if (Array.isArray(userIds) && userIds.includes(userId)) {
      return true
    }
  }

  return false
}

/** Verify Bearer token and ensure the caller is an admin. Returns admin uid. */
export async function requireAdmin(request: NextRequest): Promise<string> {
  const uid = await verifyRequestUserId(request)
  const admin = await isUserAdmin(uid)
  if (!admin) {
    throw new AuthError("Admin access required", 403)
  }
  return uid
}
