export function getAuthErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code)
      : undefined

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Invalid email or password."
    case "auth/email-already-in-use":
      return "An account with this email already exists."
    case "auth/weak-password":
      return "Password must be at least 6 characters."
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again."
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again."
    case "auth/popup-blocked":
      return "Sign-in popup was blocked. Redirecting to Google…"
    case "auth/unauthorized-domain":
      return "This site is not authorized for sign-in. Contact support if this persists."
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled."
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method."
    default:
      return fallback
  }
}
