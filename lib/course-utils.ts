import { db } from "./firebase"
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp, Timestamp, limit, orderBy } from "firebase/firestore"
import { CourseData } from "./gemini"
import { XPAwardResult } from "./xp-utils"

export interface PublicCourse extends CourseData {
  id: string
  isPublic?: boolean
  createdAt?: Timestamp
  createdBy?: string
  averageRating?: number
  ratingCount?: number
  publishedAt?: Timestamp
  tags?: string[]
  imageUrl?: string
  addedCount?: number
  addedBy?: string[]
  publishXP?: number
  // Lessons stored here: modules[moduleIndex].lessons[lessonIndex].slides
}

export interface UserCourseProgress {
  userId: string
  courseId: string
  progress: number
  completedLessons: string[]
  lastAccessed?: Timestamp
  lastAccessedModule?: number
  lastAccessedLesson?: number
  lastAccessedBlockIndex?: number
  createdAt?: Timestamp
  addedFrom?: string
  isOwnCourse?: boolean
  claimedRewards?: {
    [key: string]: string[] // e.g., "lesson_0-0": ["first_completion"], "module_0": ["first_completion"], "moduleQuiz_0": [">50%", ">70%", ">90%", "100%"]
  }
  moduleQuizScores?: {
    [moduleIndex: string]: number // Highest score per module
  }
  finalQuizScore?: number // Highest final quiz score
}

export interface CourseWithProgress extends PublicCourse {
  userProgress?: UserCourseProgress
}

/**
 * Check if a public course with similar title already exists (for duplicate checking when creating)
 * Note: We don't prevent duplicates - users can create their own version of courses
 * This is just for reference, but we always create new courses (private by default)
 */
export async function findExistingPublicCourse(title: string): Promise<string | null> {
  try {
    const coursesQuery = query(
      collection(db, "courses"),
      where("isPublic", "==", true),
      limit(50)
    )
    const snapshot = await getDocs(coursesQuery)
    
    const titleLower = title.toLowerCase().trim()
    
    for (const docSnap of snapshot.docs) {
      const courseTitle = docSnap.data().title?.toLowerCase().trim() || ""
      // Exact match or very similar
      if (courseTitle === titleLower || 
          (courseTitle.length > 5 && titleLower.length > 5 && 
           (courseTitle.includes(titleLower) || titleLower.includes(courseTitle)))) {
        return docSnap.id
      }
    }
    
    return null
  } catch (error: any) {
    // If index is building, fetch all and filter client-side
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(collection(db, "courses"), limit(100))
        const snapshot = await getDocs(fallbackQuery)
        const titleLower = title.toLowerCase().trim()
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data()
          if (!data.isPublic) continue
          
          const courseTitle = data.title?.toLowerCase().trim() || ""
          if (courseTitle === titleLower || 
              (courseTitle.length > 5 && titleLower.length > 5 && 
               (courseTitle.includes(titleLower) || titleLower.includes(courseTitle)))) {
            return docSnap.id
          }
        }
      } catch (fallbackError) {
        console.error("Error finding existing course (fallback):", fallbackError)
      }
    } else {
      console.error("Error finding existing course:", error)
    }
    return null
  }
}

/**
 * Create a new course (always private by default)
 */
export async function createOrGetCourse(
  courseData: CourseData,
  userId: string
): Promise<string> {
  // Always create a new course (private by default)
  // Course becomes public only after completion + rating >= 4
  
  const courseRef = doc(collection(db, "courses"))
  await setDoc(courseRef, {
    ...courseData,
    isPublic: false, // Private by default
    createdAt: serverTimestamp(),
    createdBy: userId,
    averageRating: 0,
    ratingCount: 0,
    addedCount: 0,
    addedBy: [],
  })
  
  // Create user progress entry
  await ensureUserProgress(userId, courseRef.id, true)
  
  // Emit quest event for course creation
  const { emitQuestEvent } = await import("./event-bus")
  emitQuestEvent({
    type: "quest.course_added",
    userId,
    metadata: {
      courseId: courseRef.id,
    },
  }).catch((error) => {
    console.error("Error emitting course added event:", error)
  })
  
  return courseRef.id
}

/**
 * Ensure user has a progress entry for a course
 */
export async function ensureUserProgress(userId: string, courseId: string, isOwnCourse: boolean = false, addedFrom?: string): Promise<void> {
  const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
  const progressDoc = await getDoc(progressRef)
  
  // Get course to check if user is creator
  const courseDoc = await getDoc(doc(db, "courses", courseId))
  const courseData = courseDoc.data()
  const courseCreatedBy = courseData?.createdBy
  
  if (!progressDoc.exists()) {
    // We always try to restore progress if it exists in the detailed records
    // (userCompletedItems and userLessonProgress), even for community courses.
    
    let completedLessons: string[] = []
    let totalLessons = 0
    let lastAccessedModule: number | undefined
    let lastAccessedLesson: number | undefined
    let moduleQuizScores: { [key: string]: number } = {}
    let finalQuizScore: number | undefined
    let claimedRewards: { [key: string]: string[] } = {}
    
    try {
      // Query permanent rewards to restore
      const permanentRef = doc(db, "userPermanentRewards", `${userId}-${courseId}`)
      const permanentDoc = await getDoc(permanentRef)
      if (permanentDoc.exists()) {
        const data = permanentDoc.data()
        claimedRewards = data.claimedRewards || {}
        
        // Robustness: also check for flattened keys if they were accidentally created
        Object.keys(data).forEach(key => {
          if (key.startsWith("claimedRewards.")) {
            const typeKey = key.replace("claimedRewards.", "")
            if (!claimedRewards[typeKey]) {
              claimedRewards[typeKey] = data[key]
            }
          }
        })
      }

      // Query quizAttempts to restore scores
      const { getQuizAttempts } = await import("./quiz-utils")
      const allAttempts = await getQuizAttempts(userId, courseId)
      
      allAttempts.forEach(attempt => {
        if (attempt.completedAt && !(attempt as any).abandoned && attempt.maxScore > 0) {
          const score = Math.round((attempt.totalScore / attempt.maxScore) * 100)
          if (attempt.quizType === "module" && attempt.moduleIndex !== null && attempt.moduleIndex !== undefined) {
            const mIndex = attempt.moduleIndex.toString()
            if (!moduleQuizScores[mIndex] || score > moduleQuizScores[mIndex]) {
              moduleQuizScores[mIndex] = score
            }
          } else if (attempt.quizType === "course") {
            if (finalQuizScore === undefined || score > finalQuizScore) {
              finalQuizScore = score
            }
          }
        }
      })

      // Query userCompletedItems for all lessons in this course
      const completedQuery = query(
        collection(db, "userCompletedItems"),
        where("userId", "==", userId),
        where("courseId", "==", courseId),
        where("itemType", "==", "lesson")
      )
      const completedSnapshot = await getDocs(completedQuery)
      
      const completedSet = new Set<string>()
      completedSnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        if (data.moduleIndex !== undefined && data.moduleIndex !== null && 
            data.lessonIndex !== undefined && data.lessonIndex !== null) {
          completedSet.add(`${data.moduleIndex}-${data.lessonIndex}`)
        }
      })

      // Also check userLessonProgress for lessons that might not have reached userCompletedItems yet
      const lessonProgressQuery = query(
        collection(db, "userLessonProgress"),
        where("userId", "==", userId),
        where("courseId", "==", courseId)
      )
      const lpSnapshot = await getDocs(lessonProgressQuery)
      
      let latestLp: any = null
      lpSnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        if (data.completed) {
          completedSet.add(`${data.moduleIndex}-${data.lessonIndex}`)
        }
        // Track the most recently updated progress for lastAccessed restoration
        if (!latestLp || (data.updatedAt && latestLp.updatedAt && data.updatedAt.toMillis() > latestLp.updatedAt.toMillis())) {
          latestLp = data
        }
      })

      completedLessons = Array.from(completedSet)
      
      if (latestLp) {
        lastAccessedModule = latestLp.moduleIndex
        lastAccessedLesson = latestLp.lessonIndex
      }

      // Calculate total lessons from course data
      if (courseData && Array.isArray(courseData.modules)) {
        for (const module of courseData.modules) {
          if (Array.isArray(module.lessons)) {
            totalLessons += module.lessons.length
          }
        }
      }
    } catch (error) {
      console.error("Error restoring progress:", error)
    }

    const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons.length / totalLessons) * 100)) : 0

    const progressData: any = {
      userId,
      courseId,
      progress: progressPercent,
      completedLessons,
      moduleQuizScores,
      finalQuizScore: finalQuizScore || null,
      claimedRewards,
      createdAt: serverTimestamp(),
      lastAccessed: serverTimestamp(),
      isOwnCourse: isOwnCourse || (courseCreatedBy === userId),
      addedFrom: addedFrom || null,
    }

    if (lastAccessedModule !== undefined) progressData.lastAccessedModule = lastAccessedModule
    if (lastAccessedLesson !== undefined) progressData.lastAccessedLesson = lastAccessedLesson

    await setDoc(progressRef, progressData)
  } else {
    // Update last accessed and ensure isOwnCourse is set
    const updates: any = {
      lastAccessed: serverTimestamp(),
    }
    
    // Set isOwnCourse if not already set
    const existingData = progressDoc.data()
    if (existingData.isOwnCourse === undefined) {
      updates.isOwnCourse = isOwnCourse || (courseCreatedBy === userId)
    }
    
    // Set addedFrom if not already set and provided
    if (addedFrom && !existingData.addedFrom) {
      updates.addedFrom = addedFrom
    }
    
    await updateDoc(progressRef, updates)
  }
}

/**
 * Get user's courses with progress
 */
export async function getUserCourses(userId: string): Promise<CourseWithProgress[]> {
  try {
    // Get all user progress entries
    const progressQuery = query(
      collection(db, "userCourseProgress"),
      where("userId", "==", userId)
    )
    const progressSnapshot = await getDocs(progressQuery)
    
    const courseIds: string[] = []
    const progressMap = new Map<string, UserCourseProgress>()
    
    progressSnapshot.forEach((doc) => {
      const progress = doc.data() as UserCourseProgress
      courseIds.push(progress.courseId)
      progressMap.set(progress.courseId, progress)
    })
    
    // Fetch course data
    const courses: CourseWithProgress[] = []
    for (const courseId of courseIds) {
      const courseDoc = await getDoc(doc(db, "courses", courseId))
      if (courseDoc.exists()) {
        const courseData = courseDoc.data()
        const progress = progressMap.get(courseId)
        
        // Ensure isOwnCourse is set in progress
        if (progress && progress.isOwnCourse === undefined) {
          progress.isOwnCourse = courseData.createdBy === userId
        }
        
        courses.push({
          id: courseDoc.id,
          ...courseData,
          userProgress: progress,
        } as CourseWithProgress)
      }
    }
    
    // Sort by last accessed
    courses.sort((a, b) => {
      const aTime = a.userProgress?.lastAccessed?.toMillis() || 0
      const bTime = b.userProgress?.lastAccessed?.toMillis() || 0
      return bTime - aTime
    })
    
    return courses
  } catch (error) {
    console.error("Error fetching user courses:", error)
    return []
  }
}

/**
 * Get the count of courses published by a user
 */
export async function getUserPublishedCoursesCount(userId: string): Promise<number> {
  try {
    const coursesQuery = query(
      collection(db, "courses"),
      where("createdBy", "==", userId),
      where("isPublic", "==", true)
    )
    const snapshot = await getDocs(coursesQuery)
    return snapshot.size
  } catch (error) {
    console.error("Error fetching published courses count:", error)
    return 0
  }
}

/**
 * Get the courses published by a user
 */
export async function getUserPublishedCourses(userId: string): Promise<PublicCourse[]> {
  try {
    const coursesQuery = query(
      collection(db, "courses"),
      where("createdBy", "==", userId),
      where("isPublic", "==", true),
      orderBy("publishedAt", "desc")
    )
    const snapshot = await getDocs(coursesQuery)
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as PublicCourse))
  } catch (error: any) {
    // Fallback if index is not ready
    if (error.code === "failed-precondition") {
      try {
        const fallbackQuery = query(
          collection(db, "courses"),
          where("createdBy", "==", userId),
          where("isPublic", "==", true)
        )
        const snapshot = await getDocs(fallbackQuery)
        const courses = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as PublicCourse))
        
        // Sort manually
        courses.sort((a, b) => {
          const aTime = a.publishedAt?.toMillis() || 0
          const bTime = b.publishedAt?.toMillis() || 0
          return bTime - aTime
        })
        return courses
      } catch (fallbackError) {
        console.error("Error fetching published courses (fallback):", fallbackError)
        return []
      }
    }
    console.error("Error fetching published courses:", error)
    return []
  }
}

/**
 * Update user progress for a course
 */
export async function updateUserProgress(
  userId: string,
  courseId: string,
  updates: Partial<UserCourseProgress>
): Promise<XPAwardResult | null> {
  const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
  await updateDoc(progressRef, {
    ...updates,
    lastAccessed: serverTimestamp(),
  })

  // Check if course is now complete (progress reached 100%) and award course completion XP
  if (updates.progress !== undefined && updates.progress >= 100) {
    // Record course completion
    const { recordCourseCompletion } = await import("./completion-utils")
    await recordCourseCompletion(userId, courseId).catch((error) => {
      console.error("Error recording course completion:", error)
    })
    
    const { awardCourseCompletionXP } = await import("./xp-utils")
    const result = await awardCourseCompletionXP(userId, courseId).catch((error) => {
      console.error("Error awarding course completion XP:", error)
      return null
    })

    // Check badges after course completion
    const { checkAndUpdateBadges } = await import("./badge-utils")
    await checkAndUpdateBadges(userId).catch((error) => {
      console.error("Error checking badges:", error)
    })

    // Record community activity for course completion
    const courseDoc = await getDoc(doc(db, "courses", courseId))
    const courseTitle = courseDoc.data()?.title || "Untitled Course"
    const { recordActivity } = await import("./community-pulse-utils")
    recordActivity(userId, "course_completed", {
      courseId,
      courseTitle,
    }).catch((error) => {
      console.error("Error recording course completed activity:", error)
    })

    return result
  }
  return null
}

/**
 * Get a single course with user progress (without side effects)
 */
export async function getCourseWithProgress(
  courseId: string,
  userId: string
): Promise<CourseWithProgress | null> {
  try {
    const courseDoc = await getDoc(doc(db, "courses", courseId))
    if (!courseDoc.exists()) {
      return null
    }
    
    const progressRef = doc(db, "userCourseProgress", `${userId}-${courseId}`)
    const progressDoc = await getDoc(progressRef)
    
    const courseData = {
      id: courseDoc.id,
      ...courseDoc.data(),
    } as PublicCourse
    
    let userProgress: UserCourseProgress | undefined
    if (progressDoc.exists()) {
      userProgress = progressDoc.data() as UserCourseProgress
    }
    
    return {
      ...courseData,
      userProgress,
    }
  } catch (error) {
    console.error("Error fetching course with progress:", error)
    return null
  }
}

/**
 * Get lesson slide progress for a specific lesson (legacy support)
 */
export async function getLessonSlideProgress(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  totalSlides: number
): Promise<{ currentSlide: number; completed: boolean; progress: number }> {
  try {
    const progressLessonId = `${moduleIndex}-${lessonIndex}`
    const slideProgressRef = doc(db, "userLessonProgress", `${userId}-${courseId}-${progressLessonId}`)
    const slideProgressDoc = await getDoc(slideProgressRef)
    
    if (slideProgressDoc.exists()) {
      const data = slideProgressDoc.data()
      const completed = data.completed || false
      // Always return the saved currentSlide, even if completed (allows revisiting)
      const currentSlide = data.currentSlide !== undefined ? data.currentSlide : (completed ? totalSlides - 1 : 0)
      const progress = totalSlides > 0 ? Math.min((currentSlide / totalSlides) * 100, 100) : 0
      
      return {
        currentSlide,
        completed,
        progress: Math.round(progress),
      }
    }
    
    return {
      currentSlide: 0,
      completed: false,
      progress: 0,
    }
  } catch (error) {
    console.error("Error fetching lesson slide progress:", error)
    return {
      currentSlide: 0,
      completed: false,
      progress: 0,
    }
  }
}

/**
 * Get lesson stream progress for a specific lesson (new system)
 */
export async function getLessonStreamProgress(
  userId: string,
  courseId: string,
  moduleIndex: number,
  lessonIndex: number,
  totalBlocks: number
): Promise<{ currentBlockIndex: number; completed: boolean; progress: number; completedInteractions?: { [index: number]: any } }> {
  try {
    const progressLessonId = `${moduleIndex}-${lessonIndex}`
    const streamProgressRef = doc(db, "userLessonProgress", `${userId}-${courseId}-${progressLessonId}`)
    const streamProgressDoc = await getDoc(streamProgressRef)
    
    if (streamProgressDoc.exists()) {
      const data = streamProgressDoc.data()
      const completed = data.completed || false
      const completedInteractions = data.completedInteractions || {}
      // Always return the saved currentBlockIndex, even if completed (allows revisiting)
      const currentBlockIndex = data.currentBlockIndex !== undefined ? data.currentBlockIndex : (completed ? totalBlocks - 1 : 0)
      const progress = totalBlocks > 0 ? Math.min((currentBlockIndex / totalBlocks) * 100, 100) : 0
      
      return {
        currentBlockIndex,
        completed,
        progress: Math.round(progress),
        completedInteractions,
      }
    }
    
    return {
      currentBlockIndex: 0,
      completed: false,
      progress: 0,
      completedInteractions: {},
    }
  } catch (error) {
    console.error("Error fetching lesson stream progress:", error)
    return {
      currentBlockIndex: 0,
      completed: false,
      progress: 0,
      completedInteractions: {},
    }
  }
}

