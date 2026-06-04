import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { deleteUserAccountAdmin, setUserRoleAdmin } from "@/lib/admin-delete-user"
import { getAdminFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ userId: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(request)
    const { userId } = await context.params
    const db = getAdminFirestore()

    const userSnap = await db.collection("users").doc(userId).get()
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const data = userSnap.data()!
    const progressSnap = await db
      .collection("userCourseProgress")
      .where("userId", "==", userId)
      .get()

    const courses = await Promise.all(
      progressSnap.docs.map(async (p) => {
        const progress = p.data()
        const courseId = progress.courseId as string
        const courseSnap = await db.collection("courses").doc(courseId).get()
        const course = courseSnap.exists ? courseSnap.data() : null
        const modules = (course?.modules ?? []).map(
          (mod: { title?: string; lessons?: { title?: string }[] }, moduleIndex: number) => ({
            moduleIndex,
            title: mod.title ?? `Module ${moduleIndex + 1}`,
            lessons: (mod.lessons ?? []).map((lesson, lessonIndex) => ({
              lessonIndex,
              title: lesson.title ?? `Lesson ${lessonIndex + 1}`,
            })),
          })
        )

        return {
          courseId,
          title: course?.title ?? "Unknown",
          isPublic: course?.isPublic ?? false,
          progress: progress.progress ?? 0,
          completedLessons: progress.completedLessons ?? [],
          moduleQuizScores: progress.moduleQuizScores ?? {},
          finalQuizScore: progress.finalQuizScore ?? null,
          modules,
        }
      })
    )

    return NextResponse.json({
      user: {
        id: userId,
        nickname: data.nickname ?? null,
        email: data.email ?? null,
        xp: data.xp ?? 0,
        nexon: data.nexon ?? 0,
        role: data.role ?? null,
        level: data.level ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      },
      courses,
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(request)
    const { userId } = await context.params
    const body = await request.json()

    const db = getAdminFirestore()
    const userRef = db.collection("users").doc(userId)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

    if (typeof body.nexon === "number" && body.nexon >= 0) {
      updates.nexon = body.nexon
    }
    if (typeof body.xp === "number" && body.xp >= 0) {
      updates.xp = body.xp
    }
    if (typeof body.nickname === "string" && body.nickname.trim()) {
      updates.nickname = body.nickname.trim()
    }
    if (body.role === "admin" || body.role === "user" || body.role === null) {
      if (body.role === "admin") {
        await setUserRoleAdmin(userId, "admin")
      } else {
        await setUserRoleAdmin(userId, null)
      }
    }

    if (Object.keys(updates).length > 1) {
      await userRef.update(updates)
    }

    const updated = await userRef.get()
    const data = updated.data()!
    return NextResponse.json({
      user: {
        id: userId,
        nickname: data.nickname ?? null,
        email: data.email ?? null,
        xp: data.xp ?? 0,
        nexon: data.nexon ?? 0,
        role: data.role ?? null,
      },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const adminUid = await requireAdmin(request)
    const { userId } = await context.params

    if (userId === adminUid) {
      return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 })
    }

    await deleteUserAccountAdmin(userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
