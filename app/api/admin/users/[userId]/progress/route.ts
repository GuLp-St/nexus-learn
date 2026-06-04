import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  buildModuleQuizScores,
  calcProgressPercent,
  getAllLessonKeys,
  getModuleLessonKeys,
  mergeCompletedLessons,
} from "@/lib/admin-progress"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import type { CourseData } from "@/lib/gemini"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ userId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(request)
    const { userId } = await context.params
    const body = await request.json()
    const courseId = body.courseId as string | undefined
    const action = body.action as string | undefined

    if (!courseId || !action) {
      return NextResponse.json({ error: "Missing courseId or action" }, { status: 400 })
    }

    const db = getAdminFirestore()
    const courseSnap = await db.collection("courses").doc(courseId).get()
    if (!courseSnap.exists) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 })
    }

    const course = courseSnap.data() as CourseData
    const progressId = `${userId}-${courseId}`
    const progressRef = db.collection("userCourseProgress").doc(progressId)
    const progressSnap = await progressRef.get()

    if (!progressSnap.exists) {
      return NextResponse.json({ error: "User has no progress for this course" }, { status: 404 })
    }

    const current = progressSnap.data()!
    let completedLessons: string[] = [...(current.completedLessons || [])]
    let moduleQuizScores: Record<string, number> = {
      ...(current.moduleQuizScores || {}),
    }
    // Normalize legacy numeric keys to strings
    for (const [k, v] of Object.entries(moduleQuizScores)) {
      moduleQuizScores[String(k)] = Number(v)
    }

    let finalQuizScore: number | null = current.finalQuizScore ?? null

    const moduleIndexNum = Number(body.moduleIndex)
    const lessonIndexNum = Number(body.lessonIndex)

    if (action === "complete_lesson") {
      if (Number.isNaN(moduleIndexNum) || Number.isNaN(lessonIndexNum)) {
        return NextResponse.json({ error: "Invalid module/lesson index" }, { status: 400 })
      }
      const key = `${moduleIndexNum}-${lessonIndexNum}`
      completedLessons = mergeCompletedLessons(completedLessons, [key])
    } else if (action === "complete_module_lessons") {
      if (Number.isNaN(moduleIndexNum)) {
        return NextResponse.json({ error: "Invalid moduleIndex" }, { status: 400 })
      }
      completedLessons = mergeCompletedLessons(
        completedLessons,
        getModuleLessonKeys(course, moduleIndexNum)
      )
    } else if (action === "complete_module") {
      if (Number.isNaN(moduleIndexNum)) {
        return NextResponse.json({ error: "Invalid moduleIndex" }, { status: 400 })
      }
      completedLessons = mergeCompletedLessons(
        completedLessons,
        getModuleLessonKeys(course, moduleIndexNum)
      )
      moduleQuizScores[String(moduleIndexNum)] = 100
    } else if (action === "complete_all_lessons") {
      completedLessons = getAllLessonKeys(course)
    } else if (action === "complete_module_quiz") {
      if (Number.isNaN(moduleIndexNum)) {
        return NextResponse.json({ error: "Invalid moduleIndex" }, { status: 400 })
      }
      moduleQuizScores[String(moduleIndexNum)] = 100
    } else if (action === "complete_all_module_quizzes") {
      moduleQuizScores = buildModuleQuizScores(course, 100)
    } else if (action === "complete_final_quiz") {
      finalQuizScore = 100
    } else if (action === "complete_course") {
      completedLessons = getAllLessonKeys(course)
      moduleQuizScores = buildModuleQuizScores(course, 100)
      finalQuizScore = 100
    } else if (action === "reset_progress") {
      completedLessons = []
      moduleQuizScores = {}
      finalQuizScore = null
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }

    const progress = calcProgressPercent(completedLessons, course)

    const updates: Record<string, unknown> = {
      completedLessons,
      moduleQuizScores,
      finalQuizScore,
      progress,
      lastAccessed: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (action === "reset_progress") {
      updates.lastAccessedModule = FieldValue.delete()
      updates.lastAccessedLesson = FieldValue.delete()
      updates.lastAccessedBlockIndex = FieldValue.delete()
      updates.claimedRewards = FieldValue.delete()
    } else if (action === "complete_lesson" && !Number.isNaN(moduleIndexNum) && !Number.isNaN(lessonIndexNum)) {
      updates.lastAccessedModule = moduleIndexNum
      updates.lastAccessedLesson = lessonIndexNum
    } else if (action === "complete_course") {
      const modules = course.modules ?? []
      const lastMod = Math.max(0, modules.length - 1)
      const lastLes = Math.max(0, (modules[lastMod]?.lessons?.length ?? 1) - 1)
      updates.lastAccessedModule = lastMod
      updates.lastAccessedLesson = lastLes
    } else if (action === "complete_module" && !Number.isNaN(moduleIndexNum)) {
      const lessons = course.modules?.[moduleIndexNum]?.lessons ?? []
      updates.lastAccessedModule = moduleIndexNum
      updates.lastAccessedLesson = Math.max(0, lessons.length - 1)
    }

    await progressRef.update(updates)

    return NextResponse.json({
      progress,
      completedLessons,
      moduleQuizScores,
      finalQuizScore,
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
