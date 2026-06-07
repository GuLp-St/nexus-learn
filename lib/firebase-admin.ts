import * as admin from "firebase-admin"

function resolveProjectId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    undefined
  )
}

function initFirebaseAdmin(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!
  }

  const projectId = resolveProjectId()
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()

  if (serviceAccountJson) {
    try {
      const cred = JSON.parse(serviceAccountJson) as admin.ServiceAccount
      return admin.initializeApp({
        credential: admin.credential.cert(cred),
        projectId: cred.projectId || projectId,
      })
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON. Paste the full service account key from Firebase Console."
      )
    }
  }

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not configured. Add it to your Vercel environment variables."
    )
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  })
}

export function getAdminApp(): admin.app.App {
  return initFirebaseAdmin()
}

export function getAdminFirestore(): admin.firestore.Firestore {
  return getAdminApp().firestore()
}

export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth()
}
