/**
 * One-time: push AI config from .env.local → Firestore config/ai
 *
 * 1. Put keys in .env.local (NEXT_PUBLIC_GEMINI_API_KEY, CLOUDFLARE_*, Firebase vars)
 * 2. Download service-account.json from Firebase → project root
 * 3. Run:
 *      set GOOGLE_APPLICATION_CREDENTIALS=service-account.json
 *      npm run setup:ai
 */

import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) {
    console.error("Missing .env.local — create it first (see .env.example)")
    process.exit(1)
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim()
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim()

  if (!projectId) {
    console.error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local")
    process.exit(1)
  }
  if (!geminiKey) {
    console.error("Missing NEXT_PUBLIC_GEMINI_API_KEY in .env.local")
    process.exit(1)
  }
  if (!accountId || !cfToken) {
    console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env.local")
    process.exit(1)
  }

  const payload = {
    geminiApiKeys: [geminiKey],
    geminiModel: "gemini-3.1-flash-lite-preview",
    cloudflareAccounts: [{ accountId, apiToken: cfToken }],
    cloudflareImageModel:
      process.env.CLOUDFLARE_IMAGE_MODEL?.trim() ||
      "@cf/black-forest-labs/flux-1-schnell",
    updatedAt: new Date().toISOString(),
  }

  const admin = await import("firebase-admin")
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    })
  }

  await admin.firestore().collection("config").doc("ai").set(payload, { merge: true })

  console.log("Done — Firestore config/ai updated:")
  console.log("  geminiApiKeys: 1")
  console.log("  cloudflareAccounts: 1 (accountId + apiToken)")
  console.log("\nAdd more keys in Firebase Console anytime (arrays). Env still works as fallback.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
