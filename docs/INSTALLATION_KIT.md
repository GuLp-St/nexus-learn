# NexusLearn — Installation Kit (Technical Setup Guide)

This guide covers everything required to install, configure, and run NexusLearn locally or on Vercel for demonstration and examination.

---

## 1. Prerequisites

| Software | Version / notes |
|----------|-----------------|
| **Node.js** | **20.x or 22.x** recommended (`@types/node` targets Node 22). Verify with `node -v`. |
| **npm** | Comes with Node.js (project uses `package-lock.json`). |
| **Git** | To clone the repository. |
| **Firebase CLI** | Optional, for deploying Firestore rules/indexes: `npm install -g firebase-tools` or use the devDependency via `npx firebase`. |
| **Google Chrome / Edge** | Recommended for local testing (Google Auth popup/redirect). |

### External accounts (free tiers available)

- [Firebase](https://console.firebase.google.com) — Auth + Firestore
- [Google AI Studio](https://aistudio.google.com) — Gemini API key
- [Cloudflare](https://dash.cloudflare.com) — Workers AI (course/lesson images)
- [Uploadthing](https://uploadthing.com) — File uploads for course materials
- [Unsplash](https://unsplash.com/developers) — Optional stock photos in image picker
- [Vercel](https://vercel.com) — Recommended production host
- [cron-job.org](https://cron-job.org) — Optional; expires stale 1v1 challenges in production

---

## 2. Environment variables

Copy `env.template` to `.env.local` in the project root. **Leave values blank in documentation; fill them in locally only.**

### Firebase (client — required)

| Key | Description |
|-----|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app ID |

Source: **Firebase Console → Project settings → Your apps → Web app config**.

### Gemini (text AI — required)

| Key | Description |
|-----|-------------|
| `NEXT_PUBLIC_GEMINI_API_KEY` | Google Gemini API key for chat, courses, lessons, quizzes |

| Key (optional) | Description |
|----------------|-------------|
| `GEMINI_MODEL` | Override model when Firestore `config/ai` has no `geminiModel` |
| `NEXT_PUBLIC_GEMINI_MODEL` | Client-visible model override (rare) |

### Cloudflare Workers AI (images — required for course covers / lesson art)

| Key | Description |
|-----|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Workers AI API token for that account |
| `CLOUDFLARE_IMAGE_MODEL` | Model ID, e.g. `@cf/black-forest-labs/flux-1-schnell` |

| Key (optional) | Description |
|----------------|-------------|
| `CLOUDFLARE_API_TOKENS` | Comma-separated extra tokens on the **same** account |
| `CLOUDFLARE_ACCOUNTS_JSON` | JSON array of `{ accountId, apiToken }` pairs for multi-account |

### Uploadthing (required)

| Key | Description |
|-----|-------------|
| `UPLOADTHING_TOKEN` | API token from uploadthing.com dashboard |

### Unsplash (optional)

| Key | Description |
|-----|-------------|
| `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` | Stock photo search in image picker |

### Firebase Admin (server — required for production / strict rules)

| Key | Description |
|-----|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | **Local only:** path to service account JSON, e.g. `./service-account.json` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Vercel/CI:** full service account JSON on one line |

Source: **Firebase Console → Project settings → Service accounts → Generate new private key**.

| Key (optional) | Description |
|----------------|-------------|
| `FIREBASE_PROJECT_ID` | Admin SDK project ID fallback |
| `GCLOUD_PROJECT` | GCP project fallback |

### Cron (production — challenge expiry)

| Key | Description |
|-----|-------------|
| `CRON_SECRET` | Shared secret for `GET /api/cron/challenges-expire` |

---

## 3. Run commands

From the project root (`nexus-learn/`):

```bash
# Install dependencies (also runs postinstall to copy PDF worker)
npm install

# Local development (http://localhost:3000)
npm run dev

# Production build
npm run build

# Serve production build locally
npm run start

# Lint
npm run lint
```

### Optional setup scripts

```bash
# Seed Firestore config/ai from .env.local (requires service account)
set GOOGLE_APPLICATION_CREDENTIALS=service-account.json   # Windows
npm run setup:ai

# Grant admin role to a user
npm run grant-admin <firebase-uid-or-email>

# Deploy Firestore rules and indexes
npm run firebase:deploy:rules
npm run firebase:deploy:indexes
```

---

## 4. Firebase / backend setup

### 4.1 Create Firebase project

1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. **Authentication → Sign-in method:**
   - Enable **Email/Password**
   - Enable **Google** (add support email; configure OAuth consent screen in Google Cloud if prompted)
3. **Firestore Database:** Create database (production mode is fine; rules are deployed separately).
4. Register a **Web app** and copy the six `NEXT_PUBLIC_FIREBASE_*` values into `.env.local`.

### 4.2 Firestore rules

| File | Purpose |
|------|---------|
| `firestore.rules` | **Currently open (dev/FYP)** — allows all read/write. **Do not use in production.** |
| `firestore.rules.example` | Deny-all template for production rebuild |
| `docs/FIRESTORE_SECURITY.md` | Policy reference for strict rules |

Deploy rules:

```bash
firebase login
firebase use <your-project-id>
npm run firebase:deploy:rules
```

Before public launch, replace `firestore.rules` with strict rules per `docs/FIRESTORE_SECURITY.md`.

### 4.3 Firestore indexes

Composite indexes are defined in `firestore.indexes.json`. Deploy with:

```bash
npm run firebase:deploy:indexes
```

If a query fails at runtime, check the browser console for a Firebase index creation link.

### 4.4 Firestore AI config (`config/ai`)

Central configuration for Gemini keys, model name, and Cloudflare image settings. Can be seeded via:

```bash
npm run setup:ai
```

Or created manually in Firebase Console. See `docs/FIRESTORE_AI_SETUP.md` and `firestore/ai-config.example.json`.

**Document path:** `config/ai`

| Field | Type | Purpose |
|-------|------|---------|
| `geminiApiKeys` | `string[]` | Gemini API keys (pool) |
| `geminiModel` | `string` | Active Gemini model |
| `cloudflareAccounts` | `array` | `{ accountId, apiToken }` pairs |
| `cloudflareImageModel` | `string` | Workers AI image model ID |
| `cloudflareImageModelFallback` | `string` | Optional fallback model |

### 4.5 Admin users

Admins are users with `users/{uid}.role === "admin"` **or** UID listed in `config/admins.userIds`.

```bash
npm run grant-admin examiner@example.com
```

Admin must sign out and back in for sidebar Admin tabs to appear.

### 4.6 Production cron job

Schedule an hourly HTTP GET to:

```
https://<your-domain>/api/cron/challenges-expire
```

Authentication (pick one):

- Header: `Authorization: Bearer <CRON_SECRET>`
- Header: `x-cron-secret: <CRON_SECRET>`
- Query: `?secret=<CRON_SECRET>`

Requires `CRON_SECRET` and `FIREBASE_SERVICE_ACCOUNT_JSON` on the server.

### 4.7 Vercel deployment

1. Import the Git repository in Vercel.
2. Add **all** environment variables from `env.template` (mirror `.env.local`).
3. Set `FIREBASE_SERVICE_ACCOUNT_JSON` as a single-line JSON string.
4. Deploy; configure the cron job against your production URL.

---

## 5. Post-install verification

| Check | How |
|-------|-----|
| App loads | Visit `http://localhost:3000` |
| Auth works | Sign up with email or Google at `/auth` |
| AI course | Create course → AI Topic (requires Nexon + Gemini) |
| Upload course | Create course → Upload PDF/DOCX/PPTX |
| Admin panel | Grant admin → visit `/admin/users` |

---

## 6. Files never committed to Git

These are listed in `.gitignore`:

- `.env.local`, `.env*.local`
- `service-account.json`, `firebase-service-account.json`
- `node_modules/`, `.next/`, `.vercel/`

Keep a secure backup of your `.env.local` when moving between machines. See `docs/WORKPLACE_SETUP.md` for a quick checklist.
