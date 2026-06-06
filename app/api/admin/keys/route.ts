import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { invalidateGeminiKeysCache } from "@/lib/gemini-keys"
import { invalidateGeminiModelCache } from "@/lib/gemini-model"
import { invalidateCloudflareConfigCache } from "@/lib/cloudflare-keys"

export const runtime = "nodejs"

type CloudflareAccount = { accountId: string; apiToken: string; note?: string }

function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••"
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function parseGeminiKeys(data: Record<string, unknown>): string[] {
  const raw = data.geminiApiKeys
  if (!Array.isArray(raw)) return []
  return raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
}

function parseGeminiKeyNotes(data: Record<string, unknown>): string[] {
  const raw = data.geminiKeyNotes
  if (!Array.isArray(raw)) return []
  return raw.map((n) => (typeof n === "string" ? n : ""))
}

function parseCloudflareAccounts(data: Record<string, unknown>): CloudflareAccount[] {
  const raw = data.cloudflareAccounts
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (a): a is CloudflareAccount =>
        !!a &&
        typeof a === "object" &&
        typeof (a as CloudflareAccount).accountId === "string" &&
        typeof (a as CloudflareAccount).apiToken === "string" &&
        (a as CloudflareAccount).accountId.trim().length > 0 &&
        (a as CloudflareAccount).apiToken.trim().length > 0
    )
    .map((a) => ({
      accountId: a.accountId.trim(),
      apiToken: a.apiToken.trim(),
      note: typeof a.note === "string" ? a.note : "",
    }))
}

function usageForIndex(
  usage: Record<string, Record<string, { requests?: number; rateLimits?: number }>> | undefined,
  index: number,
  today: string
) {
  const dayUsage = usage?.[String(index)]?.[today]
  return {
    todayRequests: dayUsage?.requests ?? 0,
    todayRateLimits: dayUsage?.rateLimits ?? 0,
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)
    const db = getAdminFirestore()
    const snap = await db.collection("config").doc("ai").get()
    const data = snap.exists ? snap.data()! : {}

    const geminiKeys = parseGeminiKeys(data)
    const geminiKeyNotes = parseGeminiKeyNotes(data)
    const cloudflareAccounts = parseCloudflareAccounts(data)
    const today = new Date().toISOString().slice(0, 10)

    const geminiUsage = data.geminiKeyUsage as Record<
      string,
      Record<string, { requests?: number; rateLimits?: number }>
    >
    const cloudflareUsage = data.cloudflareKeyUsage as Record<
      string,
      Record<string, { requests?: number; rateLimits?: number }>
    >

    const geminiEnvFallback = !!process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim()
    const cfEnvFallback =
      !!process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      !!process.env.CLOUDFLARE_API_TOKEN?.trim()

    return NextResponse.json({
      gemini: {
        keys: geminiKeys.map((key, index) => ({
          index,
          masked: maskSecret(key),
          note: geminiKeyNotes[index] ?? "",
          ...usageForIndex(geminiUsage, index, today),
        })),
        model: data.geminiModel ?? null,
        envFallback: geminiEnvFallback,
        source:
          geminiKeys.length > 0 ? "firestore" : geminiEnvFallback ? "env" : "none",
      },
      cloudflare: {
        accounts: cloudflareAccounts.map((acc, index) => ({
          index,
          maskedAccountId: maskSecret(acc.accountId),
          maskedToken: maskSecret(acc.apiToken),
          note: acc.note ?? "",
          ...usageForIndex(cloudflareUsage, index, today),
        })),
        imageModel: data.cloudflareImageModel ?? null,
        imageModelFallback: data.cloudflareImageModelFallback ?? null,
        envFallback: cfEnvFallback,
        source:
          cloudflareAccounts.length > 0
            ? "firestore"
            : cfEnvFallback
              ? "env"
              : "none",
      },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request)
    const body = await request.json()
    const provider = (body.provider as string) || "gemini"

    const db = getAdminFirestore()
    const ref = db.collection("config").doc("ai")
    const snap = await ref.get()
    const data = snap.exists ? snap.data()! : {}

    if (provider === "cloudflare") {
      const accountId = (body.accountId as string | undefined)?.trim()
      const apiToken = (body.apiToken as string | undefined)?.trim()

      if (!accountId || !apiToken) {
        return NextResponse.json(
          { error: "Missing accountId or apiToken" },
          { status: 400 }
        )
      }

      const existing = parseCloudflareAccounts(data)
      const duplicate = existing.some(
        (a) => a.accountId === accountId && a.apiToken === apiToken
      )
      if (duplicate) {
        return NextResponse.json({ error: "Credential already exists" }, { status: 400 })
      }

      const note = typeof body.note === "string" ? body.note.trim() : ""

      await ref.set(
        {
          cloudflareAccounts: [...existing, { accountId, apiToken, note }],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      invalidateCloudflareConfigCache()

      return NextResponse.json({ success: true, count: existing.length + 1 })
    }

    // gemini (default)
    const newKey = (body.key as string | undefined)?.trim()
    if (!newKey) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 })
    }

    const existing = parseGeminiKeys(data)
    if (existing.includes(newKey)) {
      return NextResponse.json({ error: "Key already exists" }, { status: 400 })
    }

    await ref.set(
      {
        geminiApiKeys: [...existing, newKey],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    invalidateGeminiKeysCache()

    return NextResponse.json({ success: true, count: existing.length + 1 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request)
    const body = await request.json()
    const provider = (body.provider as string) || "gemini"

    const db = getAdminFirestore()
    const ref = db.collection("config").doc("ai")
    const snap = await ref.get()
    const data = snap.exists ? snap.data()! : {}
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (provider === "gemini") {
      if (typeof body.geminiModel === "string") {
        updates.geminiModel = body.geminiModel.trim() || null
        await ref.set(updates, { merge: true })
        invalidateGeminiModelCache()
        return NextResponse.json({ success: true })
      }
      if (typeof body.index === "number" && typeof body.note === "string") {
        const existing = parseGeminiKeys(data)
        if (body.index < 0 || body.index >= existing.length) {
          return NextResponse.json({ error: "Index out of range" }, { status: 400 })
        }
        const notes = parseGeminiKeyNotes(data)
        while (notes.length < existing.length) notes.push("")
        notes[body.index] = body.note.trim()
        updates.geminiKeyNotes = notes
        await ref.set(updates, { merge: true })
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    }

    if (provider === "cloudflare") {
      if (typeof body.cloudflareImageModel === "string") {
        updates.cloudflareImageModel = body.cloudflareImageModel.trim() || null
      }
      if (typeof body.cloudflareImageModelFallback === "string") {
        updates.cloudflareImageModelFallback =
          body.cloudflareImageModelFallback.trim() || null
      }
      if (typeof body.index === "number" && typeof body.note === "string") {
        const existing = parseCloudflareAccounts(data)
        if (body.index < 0 || body.index >= existing.length) {
          return NextResponse.json({ error: "Index out of range" }, { status: 400 })
        }
        const updated = existing.map((acc, i) =>
          i === body.index ? { ...acc, note: body.note.trim() } : acc
        )
        updates.cloudflareAccounts = updated
      }
      if (Object.keys(updates).length <= 1) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
      }
      await ref.set(updates, { merge: true })
      invalidateCloudflareConfigCache()
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get("provider") || "gemini"
    const index = parseInt(searchParams.get("index") || "", 10)

    if (Number.isNaN(index) || index < 0) {
      return NextResponse.json({ error: "Invalid index" }, { status: 400 })
    }

    const db = getAdminFirestore()
    const ref = db.collection("config").doc("ai")
    const snap = await ref.get()
    const data = snap.exists ? snap.data()! : {}

    if (provider === "cloudflare") {
      const existing = parseCloudflareAccounts(data)
      if (index >= existing.length) {
        return NextResponse.json({ error: "Index out of range" }, { status: 400 })
      }

      const updated = existing.filter((_, i) => i !== index)
      await ref.set(
        {
          cloudflareAccounts: updated,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      invalidateCloudflareConfigCache()
      return NextResponse.json({ success: true, count: updated.length })
    }

    const existing = parseGeminiKeys(data)
    if (index >= existing.length) {
      return NextResponse.json({ error: "Index out of range" }, { status: 400 })
    }

    const updated = existing.filter((_, i) => i !== index)
    const notes = parseGeminiKeyNotes(data).filter((_, i) => i !== index)
    await ref.set(
      {
        geminiApiKeys: updated,
        geminiKeyNotes: notes,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    invalidateGeminiKeysCache()
    return NextResponse.json({ success: true, count: updated.length })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
