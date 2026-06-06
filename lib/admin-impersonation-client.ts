import { signInWithCustomToken } from "firebase/auth"
import { auth } from "./firebase"
import { adminJson } from "./admin-api-client"
import {
  clearImpersonationSession,
  getImpersonationAdminToken,
  setImpersonationSession,
} from "./impersonation-client"

export async function startImpersonation(targetUserId: string): Promise<void> {
  const current = auth.currentUser
  if (!current) {
    throw new Error("You must be signed in as admin")
  }

  const adminToken = await current.getIdToken()
  const adminUid = current.uid

  const data = await adminJson<{
    customToken: string
    nickname: string | null
    email: string | null
    userId: string
  }>("/api/admin/impersonate", {
    method: "POST",
    body: { userId: targetUserId },
  })

  setImpersonationSession({
    adminToken,
    adminUid,
    targetLabel: data.nickname || data.email || data.userId,
  })

  await signInWithCustomToken(auth, data.customToken)
  window.location.href = "/"
}

export async function stopImpersonation(): Promise<void> {
  const adminToken = getImpersonationAdminToken()
  if (!adminToken) {
    clearImpersonationSession()
    await auth.signOut()
    window.location.href = "/auth"
    return
  }

  const res = await fetch("/api/admin/stop-impersonate", {
    method: "POST",
    headers: { "X-Admin-Return-Token": adminToken },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    clearImpersonationSession()
    throw new Error(
      (data as { error?: string }).error ||
        "Could not restore admin session — sign in again"
    )
  }

  await signInWithCustomToken(auth, (data as { customToken: string }).customToken)
  clearImpersonationSession()
  window.location.href = "/admin/users"
}
