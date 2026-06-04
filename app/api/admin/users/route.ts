import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminFirestore } from "@/lib/firebase-admin"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const limitParam = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)
    const search = (searchParams.get("search") || "").trim().toLowerCase()

    const db = getAdminFirestore()
    let snap
    try {
      snap = await db.collection("users").orderBy("createdAt", "desc").limit(limitParam).get()
    } catch {
      snap = await db.collection("users").limit(limitParam).get()
    }

    let users = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        nickname: data.nickname ?? null,
        email: data.email ?? null,
        xp: data.xp ?? 0,
        nexon: data.nexon ?? 0,
        role: data.role ?? null,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      }
    })

    if (search) {
      users = users.filter(
        (u) =>
          u.nickname?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search)
      )
    }

    return NextResponse.json({ users })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
