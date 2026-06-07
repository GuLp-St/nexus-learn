import { getAdminFirestore } from "./firebase-admin"
import { calculateLevel } from "./level-utils"
import { getCourseLimitsForLevel } from "./course-limit-utils"

export type CourseLimitCheckResult =
  | { ok: true }
  | {
      ok: false
      type: "generated" | "added"
      limit: number
      current: number
      level: number
      error: string
    }

async function getAdminCourseCounts(userId: string): Promise<{ generated: number; added: number }> {
  const snap = await getAdminFirestore()
    .collection("userCourseProgress")
    .where("userId", "==", userId)
    .get()
  let generated = 0
  let added = 0
  snap.forEach((docSnap) => {
    if (docSnap.data().isOwnCourse === true) generated++
    else added++
  })
  return { generated, added }
}

export async function checkCanAddGeneratedCourseAdmin(
  userId: string
): Promise<CourseLimitCheckResult> {
  const userDoc = await getAdminFirestore().collection("users").doc(userId).get()
  const xp = (userDoc.data()?.xp as number | undefined) ?? 0
  const level = calculateLevel(xp)
  const { maxGenerated } = getCourseLimitsForLevel(level)
  const { generated } = await getAdminCourseCounts(userId)

  if (generated >= maxGenerated) {
    return {
      ok: false,
      type: "generated",
      limit: maxGenerated,
      current: generated,
      level,
      error: `You've reached your generated course limit (${maxGenerated}). Level up to unlock more slots!`,
    }
  }
  return { ok: true }
}

export async function checkCanAddLibraryCourseAdmin(
  userId: string
): Promise<CourseLimitCheckResult> {
  const userDoc = await getAdminFirestore().collection("users").doc(userId).get()
  const xp = (userDoc.data()?.xp as number | undefined) ?? 0
  const level = calculateLevel(xp)
  const { maxAdded } = getCourseLimitsForLevel(level)
  const { added } = await getAdminCourseCounts(userId)

  if (added >= maxAdded) {
    return {
      ok: false,
      type: "added",
      limit: maxAdded,
      current: added,
      level,
      error: `You've reached your added course limit (${maxAdded}). Level up to unlock more slots!`,
    }
  }
  return { ok: true }
}
