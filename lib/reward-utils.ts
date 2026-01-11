import { db } from "./firebase"
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, setDoc } from "firebase/firestore"
import { awardXP, XPAwardResult } from "./xp-utils"
import { awardNexon } from "./nexon-utils"

export type RewardTier = ">50%" | ">70%" | ">90%" | "100%" | "first_completion"

export interface RewardConfig {
  lesson: {
    first_completion: { xp: number }
  }
  module: {
    first_completion: { xp: number }
  }
  moduleQuiz: {
    ">50%": { xp: number }
    ">70%": { xp: number }
    ">90%": { xp: number }
    "100%": { xp: number; nexon: number }
  }
  finalQuiz: {
    ">50%": { xp: number }
    ">70%": { xp: number }
    ">90%": { xp: number }
    "100%": { xp: number; nexon: number }
  }
}

// Base reward amounts (will be multiplied by course difficulty)
const BASE_REWARDS: RewardConfig = {
  lesson: {
    first_completion: { xp: 25 }
  },
  module: {
    first_completion: { xp: 50 }
  },
  moduleQuiz: {
    ">50%": { xp: 10 },
    ">70%": { xp: 20 },
    ">90%": { xp: 30 },
    "100%": { xp: 50, nexon: 25 }
  },
  finalQuiz: {
    ">50%": { xp: 20 },
    ">70%": { xp: 40 },
    ">90%": { xp: 60 },
    "100%": { xp: 100, nexon: 50 }
  }
}

/**
 * Get available reward tiers for a score percentage
 */
export function getAvailableTiers(scorePercentage: number): RewardTier[] {
  const tiers: RewardTier[] = []
  if (scorePercentage >= 50) tiers.push(">50%")
  if (scorePercentage >= 70) tiers.push(">70%")
  if (scorePercentage >= 90) tiers.push(">90%")
  if (scorePercentage >= 100) tiers.push("100%")
  return tiers
}

/**
 * Check if a reward tier has been claimed
 */
export async function hasClaimedReward(
  userId: string,
  courseId: string,
  rewardType: "lesson" | "module" | "moduleQuiz" | "finalQuiz",
  rewardKey: string,
  tier: RewardTier
): Promise<boolean> {
  try {
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    const progressDoc = await getDoc(progressRef)
    
    if (!progressDoc.exists()) {
      // Safety net: Check permanent record if progress doc is missing or hasn't been restored yet
      const permanentRef = doc(db, "userPermanentRewards", `${userId}-${courseId}`)
      const permanentDoc = await getDoc(permanentRef)
      if (permanentDoc.exists()) {
        const data = permanentDoc.data()
        const claimedRewards = data.claimedRewards || {}
        const typeKey = `${rewardType}_${rewardKey}`
        // Check both nested and flattened keys
        const claimedTiers = claimedRewards[typeKey] || data[`claimedRewards.${typeKey}`] || []
        return claimedTiers.includes(tier)
      }
      return false
    }

    const data = progressDoc.data()
    const claimedRewards = data.claimedRewards || {}
    const typeKey = `${rewardType}_${rewardKey}`
    // Check both nested and flattened keys here too for extra safety
    const claimedTiers = claimedRewards[typeKey] || data[`claimedRewards.${typeKey}`] || []
    return claimedTiers.includes(tier)
  } catch (error) {
    console.error("Error checking claimed reward:", error)
    return false
  }
}

/**
 * Claim a reward tier
 */
export async function claimReward(
  userId: string,
  courseId: string,
  rewardType: "lesson" | "module" | "moduleQuiz" | "finalQuiz",
  rewardKey: string,
  tier: RewardTier,
  xpMultiplier: number = 1.0
): Promise<{ xpAwarded?: XPAwardResult; nexonAwarded?: number }> {
  try {
    // Check if already claimed
    const alreadyClaimed = await hasClaimedReward(userId, courseId, rewardType, rewardKey, tier)
    if (alreadyClaimed) {
      return {}
    }

    // Get reward amount
    let xpAmount = 0
    let nexonAmount = 0

    if (rewardType === "lesson" && tier === "first_completion") {
      xpAmount = Math.round(BASE_REWARDS.lesson.first_completion.xp * xpMultiplier)
    } else if (rewardType === "module" && tier === "first_completion") {
      xpAmount = Math.round(BASE_REWARDS.module.first_completion.xp * xpMultiplier)
    } else if (rewardType === "moduleQuiz") {
      const config = BASE_REWARDS.moduleQuiz[tier as keyof typeof BASE_REWARDS.moduleQuiz]
      if (config) {
        xpAmount = Math.round(config.xp * xpMultiplier)
        if (tier === "100%" && "nexon" in config) {
          nexonAmount = Math.round(config.nexon * xpMultiplier)
        }
      }
    } else if (rewardType === "finalQuiz") {
      const config = BASE_REWARDS.finalQuiz[tier as keyof typeof BASE_REWARDS.finalQuiz]
      if (config) {
        xpAmount = Math.round(config.xp * xpMultiplier)
        if (tier === "100%" && "nexon" in config) {
          nexonAmount = Math.round(config.nexon * xpMultiplier)
        }
      }
    }

    // Award rewards
    let xpResult: XPAwardResult | undefined
    if (xpAmount > 0) {
      xpResult = await awardXP(
        userId,
        xpAmount,
        `${rewardType} ${tier} Reward`,
        `Claimed ${tier} reward for ${rewardType}`,
        { courseId, rewardType, rewardKey, tier, xpMultiplier }
      )
    }

    let nexonResult: number | undefined
    if (nexonAmount > 0) {
      nexonResult = await awardNexon(
        userId,
        nexonAmount,
        `${rewardType} ${tier} Reward`,
        `Claimed ${tier} reward for ${rewardType}`,
        { courseId, rewardType, rewardKey, tier, xpMultiplier }
      )
    }

    // Mark as claimed in both current progress and permanent record
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    const permanentRef = doc(db, "userPermanentRewards", `${userId}-${courseId}`)
    const typeKey = `${rewardType}_${rewardKey}`
    
    const updates = {
      [`claimedRewards.${typeKey}`]: arrayUnion(tier),
    }

    // Update current progress
    await updateDoc(progressRef, updates)

    // Update permanent record (ensure it exists first)
    try {
      const permanentDoc = await getDoc(permanentRef)
      if (!permanentDoc.exists()) {
        await setDoc(permanentRef, {
          claimedRewards: { [typeKey]: [tier] },
          updatedAt: serverTimestamp()
        })
      } else {
        await updateDoc(permanentRef, {
          ...updates,
          updatedAt: serverTimestamp()
        })
      }
    } catch (permError) {
      console.error("Error updating permanent rewards:", permError)
      // Don't fail the whole claim if permanent storage fails, but log it
    }

    return {
      xpAwarded: xpResult,
      nexonAwarded: nexonResult,
    }
  } catch (error) {
    console.error("Error claiming reward:", error)
    throw error
  }
}

/**
 * Get all claimable rewards for a user in a course
 */
export async function getClaimableRewards(
  userId: string,
  courseId: string
): Promise<{
  lessons: Array<{ lessonKey: string; tier: RewardTier }>
  modules: Array<{ moduleKey: string; tier: RewardTier }>
  moduleQuizzes: Array<{ moduleKey: string; tiers: RewardTier[] }>
  finalQuiz: { tiers: RewardTier[] } | null
}> {
  try {
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    const progressDoc = await getDoc(progressRef)
    
    if (!progressDoc.exists()) {
      return { lessons: [], modules: [], moduleQuizzes: [], finalQuiz: null }
    }

    const progress = progressDoc.data()
    const claimedRewards = progress.claimedRewards || {}
    const completedLessons = progress.completedLessons || []
    const moduleQuizScores = progress.moduleQuizScores || {}
    const finalQuizScore = progress.finalQuizScore

    // Lessons
    const lessons: Array<{ lessonKey: string; tier: RewardTier }> = []
    completedLessons.forEach((lessonKey: string) => {
      const typeKey = `lesson_${lessonKey}`
      const claimed = claimedRewards[typeKey] || []
      if (!claimed.includes("first_completion")) {
        lessons.push({ lessonKey, tier: "first_completion" })
      }
    })

    // Modules (check if all lessons in module are completed)
    // This would require course data, so we'll handle it in the UI

    // Module quizzes
    const moduleQuizzes: Array<{ moduleKey: string; tiers: RewardTier[] }> = []
    Object.entries(moduleQuizScores).forEach(([moduleIdx, score]) => {
      const moduleKey = `module_${moduleIdx}`
      const claimed = claimedRewards[`moduleQuiz_${moduleIdx}`] || []
      const availableTiers = getAvailableTiers(score as number)
      const unclaimedTiers = availableTiers.filter(tier => !claimed.includes(tier))
      if (unclaimedTiers.length > 0) {
        moduleQuizzes.push({ moduleKey: moduleIdx, tiers: unclaimedTiers })
      }
    })

    // Final quiz
    let finalQuiz: { tiers: RewardTier[] } | null = null
    if (finalQuizScore !== undefined) {
      const claimed = claimedRewards["finalQuiz_final"] || []
      const availableTiers = getAvailableTiers(finalQuizScore)
      const unclaimedTiers = availableTiers.filter(tier => !claimed.includes(tier))
      if (unclaimedTiers.length > 0) {
        finalQuiz = { tiers: unclaimedTiers }
      }
    }

    return { lessons, modules: [], moduleQuizzes, finalQuiz }
  } catch (error) {
    console.error("Error getting claimable rewards:", error)
    return { lessons: [], modules: [], moduleQuizzes: [], finalQuiz: null }
  }
}

