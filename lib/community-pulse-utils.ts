import { db } from "./firebase"
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore"
import { formatRelativeTime } from "./date-utils"

export type ActivityType =
  | "course_published"
  | "course_completed"
  | "badge_earned"
  | "leveled_up"
  | "challenge_won"
  | "perfect_quiz"

export interface CommunityActivity {
  id: string
  userId: string
  userNickname: string
  userAvatarUrl?: string
  activityType: ActivityType
  metadata: {
    courseId?: string
    courseTitle?: string
    badgeId?: string
    badgeName?: string
    newLevel?: number
  }
  createdAt: Timestamp
  relativeTime?: string // Computed client-side
}

/**
 * Record a community activity
 */
export async function recordActivity(
  userId: string,
  activityType: ActivityType,
  metadata: CommunityActivity["metadata"]
): Promise<void> {
  try {
    // Get user info
    const userRef = doc(db, "users", userId)
    const userDoc = await getDoc(userRef)
    if (!userDoc.exists()) {
      return // User not found
    }

    const userData = userDoc.data()
    const userNickname = userData.nickname || "Anonymous"
    const userAvatarUrl = userData.avatarUrl

    // Create activity document
    const activityRef = doc(collection(db, "communityActivities"))
    await setDoc(activityRef, {
      userId,
      userNickname,
      userAvatarUrl: userAvatarUrl || null,
      activityType,
      metadata,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error recording community activity:", error)
  }
}

/**
 * Get recent community activities
 */
export async function getCommunityActivities(limitCount: number = 5): Promise<CommunityActivity[]> {
  try {
    const activitiesQuery = query(
      collection(db, "communityActivities"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )

    const snapshot = await getDocs(activitiesQuery)
    const activities: CommunityActivity[] = []

    snapshot.forEach((doc) => {
      const data = doc.data()
      activities.push({
        id: doc.id,
        userId: data.userId,
        userNickname: data.userNickname,
        userAvatarUrl: data.userAvatarUrl,
        activityType: data.activityType,
        metadata: data.metadata,
        createdAt: data.createdAt,
        relativeTime: formatRelativeTime(data.createdAt),
      })
    })

    return activities
  } catch (error) {
    console.error("Error getting community activities:", error)
    return []
  }
}

/**
 * Subscribe to community activities in real-time
 */
export function subscribeToCommunityActivities(
  limitCount: number,
  callback: (activities: CommunityActivity[]) => void
): Unsubscribe {
  const activitiesQuery = query(
    collection(db, "communityActivities"),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  )

  return onSnapshot(
    activitiesQuery,
    (snapshot) => {
      const activities: CommunityActivity[] = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        activities.push({
          id: doc.id,
          userId: data.userId,
          userNickname: data.userNickname,
          userAvatarUrl: data.userAvatarUrl,
          activityType: data.activityType,
          metadata: data.metadata,
          createdAt: data.createdAt,
          relativeTime: formatRelativeTime(data.createdAt),
        })
      })
      callback(activities)
    },
    (error) => {
      console.error("Error in community activities subscription:", error)
      callback([])
    }
  )
}

/**
 * Format activity description for display
 */
export function formatActivityDescription(activity: CommunityActivity): string {
  const { userNickname, activityType, metadata } = activity

  switch (activityType) {
    case "course_published":
      return `${userNickname} published "${metadata.courseTitle || "a course"}"`
    case "course_completed":
      return `${userNickname} completed "${metadata.courseTitle || "a course"}"`
    case "badge_earned":
      return `${userNickname} earned the "${metadata.badgeName || "badge"}" badge`
    case "leveled_up":
      return `${userNickname} reached level ${metadata.newLevel || "?"}`
    case "challenge_won":
      return `${userNickname} won a 1v1 challenge on "${metadata.courseTitle || "a course"}"`
    case "perfect_quiz":
      return `${userNickname} got a perfect score on "${metadata.courseTitle || "a quiz"}"`
    default:
      return `${userNickname} did something amazing!`
  }
}

