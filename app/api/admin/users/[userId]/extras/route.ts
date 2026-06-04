import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  BADGE_IDS,
  equipCosmeticAdmin,
  getUserBadgesAdmin,
  getUserCosmeticsAdmin,
  grantCosmeticAdmin,
  revokeCosmeticAdmin,
  setUserBadgeAdmin,
} from "@/lib/admin-user-extras-server"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAllCosmetics } from "@/lib/cosmetics-utils"
import type { BadgeId } from "@/lib/badge-utils"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ userId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(_request)
    const { userId } = await context.params

    const [badges, cosmetics, catalog] = await Promise.all([
      getUserBadgesAdmin(userId),
      getUserCosmeticsAdmin(userId),
      getAllCosmetics(),
    ])

    return NextResponse.json({
      badgeIds: BADGE_IDS,
      badges: badges.badges,
      cosmetics,
      catalog: catalog.map((c) => ({
        id: c.id,
        category: c.category,
        name: c.name,
        price: c.price,
        rarity: c.rarity,
      })),
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
    const action = body.action as string

    if (action === "set_badge") {
      const badgeId = body.badgeId as BadgeId
      const unlocked = !!body.unlocked
      await setUserBadgeAdmin(userId, badgeId, unlocked)
      return NextResponse.json({ success: true })
    }

    if (action === "grant_cosmetic") {
      await grantCosmeticAdmin(userId, body.cosmeticId as string, body.category as string)
      return NextResponse.json({ success: true })
    }

    if (action === "revoke_cosmetic") {
      await revokeCosmeticAdmin(userId, body.cosmeticId as string, body.category as string)
      return NextResponse.json({ success: true })
    }

    if (action === "equip_cosmetic") {
      await equipCosmeticAdmin(userId, body.cosmeticId as string, body.category as string)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
