const STORAGE = {
  active: "nl_impersonation_active",
  adminToken: "nl_impersonation_admin_token",
  adminUid: "nl_impersonation_admin_uid",
  targetLabel: "nl_impersonation_target_label",
} as const

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(STORAGE.active) === "1"
}

export function getImpersonationTargetLabel(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(STORAGE.targetLabel)
}

export function getImpersonationAdminToken(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(STORAGE.adminToken)
}

export function setImpersonationSession(opts: {
  adminToken: string
  adminUid: string
  targetLabel: string
}): void {
  sessionStorage.setItem(STORAGE.active, "1")
  sessionStorage.setItem(STORAGE.adminToken, opts.adminToken)
  sessionStorage.setItem(STORAGE.adminUid, opts.adminUid)
  sessionStorage.setItem(STORAGE.targetLabel, opts.targetLabel)
}

export function clearImpersonationSession(): void {
  sessionStorage.removeItem(STORAGE.active)
  sessionStorage.removeItem(STORAGE.adminToken)
  sessionStorage.removeItem(STORAGE.adminUid)
  sessionStorage.removeItem(STORAGE.targetLabel)
}
