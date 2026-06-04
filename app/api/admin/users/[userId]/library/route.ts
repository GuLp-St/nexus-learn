import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { removeCourseFromLibraryAdmin } from "@/lib/admin-library-server"
import { adminErrorResponse } from "@/lib/admin-route-utils"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ userId: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(request)
    const { userId } = await context.params
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get("courseId")

    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 })
    }

    await removeCourseFromLibraryAdmin(userId, courseId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
