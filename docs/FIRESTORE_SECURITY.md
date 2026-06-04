# Firestore security rules

**Current mode (FYP):** [`firestore.rules`](../firestore.rules) allows **public read/write** on all collections (`if true`). Use only for development.

For production, restore strict rules (see git history or re-implement from this doc) before launch.

## Deploy

1. Install Firebase CLI and log in: `firebase login`
2. Link your project: `firebase use <your-project-id>`
3. Add `firebase.json` (included) or set rules path in Firebase Console
4. Deploy:

```bash
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into **Firebase Console → Firestore → Rules → Publish**.

## What the rules enforce

| Area | Policy |
|------|--------|
| **Auth** | All access requires Firebase Auth (`request.auth != null`) |
| **Users** | Read any profile when signed in; write own profile; friend-request fields on others; small Nexon grants (+≤50) for royalties |
| **Courses** | Creator edits their course; anyone signed in can read; library adds only touch `addedCount` / `addedBy` |
| **Progress / streams** | `userId` on doc must match `request.auth.uid` |
| **Quizzes** | Attempts scoped to owner; questions readable/writable when signed in (generated content) |
| **Challenges / chat** | Only challenger + challenged, or sender + receiver |
| **Creation jobs** | Owner-only (`courseCreationJobs`) |
| **config/ai** | Read for signed-in users; **no client writes** (set keys in Console) |

## Server API routes (`/api/course-creation/*`)

Course creation uses **Firebase Admin SDK** on the server:

- `lib/firebase-admin.ts` — Admin app init
- `lib/course-creation-job-server.ts`, `lib/create-course-with-credit.ts`, `lib/course-material-server.ts` — privileged Firestore writes
- API routes verify `Authorization: Bearer <Firebase ID token>` and reject mismatched `userId`

Configure credentials before deploying strict rules:

1. Firebase Console → Project settings → Service accounts → Generate key
2. **Local:** `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` in `.env.local`
3. **Vercel:** `FIREBASE_SERVICE_ACCOUNT_JSON` = full JSON on one line (see `env.template`)

## Composite indexes

If queries fail after deploy, check the browser console / Firebase logs for index creation links. Common collections needing indexes:

- `userCourseProgress` — `userId`
- `quizAttempts` — `userId`, `courseId`, `completedAt`
- `challenges` — `challengerId` / `challengedId` + `status`
- `chatMessages` — `chatId` + `createdAt`
- `courseCreationJobs` — `userId` + `status`

## Testing

Use the **Rules Playground** in Firebase Console with a test UID, or:

```bash
firebase emulators:start --only firestore
```
