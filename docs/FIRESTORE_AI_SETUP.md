# Firestore AI configuration (`config/ai`)

## Document structure

```
config (collection)
└── ai (document)
    ├── geminiApiKeys: string[]          ← Gemini only needs keys
    ├── geminiModel: string
    ├── cloudflareAccounts: array       ← Each item is { accountId, apiToken }
    └── cloudflareImageModel: string
```

### `cloudflareAccounts` (important)

Unlike Gemini, **each Cloudflare token only works with its own account ID**:

```json
"cloudflareAccounts": [
  {
    "accountId": "136a5986d82d3cf6e925ce74eb7c9644",
    "apiToken": "cfut_xxxx"
  },
  {
    "accountId": "136a5986d82d3cf6e925ce74eb7c9644",
    "apiToken": "cfut_yyyy"
  }
]
```

Same account, two tokens (rate-limit spread):

```json
[
  { "accountId": "136a5986d82d3cf6e925ce74eb7c9644", "apiToken": "token_A" },
  { "accountId": "136a5986d82d3cf6e925ce74eb7c9644", "apiToken": "token_B" }
]
```

Different accounts (rare for FYP):

```json
[
  { "accountId": "account_A", "apiToken": "token_for_A" },
  { "accountId": "account_B", "apiToken": "token_for_B" }
]
```

**Legacy** (still supported): `cloudflareAccountId` + `cloudflareApiTokens[]` — all tokens use one account ID.

## Firebase Console setup

1. Firestore → collection `config` → document `ai`
2. Field `cloudflareAccounts` → type **array** → add **map** items with:
   - `accountId` (string)
   - `apiToken` (string)

See `firestore/ai-config.example.json`.

## Environment variables

Copy `env.template` → `.env.local` and mirror in **Vercel**.

| Variable | Vercel? | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_FIREBASE_*` | Yes | All 6 Firebase fields |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Yes | Only Gemini env var needed |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your account |
| `CLOUDFLARE_API_TOKEN` | Yes | Workers AI token for that account |
| `CLOUDFLARE_API_TOKENS` | Optional | More tokens, **same** account ID |
| `CLOUDFLARE_ACCOUNTS_JSON` | Optional | Multi-account pairs (see env.template) |
| `CLOUDFLARE_IMAGE_MODEL` | Optional | Default flux schnell |
| `UPLOADTHING_TOKEN` | Yes | |
| `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` | Optional | |
| `HUGGINGFACE_API_KEY` | **Delete** | Unused |

## Setup script (reads `.env.local` → Firestore)

```powershell
# One-time: Firebase → Project settings → Service accounts → Generate key → save as service-account.json
$env:GOOGLE_APPLICATION_CREDENTIALS="service-account.json"
npm run setup:ai
```

Writes `config/ai` with your Gemini key + Cloudflare account/token from `.env.local`.
