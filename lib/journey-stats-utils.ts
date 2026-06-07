import type { CourseWithProgress } from "./course-utils"
import { getModuleQuizScore } from "./progress-display-utils"

export interface JourneyDisplayStats {
  modulesMastered: number
  performanceRating: number
  gradeS: number
}

/** Stats from course progress (moduleQuizScores + finalQuizScore). */
export function computeJourneyStatsFromCourses(
  courses: CourseWithProgress[]
): JourneyDisplayStats {
  const modulesMasteredSet = new Set<string>()
  let totalScore = 0
  let totalMax = 0
  let gradeS = 0

  for (const course of courses) {
    const progress = course.userProgress
    if (!progress) continue

    course.modules.forEach((_, moduleIndex) => {
      const score = getModuleQuizScore(progress.moduleQuizScores, moduleIndex)
      if (score !== undefined && score >= 100) {
        modulesMasteredSet.add(`${course.id}-${moduleIndex}`)
      }
      if (score !== undefined && score > 0) {
        totalScore += score
        totalMax += 100
      }
    })

    const final = progress.finalQuizScore
    if (final !== null && final !== undefined) {
      totalScore += final
      totalMax += 100
      if (final >= 100) gradeS++
    }
  }

  return {
    modulesMastered: modulesMasteredSet.size,
    performanceRating: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    gradeS,
  }
}
