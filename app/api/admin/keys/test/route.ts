import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { testCloudflareCredential, testGeminiKey } from "@/lib/admin-key-test"
import { adminErrorResponse } from "@/lib/admin-route-utils"
import { getAdminFirestore } from "@/lib/firebase-admin"
import { getGeminiModelName } from "@/lib/gemini-model"

export const runtime = "nodejs"
export const maxDuration = 60

type CloudflareAccount = { accountId: string; apiToken: string }

function parseGeminiKeys(data: Record<string, unknown>): string[] {
  const raw = data.geminiApiKeys
  if (!Array.isArray(raw)) return []
  return raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
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
        typeof (a as CloudflareAccount).apiToken === "string"
    )
    .map((a) => ({
      accountId: (a as CloudflareAccount).accountId.trim(),
      apiToken: (a as CloudflareAccount).apiToken.trim(),
    }))
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request)
    const body = await request.json()
    const provider = (body.provider as string) || "gemini"
    const index =
      typeof body.index === "number"
        ? body.index
        : parseInt(String(body.index ?? ""), 10)

    const db = getAdminFirestore()
    const snap = await db.collection("config").doc("ai").get()
    const data = snap.exists ? snap.data()! : {}

    if (provider === "cloudflare") {
      let accountId = (body.accountId as string | undefined)?.trim()
      let apiToken = (body.apiToken as string | undefined)?.trim()
      const imageModel = (body.imageModel as string | undefined)?.trim()

      if (!Number.isNaN(index) && index >= 0) {
        const accounts = parseCloudflareAccounts(data)
        const cred = accounts[index]
        if (!cred) {
          return NextResponse.json({ error: "Credential index not found" }, { status: 404 })
        }
        accountId = cred.accountId
        apiToken = cred.apiToken
      }

      if (!accountId || !apiToken) {
        return NextResponse.json(
          { error: "Provide accountId + apiToken, or a valid index" },
          { status: 400 }
        )
      }

      const modelToTest =
        imageModel ||
        (typeof data.cloudflareImageModel === "string"
          ? data.cloudflareImageModel
          : undefined)

      const result = await testCloudflareCredential(
        accountId,
        apiToken,
        body.testImageModel ? modelToTest : undefined
      )
      return NextResponse.json(result)
    }

    // Gemini
    let apiKey = (body.key as string | undefined)?.trim()
    const modelOverride = (body.model as string | undefined)?.trim()

    if (!Number.isNaN(index) && index >= 0) {
      const keys = parseGeminiKeys(data)
      const key = keys[index]
      if (!key) {
        return NextResponse.json({ error: "Key index not found" }, { status: 404 })
      }
      apiKey = key
    }

    if (!apiKey) {
      const envKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim()
      if (body.useEnvFallback && envKey) {
        apiKey = envKey
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Provide key or a valid index" },
        { status: 400 }
      )
    }

    const modelName =
      modelOverride ||
      (typeof data.geminiModel === "string" ? data.geminiModel.trim() : "") ||
      (await getGeminiModelName())

    const result = await testGeminiKey(apiKey, modelName)
    return NextResponse.json({ ...result, model: modelName })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
