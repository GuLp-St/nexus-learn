/**
 * Grant admin role to a user by UID or email.
 *
 * Usage:
 *   set GOOGLE_APPLICATION_CREDENTIALS=service-account.json
 *   npx tsx scripts/grant-admin.ts <uid-or-email>
 *
 * Or add UID to Firestore config/admins: { userIds: ["..."] }
 */

import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
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
  const arg = process.argv[2]?.trim()
  if (!arg) {
    console.error("Usage: npx tsx scripts/grant-admin.ts <firebase-uid-or-email>")
    process.exit(1)
  }

  const admin = await import("firebase-admin")
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })
  }

  const db = admin.firestore()
  let uid = arg

  if (arg.includes("@")) {
    const snap = await db.collection("users").where("email", "==", arg).limit(1).get()
    if (snap.empty) {
      console.error("No user found with email:", arg)
      process.exit(1)
    }
    uid = snap.docs[0].id
  }

  await db.collection("users").doc(uid).set(
    { role: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  )

  console.log(`Granted admin role to users/${uid}`)
  console.log("Sign out and back in, or refresh — sidebar will show Admin tabs.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
