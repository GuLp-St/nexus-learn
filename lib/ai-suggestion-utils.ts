import { getUserCourses } from "./course-utils"
import { PublicCourse } from "./course-utils"
import { db } from "./firebase"
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore"
import { generateCourseSuggestions } from "./gemini"

/**
 * Get AI suggested course for user
 * 
 * Step 1: Check user's library
 * Step 2: If library has courses:
 *   - Use Gemini to generate related course name suggestions
 *   - Search Firestore for public courses matching those names
 *   - If found: Return matched course with rating
 *   - If not found: Fallback to popular courses
 * Step 3: If library is empty:
 *   - Show popular courses
 * Step 4: If no public courses exist: Return null (show placeholder)
 */
export async function getAISuggestedCourse(userId: string): Promise<PublicCourse | null> {
  try {
    // Step 1: Get user's library courses
    const userCourses = await getUserCourses(userId)

    // Step 4: If no public courses exist at all, return null
    const allPublicCourses = await getPopularCourses(1)
    if (allPublicCourses.length === 0) {
      return null
    }

    // Step 3: If library is empty, return popular course
    if (userCourses.length === 0) {
      return allPublicCourses[0] || null
    }

    // Step 2: Library has courses - use AI suggestions
    try {
      // Get top 5 most recent courses from library
      const recentCourses = userCourses.slice(0, 5).map((c) => c.title)

      // Generate AI suggestions
      const suggestions = await generateCourseSuggestions(recentCourses)

      if (suggestions.length === 0) {
        // Fallback to popular courses
        return allPublicCourses[0] || null
      }

      // Search for public courses matching suggestions
      const matchedCourse = await searchCoursesByTitles(suggestions)

      if (matchedCourse) {
        return matchedCourse
      }

      // No match found, fallback to popular courses
      return allPublicCourses[0] || null
    } catch (error) {
      console.error("Error in AI suggestion flow:", error)
      // Fallback to popular courses on error
      return allPublicCourses[0] || null
    }
  } catch (error) {
    console.error("Error getting AI suggested course:", error)
    return null
  }
}

/**
 * Search for public courses matching any of the suggested titles
 * Uses case-insensitive partial matching
 */
async function searchCoursesByTitles(suggestedTitles: string[]): Promise<PublicCourse | null> {
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

    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.isPublic) {
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

