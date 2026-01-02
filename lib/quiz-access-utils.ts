import { CourseWithProgress } from "./course-utils"

/**
 * Check if a course quiz is available (course must be 100% complete)
 */
export function canAccessCourseQuiz(course: CourseWithProgress): boolean {
  return (course.userProgress?.progress || 0) >= 100
}

/**
 * Check if a module quiz is available (all lessons in the module must be completed)
 */
export function canAccessModuleQuiz(course: CourseWithProgress, moduleIndex: number): boolean {
  if (moduleIndex < 0 || moduleIndex >= course.modules.length) return false
  
  const module = course.modules[moduleIndex]
  const lessonKeys = module.lessons.map((_, idx) => `${moduleIndex}-${idx}`)
  const completedLessons = course.userProgress?.completedLessons || []
  
  return lessonKeys.every(key => completedLessons.includes(key))
}

/**
 * Check if a lesson quiz is available (lesson must be completed)
 */
export function canAccessLessonQuiz(course: CourseWithProgress, moduleIndex: number, lessonIndex: number): boolean {
  if (moduleIndex < 0 || moduleIndex >= course.modules.length) return false
  if (lessonIndex < 0 || lessonIndex >= course.modules[moduleIndex].lessons.length) return false
  
  const lessonKey = `${moduleIndex}-${lessonIndex}`
  const completedLessons = course.userProgress?.completedLessons || []
  
  return completedLessons.includes(lessonKey)
}

