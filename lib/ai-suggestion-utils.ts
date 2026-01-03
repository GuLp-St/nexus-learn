import { getUserCourses } from "./course-utils"
import { PublicCourse } from "./course-utils"
import { db } from "./firebase"
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore"
import { generateCourseSuggestions } from "./gemini"

export type CourseSuggestion = {
  type: "community" | "ai"
  course?: PublicCourse
  title: string
}

/**
 * Get AI suggested courses for user (Always returns 3)
 */
export async function getAISuggestedCourses(userId: string): Promise<CourseSuggestion[]> {
  try {
    // Step 1: Get user's library courses
    const userCourses = await getUserCourses(userId)
    const userCourseIds = new Set(userCourses.map(c => c.id))

    // Step 4: If library is empty, return top 3 popular courses
    if (userCourses.length === 0) {
      const popular = await getPopularCourses(10)
      const notOwnedPopular = popular.filter(c => !userCourseIds.has(c.id)).slice(0, 3)
      return notOwnedPopular.map(c => ({
        type: "community",
        course: c,
        title: c.title
      }))
    }

    // Step 2: Use top 3 most recent courses
    const recentCourses = userCourses.slice(0, 3)
    const suggestions: CourseSuggestion[] = []

    // Map slots to recent courses
    // 3 slots, length could be 1, 2, or 3
    const slotsPerCourse = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      slotsPerCourse[i % recentCourses.length]++
    }

    for (let i = 0; i < recentCourses.length; i++) {
      const course = recentCourses[i]
      const slots = slotsPerCourse[i]
      
      // For each slot of this course, try to find community match or generate AI
      // To avoid duplicates, we'll keep track of what we've added
      const addedTitles = new Set(suggestions.map(s => s.title.toLowerCase()))

      // Generate AI suggestions for this course specifically
      const aiTitles = await generateCourseSuggestions([course.title], slots + 2) // Generate extra to find matches
      
      let slotsFilledForThisCourse = 0
      for (const aiTitle of aiTitles) {
        if (slotsFilledForThisCourse >= slots) break
        if (addedTitles.has(aiTitle.toLowerCase())) continue

        // Try to find in community library
        const communityMatch = await searchCoursesByTitles([aiTitle], Array.from(userCourseIds))
        
        if (communityMatch && !suggestions.some(s => s.course?.id === communityMatch.id)) {
          suggestions.push({
            type: "community",
            course: communityMatch,
            title: communityMatch.title
          })
          addedTitles.add(communityMatch.title.toLowerCase())
        } else {
          suggestions.push({
            type: "ai",
            title: aiTitle
          })
          addedTitles.add(aiTitle.toLowerCase())
        }
        slotsFilledForThisCourse++
      }

      // Fallback if AI failed to give enough unique suggestions
      while (slotsFilledForThisCourse < slots) {
        suggestions.push({
          type: "ai",
          title: `Advanced ${course.title}`
        })
        slotsFilledForThisCourse++
      }
    }

    return suggestions.slice(0, 3)
  } catch (error) {
    console.error("Error getting AI suggested courses:", error)
    // Absolute fallback: Popular courses
    const popular = await getPopularCourses(3)
    return popular.map(c => ({
      type: "community",
      course: c,
      title: c.title
    }))
  }
}

/**
 * Search for public courses matching any of the suggested titles
 * Uses case-insensitive partial matching
 */
async function searchCoursesByTitles(suggestedTitles: string[], excludeIds: string[] = []): Promise<PublicCourse | null> {
  try {
    // Try to use index first
    let coursesQuery
    try {
      coursesQuery = query(
        collection(db, "courses"),
        where("isPublic", "==", true),
        limit(100)
      )
    } catch (error: any) {
      // Fallback: fetch all and filter
      coursesQuery = query(collection(db, "courses"), limit(200))
    }

    const snapshot = await getDocs(coursesQuery)
    const courses: PublicCourse[] = []
    const excludeSet = new Set(excludeIds)

    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.isPublic && !excludeSet.has(doc.id)) {
        courses.push({
          id: doc.id,
          ...data,
        } as PublicCourse)
      }
    })

    // Search for matches (case-insensitive, partial match)
    const suggestedLower = suggestedTitles.map((t) => t.toLowerCase())

    for (const course of courses) {
      const titleLower = course.title?.toLowerCase() || ""
      
      // Check if any suggested title matches (partial match)
      for (const suggested of suggestedLower) {
        if (titleLower.includes(suggested) || suggested.includes(titleLower)) {
          return course
        }
      }
    }

    return null
  } catch (error) {
    console.error("Error searching courses by titles:", error)
    return null
  }
}

/**
 * Get popular courses (sorted by average rating)
 */
async function getPopularCourses(limitCount: number = 1): Promise<PublicCourse[]> {
  try {
    let coursesQuery
    try {
      // Try to use index first
      coursesQuery = query(
        collection(db, "courses"),
        where("isPublic", "==", true),
        orderBy("averageRating", "desc"),
        limit(limitCount)
      )
    } catch (error: any) {
      // Fallback: fetch all and filter
      coursesQuery = query(collection(db, "courses"), limit(200))
    }

    const snapshot = await getDocs(coursesQuery)
    const courses: PublicCourse[] = []

    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.isPublic) {
        courses.push({
          id: doc.id,
          ...data,
        } as PublicCourse)
      }
    })

    // Sort by rating if using fallback
    if (courses.length > 0) {
      courses.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
    }

    return courses.slice(0, limitCount)
  } catch (error) {
    console.error("Error getting popular courses:", error)
    return []
  }
}

