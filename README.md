# NexusLearn

AI-powered learning platform built with Next.js 16, Firebase, and Gemini. Students create personalised course journeys from uploaded materials or topic prompts, complete interactive lessons and AI-graded quizzes, compete in 1v1 challenges, and share courses in a community library.

## Features

- **AI course generation** — Upload PDF/DOCX/PPTX or enter a topic; Gemini builds modules, lessons, and quizzes.
- **Journey map** — Visual roadmap with lesson blocks, module quizzes, and a final course quiz.
- **Gamification** — XP, Nexon currency, daily quests, leaderboard, and cosmetic store.
- **Social learning** — Friends, chat, and real-time 1v1 quiz challenges (Classic and Powered modes).
- **Admin panel** — User management, progress editing, API key configuration, and impersonation for examiners.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| Auth & database | Firebase Auth, Firestore |
| AI (text) | Google Gemini API |
| AI (images) | Cloudflare Workers AI |
| File uploads | Uploadthing |
| Hosting | Vercel (recommended) |

## Quick start

```bash
git clone <your-repo-url>
cd nexus-learn
npm install
cp env.template .env.local   # fill in all required keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For full setup (Firebase, API keys, Firestore rules, cron jobs), see **[docs/INSTALLATION_KIT.md](docs/INSTALLATION_KIT.md)**.

## Documentation

| Document | Audience |
|----------|----------|
| [docs/INSTALLATION_KIT.md](docs/INSTALLATION_KIT.md) | Developers / examiners — prerequisites, env vars, Firebase setup |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | End users — sign-up, course creation, learning, challenges, admin |
| [docs/WORKPLACE_SETUP.md](docs/WORKPLACE_SETUP.md) | Quick clone-to-run checklist |
| [docs/FIRESTORE_AI_SETUP.md](docs/FIRESTORE_AI_SETUP.md) | Firestore `config/ai` document structure |
| [docs/FIRESTORE_SECURITY.md](docs/FIRESTORE_SECURITY.md) | Production Firestore rules |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |
| `npm run setup:ai` | Seed Firestore `config/ai` from `.env.local` |
| `npm run grant-admin <uid-or-email>` | Grant admin role to a user |
| `npm run firebase:deploy:rules` | Deploy Firestore security rules |
| `npm run firebase:deploy:indexes` | Deploy Firestore composite indexes |

## Environment variables

Copy `env.template` to `.env.local`. Required keys include Firebase client config, Gemini API key, Cloudflare Workers AI credentials, Uploadthing token, and (for production) Firebase Admin service account JSON and cron secret. See the installation kit for the full list.

**Never commit** `.env.local`, `service-account.json`, or API keys to version control.

## License

Final Year Project 
