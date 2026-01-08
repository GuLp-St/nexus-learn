import { db } from "./firebase"
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore"
import { getUTCDateString, getUTCDateStringFromTimestamp } from "./date-utils"

export type ActivityPageType = "course" | "lesson" | "quiz"

export interface ActivitySession {
  startTime: Timestamp
  endTime: Timestamp
  duration: number // seconds
  pageType: ActivityPageType
  courseId?: string
  moduleIndex?: number
  lessonIndex?: number
}

export interface DailyActivity {
  userId: string
  date: string // YYYY-MM-DD format
  sessions: ActivitySession[]
  totalSeconds: number
  updatedAt: Timestamp
}

let trackingInterval: NodeJS.Timeout | null = null
let currentSession: {
  userId: string
  startTime: number
  pageType: ActivityPageType
  courseId?: string
  moduleIndex?: number
  lessonIndex?: number
} | null = null
let lastSaveTime: number = Date.now()
const SAVE_INTERVAL = 60000 // Save every 60 seconds

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayDateString(): string {
  return getUTCDateString()
}

/**
 * Get document ID for daily activity
 */
function getActivityDocId(userId: string, date: string): string {
  return `${userId}-${date}`
}

/**
 * Start tracking activity for a page
 */
export function startActivityTracking(
  userId: string,
  pageType: ActivityPageType,
  courseId?: string,
  moduleIndex?: number,
  lessonIndex?: number
): void {
  // Stop any existing tracking
  stopActivityTracking()

  const now = Date.now()
  currentSession = {
    userId,
    startTime: now,
    pageType,
    courseId,
    moduleIndex,
    lessonIndex,
  }
  lastSaveTime = now

  // Set up interval to save activity periodically
  trackingInterval = setInterval(async () => {
    if (currentSession) {
      await saveActivitySession()
    }
  }, SAVE_INTERVAL)

  // Save initial session start
  saveActivitySession().catch((error) => {
    console.error("Error saving initial activity session:", error)
  })
}

/**
 * Stop tracking activity and save session
 */
export async function stopActivityTracking(): Promise<void> {
  if (trackingInterval) {
    clearInterval(trackingInterval)
    trackingInterval = null
  }

  if (currentSession) {
    await saveActivitySession()
    currentSession = null
  }
}

/**
 * Save current activity session to Firestore
 */
async function saveActivitySession(): Promise<void> {
  if (!currentSession || currentSession.startTime === null || currentSession.startTime === undefined) {
    return
  }

  try {
    const now = Date.now()
    const duration = Math.floor((now - currentSession.startTime) / 1000) // Convert to seconds

    // Only save if session is at least 5 seconds (filter out quick navigations)
    if (duration < 5) {
      return
    }

    const date = getTodayDateString()
    const docId = getActivityDocId(currentSession.userId, date)
    const activityRef = doc(db, "userActivity", docId)

    // Get existing activity document
    const activityDoc = await getDoc(activityRef)

    // Use Timestamp.now() instead of serverTimestamp() for arrays
    // Firebase doesn't support serverTimestamp() inside arrays - it must be used at the document level only
    // Only include optional fields if they're defined (Firebase doesn't allow undefined values)
    const session: any = {
      startTime: Timestamp.fromDate(new Date(currentSession.startTime)),
      endTime: Timestamp.now(),
      duration,
      pageType: currentSession.pageType,
    }
    
    if (currentSession.courseId !== undefined && currentSession.courseId !== null) {
      session.courseId = currentSession.courseId
    }
    
    if (currentSession.moduleIndex !== undefined && currentSession.moduleIndex !== null) {
      session.moduleIndex = currentSession.moduleIndex
    }
    
    if (currentSession.lessonIndex !== undefined && currentSession.lessonIndex !== null) {
      session.lessonIndex = currentSession.lessonIndex
    }

    if (activityDoc.exists()) {
      // Update existing document
      const existingData = activityDoc.data() as DailyActivity
      const updatedSessions = [...existingData.sessions, session]
      const updatedTotalSeconds = updatedSessions.reduce((sum, s) => sum + s.duration, 0)

      await setDoc(
        activityRef,
        {
          sessions: updatedSessions,
          totalSeconds: updatedTotalSeconds,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } else {
      // Create new document
      await setDoc(activityRef, {
        userId: currentSession.userId,
        date,
        sessions: [session],
        totalSeconds: duration,
        updatedAt: serverTimestamp(),
      })
    }

    // Update last save time and reset session start time
    lastSaveTime = now
    if (currentSession) {
      currentSession.startTime = now
    }
  } catch (error) {
    console.error("Error saving activity session:", error)
  }
}

/**
 * Get user's activity for a specific date
 */
export async function getUserActivity(userId: string, date: string): Promise<DailyActivity | null> {
  try {
    const docId = getActivityDocId(userId, date)
    const activityRef = doc(db, "userActivity", docId)
    const activityDoc = await getDoc(activityRef)

    if (activityDoc.exists()) {
      return activityDoc.data() as DailyActivity
    }

    return null
  } catch (error) {
    console.error("Error getting user activity:", error)
    return null
  }
}

/**
 * Get user's activity for the past 7 days (this week)
 */
export async function getUserActivityThisWeek(userId: string): Promise<Map<string, number>> {
  try {
    const todayUTC = getUTCDateString()
    const activityMap = new Map<string, number>()

    // Get activity for each day of the week (in UTC)
    for (let i = 6; i >= 0; i--) {
      const date = new Date(todayUTC + "T00:00:00.000Z")
      date.setUTCDate(date.getUTCDate() - i)
      const dateString = date.toISOString().split("T")[0]

      const activity = await getUserActivity(userId, dateString)
      const totalHours = activity ? activity.totalSeconds / 3600 : 0

      activityMap.set(dateString, totalHours)
    }

    return activityMap
  } catch (error) {
    console.error("Error getting user activity this week:", error)
    return new Map()
  }
}

/**
 * Format seconds to hours with decimal
 */
export function formatSecondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100 // Round to 2 decimal places
}

