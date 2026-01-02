import { db } from "./firebase"
import { collection, doc, setDoc, getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp } from "firebase/firestore"

export interface XPHistoryEntry {
  id: string
  userId: string
  amount: number // Positive for gains, negative for losses
  source: string
  description?: string
  createdAt: Timestamp
  // Optional metadata
  courseId?: string
  challengeId?: string
  metadata?: Record<string, any>
  // Quiz-specific metadata (for aggregation)
  quizType?: "lesson" | "module" | "course"
  moduleIndex?: number | null
  lessonIndex?: number | null
}

export interface AggregatedXPHistoryEntry {
  id: string
  userId: string
  totalAmount: number
  source: string
  description: string
  createdAt: Timestamp // Most recent entry's timestamp
  count: number // Number of individual entries aggregated
  // Quiz-specific metadata
  courseId?: string
  quizType?: "lesson" | "module" | "course"
  moduleIndex?: number | null
  lessonIndex?: number | null
}

/**
 * Record an XP change in the history
 */
export async function recordXPHistory(
  userId: string,
  amount: number,
  source: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const historyRef = collection(db, "userXPHistory")
    const docId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    
    // Only include fields that are defined (Firebase doesn't allow undefined values)
    const historyData: any = {
      userId,
      amount,
      source,
      createdAt: serverTimestamp(),
    }
    
    if (description !== undefined && description !== null) {
      historyData.description = description
    }
    
    // Include metadata fields only if they're defined
    if (metadata) {
      Object.keys(metadata).forEach((key) => {
        if (metadata[key] !== undefined && metadata[key] !== null) {
          historyData[key] = metadata[key]
        }
      })
      
      // Store quiz-specific fields at top level for easier querying/aggregation
      if (metadata.quizType) {
        historyData.quizType = metadata.quizType
      }
      if (metadata.moduleIndex !== undefined && metadata.moduleIndex !== null) {
        historyData.moduleIndex = metadata.moduleIndex
      }
      if (metadata.lessonIndex !== undefined && metadata.lessonIndex !== null) {
        historyData.lessonIndex = metadata.lessonIndex
      }
      if (metadata.courseId) {
        historyData.courseId = metadata.courseId
      }
      if (metadata.challengeId) {
        historyData.challengeId = metadata.challengeId
      }
    }
    
    await setDoc(doc(historyRef, docId), historyData)
  } catch (error) {
    console.error("Error recording XP history:", error)
    // Don't throw - history recording failures shouldn't block XP operations
  }
}

/**
 * Get XP history for a user
 */
export async function getUserXPHistory(
  userId: string,
  limitCount: number = 100
): Promise<XPHistoryEntry[]> {
  try {
    const historyQuery = query(
      collection(db, "userXPHistory"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )

    const snapshot = await getDocs(historyQuery)
    const entries: XPHistoryEntry[] = []

    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      entries.push({
        id: docSnap.id,
        userId: data.userId,
        amount: data.amount,
        source: data.source,
        description: data.description,
        createdAt: data.createdAt,
        courseId: data.courseId,
        challengeId: data.challengeId,
        metadata: data.metadata,
        quizType: data.quizType,
        moduleIndex: data.moduleIndex,
        lessonIndex: data.lessonIndex,
      } as XPHistoryEntry)
    })

    return entries
  } catch (error: any) {
    // If index is building, fetch without orderBy and sort client-side
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "userXPHistory"),
          where("userId", "==", userId),
          limit(limitCount * 2) // Fetch more to compensate for client-side sorting
        )

        const snapshot = await getDocs(fallbackQuery)
        const entries: XPHistoryEntry[] = []

        snapshot.forEach((docSnap) => {
          const data = docSnap.data()
          entries.push({
            id: docSnap.id,
            userId: data.userId,
            amount: data.amount,
            source: data.source,
            description: data.description,
            createdAt: data.createdAt,
            courseId: data.courseId,
            challengeId: data.challengeId,
            metadata: data.metadata,
            quizType: data.quizType,
            moduleIndex: data.moduleIndex,
            lessonIndex: data.lessonIndex,
          } as XPHistoryEntry)
        })

        // Sort client-side by createdAt descending
        entries.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0
          return bTime - aTime
        })

        return entries.slice(0, limitCount)
      } catch (fallbackError) {
        console.error("Error fetching XP history (fallback):", fallbackError)
        return []
      }
    }

    console.error("Error fetching XP history:", error)
    return []
  }
}

/**
 * Get aggregated XP history for a user (groups quiz questions by quiz type)
 */
export async function getAggregatedXPHistory(
  userId: string,
  limitCount: number = 100
): Promise<AggregatedXPHistoryEntry[]> {
  try {
    const entries = await getUserXPHistory(userId, limitCount * 10) // Fetch more to account for aggregation
    
    // Separate quiz question entries from other entries
    const quizQuestionEntries: XPHistoryEntry[] = []
    const otherEntries: XPHistoryEntry[] = []
    
    entries.forEach((entry) => {
      if (entry.source === "Quiz Question" && entry.quizType && entry.courseId) {
        quizQuestionEntries.push(entry)
      } else {
        otherEntries.push(entry)
      }
    })
    
    // Aggregate quiz question entries by quiz type
    const aggregatedMap = new Map<string, {
      entries: XPHistoryEntry[]
      totalAmount: number
      mostRecent: Timestamp
    }>()
    
    quizQuestionEntries.forEach((entry) => {
      // Create a unique key for grouping: courseId-quizType-moduleIndex-lessonIndex
      const moduleIdx = entry.moduleIndex !== null && entry.moduleIndex !== undefined ? entry.moduleIndex : "null"
      const lessonIdx = entry.lessonIndex !== null && entry.lessonIndex !== undefined ? entry.lessonIndex : "null"
      const key = `${entry.courseId}-${entry.quizType}-${moduleIdx}-${lessonIdx}`
      
      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          entries: [],
          totalAmount: 0,
          mostRecent: entry.createdAt || Timestamp.now(),
        })
      }
      
      const group = aggregatedMap.get(key)!
      group.entries.push(entry)
      group.totalAmount += entry.amount
      
      // Update most recent timestamp
      const entryTime = entry.createdAt?.toMillis() || 0
      const currentTime = group.mostRecent?.toMillis() || 0
      if (entryTime > currentTime) {
        group.mostRecent = entry.createdAt || Timestamp.now()
      }
    })
    
    // Convert aggregated map to entries
    const aggregatedEntries: AggregatedXPHistoryEntry[] = []
    aggregatedMap.forEach((group, key) => {
      const firstEntry = group.entries[0]
      const [courseId, quizType, moduleIdx, lessonIdx] = key.split("-")
      
      // Get course title for description
      let description = `${quizType === "course" ? "Course" : quizType === "module" ? "Module" : "Lesson"} Quiz`
      if (quizType === "module" && moduleIdx !== "null") {
        description += ` (Module ${parseInt(moduleIdx) + 1})`
      } else if (quizType === "lesson" && moduleIdx !== "null" && lessonIdx !== "null") {
        description += ` (Module ${parseInt(moduleIdx) + 1}, Lesson ${parseInt(lessonIdx) + 1})`
      }
      
      aggregatedEntries.push({
        id: `aggregated-${key}`,
        userId: firstEntry.userId,
        totalAmount: group.totalAmount,
        source: "Quiz",
        description: `${group.entries.length} questions answered correctly`,
        createdAt: group.mostRecent,
        count: group.entries.length,
        courseId,
        quizType: quizType as "lesson" | "module" | "course",
        moduleIndex: moduleIdx !== "null" ? parseInt(moduleIdx) : null,
        lessonIndex: lessonIdx !== "null" ? parseInt(lessonIdx) : null,
      })
    })
    
    // Convert other entries to aggregated format
    const otherAggregatedEntries: AggregatedXPHistoryEntry[] = otherEntries.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      totalAmount: entry.amount,
      source: entry.source,
      description: entry.description || "",
      createdAt: entry.createdAt,
      count: 1,
      courseId: entry.courseId,
      quizType: entry.quizType,
      moduleIndex: entry.moduleIndex,
      lessonIndex: entry.lessonIndex,
    }))
    
    // Combine aggregated entries with other entries and sort by date
    const allEntries: AggregatedXPHistoryEntry[] = [
      ...aggregatedEntries,
      ...otherAggregatedEntries,
    ]
    
    // Sort by createdAt descending
    allEntries.sort((a, b) => {
      const aTime = a.createdAt?.toMillis() || 0
      const bTime = b.createdAt?.toMillis() || 0
      return bTime - aTime
    })
    
    return allEntries.slice(0, limitCount)
  } catch (error) {
    console.error("Error fetching aggregated XP history:", error)
    return []
  }
}

