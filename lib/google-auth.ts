import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { auth, db } from "./firebase"

export function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })
  return provider
}

/** Create or update Firestore profile after Google sign-in. */
export async function ensureGoogleUserProfile(
  gUser: User,
  options?: { nickname?: string }
): Promise<void> {
  const userRef = doc(db, "users", gUser.uid)
  const existing = await getDoc(userRef)

  if (!existing.exists()) {
    await setDoc(userRef, {
      nickname: options?.nickname?.trim() || gUser.displayName?.split(" ")[0] || "Learner",
      email: gUser.email,
      xp: 0,
      dailyLoginStreak: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const { checkAndAwardDailyLoginXP } = await import("./xp-utils")
    await checkAndAwardDailyLoginXP(gUser.uid)
  }
}

function isPopupBlockedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: string }).code
  return (
    code === "auth/popup-blocked" ||
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
}

function prefersRedirect(): boolean {
  if (typeof window === "undefined") return false
  const ua = navigator.userAgent
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && !!(navigator as { standalone?: boolean }).standalone)
  return mobile || standalone
}

/**
 * Sign in with Google — redirect on mobile/PWA (reliable), popup on desktop with redirect fallback.
 */
export async function signInWithGoogle(options?: {
  nickname?: string
}): Promise<{ method: "popup" | "redirect" }> {
  const provider = createGoogleProvider()

  if (prefersRedirect()) {
    if (options?.nickname?.trim()) {
      sessionStorage.setItem("google-signup-nickname", options.nickname.trim())
    }
    await signInWithRedirect(auth, provider)
    return { method: "redirect" }
  }

  try {
    const result = await signInWithPopup(auth, provider)
    await ensureGoogleUserProfile(result.user, options)
    return { method: "popup" }
  } catch (err) {
    if (isPopupBlockedError(err)) {
      if (options?.nickname?.trim()) {
        sessionStorage.setItem("google-signup-nickname", options.nickname.trim())
      }
      await signInWithRedirect(auth, provider)
      return { method: "redirect" }
    }
    throw err
  }
}
