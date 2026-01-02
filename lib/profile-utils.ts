import { auth, db } from "./firebase"
import { doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth"

/**
 * Update user nickname/username
 */
export async function updateUserNickname(userId: string, nickname: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      nickname: nickname.trim(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating nickname:", error)
    throw new Error("Failed to update nickname")
  }
}

/**
 * Update user email
 * Requires re-authentication with current password
 */
export async function updateUserEmail(
  currentEmail: string,
  newEmail: string,
  currentPassword: string
): Promise<void> {
  try {
    const user = auth.currentUser
    if (!user) {
      throw new Error("User not authenticated")
    }

    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentEmail, currentPassword)
    await reauthenticateWithCredential(user, credential)

    // Update email
    await updateEmail(user, newEmail)

    // Update email in Firestore
    const userRef = doc(db, "users", user.uid)
    await updateDoc(userRef, {
      email: newEmail,
      updatedAt: serverTimestamp(),
    })
  } catch (error: any) {
    console.error("Error updating email:", error)
    if (error.code === "auth/wrong-password") {
      throw new Error("Current password is incorrect")
    } else if (error.code === "auth/email-already-in-use") {
      throw new Error("Email is already in use")
    } else if (error.code === "auth/invalid-email") {
      throw new Error("Invalid email address")
    }
    throw new Error(error.message || "Failed to update email")
  }
}

/**
 * Update user password
 * Requires current password for re-authentication
 */
export async function updateUserPassword(
  currentEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  try {
    const user = auth.currentUser
    if (!user) {
      throw new Error("User not authenticated")
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters")
    }

    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentEmail, currentPassword)
    await reauthenticateWithCredential(user, credential)

    // Update password
    await updatePassword(user, newPassword)
  } catch (error: any) {
    console.error("Error updating password:", error)
    if (error.code === "auth/wrong-password") {
      throw new Error("Current password is incorrect")
    } else if (error.code === "auth/weak-password") {
      throw new Error("Password is too weak")
    }
    throw new Error(error.message || "Failed to update password")
  }
}

/**
 * Update user avatar URL (from DiceBear API)
 * @param userId User ID
 * @param avatarUrl DiceBear avatar URL
 * @param avatarStyle Avatar style used
 * @param avatarSeed Seed used for the avatar
 */
export async function updateUserAvatar(
  userId: string,
  avatarUrl: string,
  avatarStyle: string,
  avatarSeed: string
): Promise<void> {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      avatarUrl,
      avatarStyle,
      avatarSeed,
      updatedAt: serverTimestamp(),
    })
  } catch (error: any) {
    console.error("Error updating avatar:", error)
    throw new Error("Failed to update avatar")
  }
}


