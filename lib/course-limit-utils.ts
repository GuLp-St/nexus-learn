import { db } from "./firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import { calculateLevel } from "./level-utils"
import { getUserXP } from "./leaderboard-utils"

export interface CourseLimitInfo {
  maxGenerated: number
  maxAdded: number
  generated: number
  added: number
  total: number
  level: number
}

/** Level 1 → 2 generated / 5 added; scales with level. */
export function getCourseLimitsForLevel(level: number): { maxGenerated: number; maxAdded: number } {
  const safeLevel = Math.max(1, level)
  return {
    maxGenerated: Math.min(1 + safeLevel, 20),
    maxAdded: Math.min(3 + safeLevel * 2, 50),
  }
}

export async function getUserCourseCounts(userId: string): Promise<{ generated: number; added: number; total: number }> {
  const progressQuery = query(
    collection(db, "userCourseProgress"),
    where("userId", "==", userId)
  )
  const snapshot = await getDocs(progressQuery)
  let generated = 0
  let added = 0
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    if (data.isOwnCourse === true) generated++
    else added++
  })
  return { generated, added, total: generated + added }
}

export async function getUserCourseLimits(userId: string): Promise<CourseLimitInfo> {
  const xpData = await getUserXP(userId)
  const xp = xpData?.xp ?? 0
  const level = calculateLevel(xp)
  const limits = getCourseLimitsForLevel(level)
  const counts = await getUserCourseCounts(userId)
  return { ...limits, ...counts, level }
}

export class CourseLimitError extends Error {
  constructor(
    message: string,
    public readonly type: "generated" | "added",
    public readonly limit: number,
    public readonly current: number
  ) {
    super(message)
    this.name = "CourseLimitError"
  }
}

export async function assertCanAddGeneratedCourse(userId: string): Promise<void> {
  const info = await getUserCourseLimits(userId)
  if (info.generated >= info.maxGenerated) {
    throw new CourseLimitError(
      `You've reached your generated course limit (${info.maxGenerated}). Level up to unlock more slots!`,
      "generated",
      info.maxGenerated,
      info.generated
    )
  }
}

export async function assertCanAddLibraryCourse(userId: string): Promise<void> {
  const info = await getUserCourseLimits(userId)
  if (info.added >= info.maxAdded) {
    throw new CourseLimitError(
      `You've reached your added course limit (${info.maxAdded}). Level up to unlock more slots!`,
      "added",
      info.maxAdded,
      info.added
    )
  }
}
