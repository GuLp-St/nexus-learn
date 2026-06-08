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

function googleNickname(user: User): string {
  return (
    user.displayName?.trim().split(/\s+/)[0] ||
    user.email?.split("@")[0] ||
    "Learner"
  )
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
      nickname: options?.nickname?.trim() || googleNickname(gUser),
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
  return code === "auth/popup-blocked"
}

function isUserCancelledPopup(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: string }).code
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
}

/**
 * Sign in with Google — popup only; redirect strictly when the browser blocks popups.
 */
export async function signInWithGoogle(options?: {
  nickname?: string
}): Promise<{ method: "popup" | "redirect" }> {
  const provider = createGoogleProvider()

  try {
    const result = await signInWithPopup(auth, provider)
    await ensureGoogleUserProfile(result.user, {
      nickname: options?.nickname || googleNickname(result.user),
    })
    return { method: "popup" }
  } catch (err) {
    if (isUserCancelledPopup(err)) {
      throw err
    }
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
