import { getAdminFirestore } from "./firebase-admin"
import type { CourseWithProgress } from "./course-utils"
import { pregenerateLesson } from "./pregenerate-lesson"

/** Fire-and-forget: prebuild lesson 0 after a new course is created. */
export async function pregenerateFirstLessonForCourse(
  userId: string,
  courseId: string
): Promise<void> {
  const db = getAdminFirestore()
  const snap = await db.collection("courses").doc(courseId).get()
  if (!snap.exists) return

  const course = { id: snap.id, ...snap.data() } as CourseWithProgress
  if (!course.modules?.[0]?.lessons?.[0]) return

  await pregenerateLesson(userId, course, 0, 0)
}
