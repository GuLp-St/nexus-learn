import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminFirestore } from "@/lib/firebase-admin"
import { deleteAllCourseAssets } from "@/lib/course-image-cleanup"
import { FieldValue } from "firebase-admin/firestore"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)
    const db = getAdminFirestore()

    let snap
    try {
      snap = await db
        .collection("courses")
        .where("isPublic", "==", true)
        .orderBy("publishedAt", "desc")
        .limit(100)
        .get()
    } catch {
      snap = await db.collection("courses").where("isPublic", "==", true).limit(100).get()
    }

    const courses = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        title: data.title ?? "Untitled",
        description: data.description ?? "",
        createdBy: data.createdBy ?? null,
        tags: data.tags ?? [],
        imageUrl: data.imageUrl ?? null,
        imageKey: data.imageKey ?? null,
        imageConfig: data.imageConfig ?? null,
        averageRating: data.averageRating ?? 0,
        ratingCount: data.ratingCount ?? 0,
        addedCount: data.addedCount ?? 0,
        publishedAt: data.publishedAt?.toMillis?.() ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      }
    })

    courses.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))

    return NextResponse.json({ courses })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request)
    const body = await request.json()
    const courseId = body.courseId as string | undefined
    const action = body.action as string | undefined

    if (!courseId || !action) {
      return NextResponse.json({ error: "Missing courseId or action" }, { status: 400 })
    }

    const db = getAdminFirestore()
    const courseRef = db.collection("courses").doc(courseId)
    const courseSnap = await courseRef.get()
    if (!courseSnap.exists) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 })
    }

    if (action === "unpublish") {
      await courseRef.update({
        isPublic: false,
        unpublishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return NextResponse.json({ success: true, isPublic: false })
    }

    if (action === "update") {
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (typeof body.title === "string" && body.title.trim()) {
        updates.title = body.title.trim()
      }
      if (typeof body.description === "string") {
        updates.description = body.description
      }
      if (Array.isArray(body.tags)) {
        updates.tags = body.tags.filter((t: unknown) => typeof t === "string")
      } else if (typeof body.tags === "string") {
        updates.tags = body.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean)
      }
      if (typeof body.imageUrl === "string") {
        updates.imageUrl = body.imageUrl.trim() || null
      }
      if (typeof body.imageKey === "string") {
        updates.imageKey = body.imageKey.trim() || null
      }
      if (body.imageConfig && typeof body.imageConfig === "object") {
        const cfg = body.imageConfig as {
          fit?: string
          position?: { x?: number; y?: number }
          scale?: number
        }
        updates.imageConfig = {
          fit: cfg.fit === "contain" ? "contain" : "cover",
          position: {
            x: typeof cfg.position?.x === "number" ? cfg.position.x : 50,
            y: typeof cfg.position?.y === "number" ? cfg.position.y : 50,
          },
          scale: typeof cfg.scale === "number" ? cfg.scale : 1,
        }
      }
      await courseRef.update(updates)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get("courseId")

    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 })
    }

    const db = getAdminFirestore()
    const courseRef = db.collection("courses").doc(courseId)
    const courseSnap = await courseRef.get()
    if (!courseSnap.exists) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 })
    }

    const courseData = courseSnap.data()!
    await deleteAllCourseAssets({
      imageKey: typeof courseData.imageKey === "string" ? courseData.imageKey : undefined,
      sourceMaterialId:
        typeof courseData.sourceMaterialId === "string"
          ? courseData.sourceMaterialId
          : undefined,
    })

    // Remove progress entries pointing at this course
    const progressSnap = await db
      .collection("userCourseProgress")
      .where("courseId", "==", courseId)
      .get()
    const batch = db.batch()
    progressSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()

    await courseRef.delete()
    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
