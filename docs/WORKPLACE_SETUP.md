# Workplace setup (clone → run)

Use this when you pull the repo on a new machine. **Everything in Git is the app source.** A few files stay **only on your machine** (secrets).

## 1. Clone and install

```bash
git clone <your-repo-url>
cd nexus-learn
npm install
```

## 2. Files you must create locally (not in GitHub)

| File | How to get it |
|------|----------------|
| **`.env.local`** | Copy `env.template` → `.env.local`, then fill in values from Firebase, Gemini, Cloudflare, Uploadthing, etc. |
| **`service-account.json`** (optional) | Firebase Console → Project settings → Service accounts → Generate key. Only needed if you use `GOOGLE_APPLICATION_CREDENTIALS` instead of `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local`. |

On **Vercel**, set the same variable names as in `env.template` (especially `FIREBASE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET` for challenge expiry cron).

## 3. Files in the repo you should keep

| Path | Purpose |
|------|---------|
| `env.template` | Checklist of env vars (copy to `.env.local`) |
| `firebase.json` / `.firebaserc` | Firebase CLI (Firestore rules/indexes deploy) |
| `firestore.rules` | Active Firestore rules (open rules in dev; use `firestore.rules.example` before production) |
| `firestore.indexes.json` | Composite indexes for queries |
| `firestore/ai-config.example.json` | Example AI config; copy pattern into Firestore `config/ai` doc |
| `public/pdf.worker.min.mjs` | PDF extraction in browser (regenerated via `npm run postinstall`) |
| `docs/FIRESTORE_SECURITY.md` | Production security notes |
| `docs/FIRESTORE_AI_SETUP.md` | AI / Gemini setup |

## 4. Safe to ignore / not required in Git

These are **gitignored** or personal—do not commit:

- `.env.local`, `.env*.local`
- `node_modules/`, `.next/`
- `service-account.json`, `firebase-service-account.json`
- `.cursor/` (IDE settings)
- `.vercel/`

## 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 6. Optional: Firebase deploy (rules/indexes)

```bash
npm run firebase:deploy:rules
npm run firebase:deploy:indexes
```

## 7. Challenge expiry cron (production)

External scheduler (e.g. [cron-job.org](https://cron-job.org)) calls:

`GET https://<your-domain>/api/cron/challenges-expire`

With header: `Authorization: Bearer <CRON_SECRET>` (see `env.template`).

---

**Quick checklist after `git pull` on a new PC**

1. `npm install`
2. Paste/create `.env.local` from your secure backup (or refill from `env.template`)
3. Paste `service-account.json` if you use file-based Admin SDK locally
4. `npm run dev`

No other manual file copies are required for normal app development.
