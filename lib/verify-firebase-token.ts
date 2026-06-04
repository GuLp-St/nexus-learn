import type { NextRequest } from "next/server"
import { getAdminAuth } from "./firebase-admin"

export class AuthError extends Error {
  status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}

/** Verify `Authorization: Bearer <Firebase ID token>` and return the uid. */
export async function verifyRequestUserId(request: NextRequest): Promise<string> {
  const header = request.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Missing authorization", 401)
  }

  const token = header.slice(7).trim()
  if (!token) {
    throw new AuthError("Missing authorization", 401)
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return decoded.uid
  } catch {
    throw new AuthError("Invalid or expired token", 401)
  }
}

/** Require body/form `userId` to match the verified token uid. */
export function assertMatchingUserId(verifiedUid: string, claimedUserId: string | undefined): string {
  if (!claimedUserId?.trim()) {
    throw new AuthError("Missing userId", 400)
  }
  if (claimedUserId !== verifiedUid) {
    throw new AuthError("userId does not match authenticated user", 403)
  }
  return verifiedUid
}
