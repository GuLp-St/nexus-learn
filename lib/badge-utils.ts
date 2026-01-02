import { db } from "./firebase"
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore"

export type BadgeId = "first-steps" | "quiz-master" | "marathon-runner" | "early-bird" | "knowledge-seeker" | "perfectionist"

export interface BadgeInfo {
  unlocked: boolean
  unlockedAt?: Timestamp
}

export interface UserBadges {
  badges: {
    "first-steps": BadgeInfo
    "quiz-master": BadgeInfo
    "marathon-runner": BadgeInfo
    "early-bird": BadgeInfo
    "knowledge-seeker": BadgeInfo
    "perfectionist": BadgeInfo
  }
  updatedAt: Timestamp
}

/**
 * Initialize user badges document if it doesn't exist
 */
async function ensureBadgesDocument(userId: string): Promise<void> {
  const badgesRef = doc(db, "userBadges", userId)
  const badgesDoc = await getDoc(badgesRef)

  if (!badgesDoc.exists()) {
    const emptyBadges: UserBadges = {
      badges: {
        "first-steps": { unlocked: false },
        "quiz-master": { unlocked: false },
        "marathon-runner": { unlocked: false },
        "early-bird": { unlocked: false },
        "knowledge-seeker": { unlocked: false },
        "perfectionist": { unlocked: false },
      },
      updatedAt: serverTimestamp() as Timestamp,
    }
    await setDoc(badgesRef, emptyBadges)
  }
}

/**
 * Check if user has completed first lesson
 */
async function checkFirstStepsBadge(userId: string): Promise<boolean> {
  try {
    const progressQuery = query(
      collection(db, "userCourseProgress"),
      where("userId", "==", userId)
    )
    const snapshot = await getDocs(progressQuery)

    for (const docSnap of snapshot.docs) {
      const progress = docSnap.data()
      if (progress.completedLessons && progress.completedLessons.length > 0) {
        return true
      }
    }

    return false
  } catch (error) {
    console.error("Error checking first steps badge:", error)
    return false
  }
}

/**
 * Count perfect quiz bonuses (perfect scores on first try)
 */
async function countPerfectQuizBonuses(userId: string): Promise<number> {
  try {
    const xpHistoryQuery = query(
      collection(db, "userXPHistory"),
      where("userId", "==", userId),
      where("type", "==", "perfect-quiz-bonus")
    )
    const snapshot = await getDocs(xpHistoryQuery)
    return snapshot.size
  } catch (error) {
    console.error("Error counting perfect quiz bonuses:", error)
    return 0
  }
}

/**
 * Count course completions
 */
async function countCourseCompletions(userId: string): Promise<number> {
  try {
    const xpHistoryQuery = query(
      collection(db, "userXPHistory"),
      where("userId", "==", userId),
      where("type", "==", "course-completion")
    )
    const snapshot = await getDocs(xpHistoryQuery)
    return snapshot.size
  } catch (error) {
    console.error("Error counting course completions:", error)
    return 0
  }
}

/**
 * Get user's daily login streak
 */
async function getDailyLoginStreak(userId: string): Promise<number> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    if (userDoc.exists()) {
      return userDoc.data().dailyLoginStreak || 0
    }
    return 0
  } catch (error) {
    console.error("Error getting daily login streak:", error)
    return 0
  }
}

/**
 * Get user's total XP
 */
async function getUserXP(userId: string): Promise<number> {
  try {
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    if (userDoc.exists()) {
      return userDoc.data().xp || 0
    }
    return 0
  } catch (error) {
    console.error("Error getting user XP:", error)
    return 0
  }
}

/**
 * Check all badges and unlock any that are newly earned
 */
export async function checkAndUpdateBadges(userId: string): Promise<string[]> {
  try {
    await ensureBadgesDocument(userId)

    const badgesRef = doc(db, "userBadges", userId)
    const badgesDoc = await getDoc(badgesRef)

    if (!badgesDoc.exists()) {
      return []
    }

    const currentBadges = badgesDoc.data() as UserBadges
    const newlyUnlocked: string[] = []

    // Check each badge
    const checks = await Promise.all([
      checkFirstStepsBadge(userId),
      countPerfectQuizBonuses(userId),
      countCourseCompletions(userId),
      getDailyLoginStreak(userId),
      getUserXP(userId),
      countPerfectQuizBonuses(userId), // Same as quiz-master, but we need count twice
    ])

    const [
      hasCompletedLesson,
      perfectQuizCount,
      courseCompletionCount,
      loginStreak,
      totalXP,
      perfectionistCount,
    ] = checks

    // Check First Steps badge
    if (!currentBadges.badges["first-steps"].unlocked && hasCompletedLesson) {
      currentBadges.badges["first-steps"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("first-steps")
    }

    // Check Quiz Master badge (10 perfect scores)
    if (!currentBadges.badges["quiz-master"].unlocked && perfectQuizCount >= 10) {
      currentBadges.badges["quiz-master"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("quiz-master")
    }

    // Check Marathon Runner badge (5 courses completed)
    if (!currentBadges.badges["marathon-runner"].unlocked && courseCompletionCount >= 5) {
      currentBadges.badges["marathon-runner"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("marathon-runner")
    }

    // Check Early Bird badge (7 day streak)
    if (!currentBadges.badges["early-bird"].unlocked && loginStreak >= 7) {
      currentBadges.badges["early-bird"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("early-bird")
    }

    // Check Knowledge Seeker badge (1000 XP)
    if (!currentBadges.badges["knowledge-seeker"].unlocked && totalXP >= 1000) {
      currentBadges.badges["knowledge-seeker"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("knowledge-seeker")
    }

    // Check Perfectionist badge (20 perfect scores)
    if (!currentBadges.badges["perfectionist"].unlocked && perfectionistCount >= 20) {
      currentBadges.badges["perfectionist"] = {
        unlocked: true,
        unlockedAt: serverTimestamp() as Timestamp,
      }
      newlyUnlocked.push("perfectionist")
    }

    // Award Nexon for newly unlocked badges (100 per badge)
    if (newlyUnlocked.length > 0) {
      const { awardNexon } = await import("./nexon-utils")
      for (const badgeId of newlyUnlocked) {
        await awardNexon(userId, 100, "Badge Unlock", `Unlocked badge: ${badgeId}`, { badgeId }).catch((error) => {
          console.error(`Error awarding Nexon for badge ${badgeId}:`, error)
          // Don't throw - Nexon failure shouldn't block badge unlock
        })
      }
    }

    // Update badges document if any were newly unlocked
    if (newlyUnlocked.length > 0) {
      await setDoc(
        badgesRef,
        {
          ...currentBadges,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      // Record community activity for each newly unlocked badge
      const { recordActivity } = await import("./community-pulse-utils")
      const badgeNames: Record<string, string> = {
        "first-steps": "First Steps",
        "quiz-master": "Quiz Master",
        "marathon-runner": "Marathon Runner",
        "early-bird": "Early Bird",
        "knowledge-seeker": "Knowledge Seeker",
        "perfectionist": "Perfectionist",
      }

      for (const badgeId of newlyUnlocked) {
        recordActivity(userId, "badge_earned", {
          badgeId,
          badgeName: badgeNames[badgeId] || badgeId,
        }).catch((error) => {
          console.error("Error recording badge earned activity:", error)
        })
      }
    }

    return newlyUnlocked
  } catch (error) {
    console.error("Error checking and updating badges:", error)
    return []
  }
}

/**
 * Get user's badge status
 */
export async function getUserBadges(userId: string): Promise<UserBadges | null> {
  try {
    await ensureBadgesDocument(userId)

    const badgesRef = doc(db, "userBadges", userId)
    const badgesDoc = await getDoc(badgesRef)

    if (badgesDoc.exists()) {
      return badgesDoc.data() as UserBadges
    }

    return null
  } catch (error) {
    console.error("Error getting user badges:", error)
    return null
  }
}

/**
 * Get badge display information
 */
export interface BadgeDisplayInfo {
  id: BadgeId
  name: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: Timestamp
}

export function getBadgeDisplayInfo(badgeId: BadgeId, unlocked: boolean, unlockedAt?: Timestamp): BadgeDisplayInfo {
  const badges: Record<BadgeId, { name: string; description: string; icon: string }> = {
    "first-steps": {
      name: "First Steps",
      description: "Complete your first lesson",
      icon: "🎯",
    },
    "quiz-master": {
      name: "Quiz Master",
      description: "Get 10 perfect quiz scores on first try",
      icon: "🏆",
    },
    "marathon-runner": {
      name: "Marathon Runner",
      description: "Complete 5 courses",
      icon: "🏃",
    },
    "early-bird": {
      name: "Early Bird",
      description: "Login 7 days in a row",
      icon: "🌅",
    },
    "knowledge-seeker": {
      name: "Knowledge Seeker",
      description: "Earn 1000 total XP",
      icon: "📚",
    },
    "perfectionist": {
      name: "Perfectionist",
      description: "Get 20 perfect quiz scores on first try",
      icon: "⭐",
    },
  }

  const badge = badges[badgeId]
  return {
    id: badgeId,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    unlocked,
    unlockedAt,
  }
}

