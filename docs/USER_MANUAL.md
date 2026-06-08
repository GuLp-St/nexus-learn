# NexusLearn — User Manual (End-User Guide)

NexusLearn is a gamified AI learning platform. This guide walks through the main user flows from sign-up to admin examination.

---

## Table of contents

1. [Authentication](#1-authentication)
2. [Course creation](#2-course-creation)
3. [Learning and quizzes](#3-learning-and-quizzes)
4. [1v1 challenges](#4-1v1-challenges)
5. [Admin access](#5-admin-access)

---

## 1. Authentication

### 1.1 Sign up (new account)

1. Open the app and go to **Sign In** (`/auth`), or you will be redirected there when visiting a protected page.
2. Select the **Sign Up** tab.
3. Choose one method:

#### Email sign-up

1. Enter a **Nickname** (display name on leaderboard and social features).
2. Enter your **Email** and **Password** (minimum 6 characters).
3. Confirm your password.
4. Click **Sign Up**.
5. You are redirected to the **Dashboard** (`/`). Daily login XP is awarded automatically.

#### Google sign-up

1. Click **Continue with Google**.
2. Select your Google account (popup or redirect, depending on browser).
3. A profile is created automatically using your Google display name or email prefix.
4. You are redirected to the Dashboard.

### 1.2 Sign in (returning user)

1. Go to `/auth` and stay on the **Sign In** tab.
2. **Email:** enter email and password → **Sign In**.
3. **Google:** click **Continue with Google** → select account.
4. If you were trying to open a specific page before login, you are returned there after sign-in.

### 1.3 Sign out

1. Open the **sidebar** (menu icon on mobile, left panel on desktop).
2. Use **Hold to Log Out** at the bottom of the sidebar (press and hold until the bar completes).

---

## 2. Course creation

Navigate: **Sidebar → Create Course** (`/create-course`) or **Dashboard → Create** button.

The page has two main tabs: **Create** and **Browse Library**.

### 2.1 Creation fee (both methods)

- Generating a new course costs **150 Nexon** (in-app currency) per creation type.
- You pay once per **AI** or **Upload** credit; you are not charged again until a journey is successfully created.
- Earn Nexon from daily quests, quizzes, challenges, and the store.
- There is also a **generated course limit** based on your account level; the app will prompt you if the limit is reached.

### 2.2 AI topic course (text prompt)

1. On **Create Course**, ensure the **Create** tab is selected.
2. Select **AI Topic** (default mode).
3. If you have not paid the creation fee, click the pay button to spend **150 Nexon** for an AI credit.
4. Enter your **topic** in the text field (e.g. "Introduction to Machine Learning").
5. Click **Generate Course** (or equivalent create button).
6. **Difficulty analysis:** Gemini analyses your topic.
   - If multiple difficulty paths exist, choose one (beginner / intermediate / advanced structure) and confirm.
   - Otherwise generation starts immediately.
7. A **progress card** appears while the pipeline runs (modules, lessons, images). You may click **Browse elsewhere** and receive a notification when complete.
8. When finished, you are redirected to your new **Journey Map** for that course (`/journey/{courseId}`).

**URL shortcuts:**

- `/create-course?mode=ai` — AI tab
- `/create-course?mode=ai&topic=Your%20Topic` — pre-filled topic

### 2.3 Upload course (PDF / Word / PowerPoint)

1. On **Create Course**, select **Upload Files**.
2. Pay the **150 Nexon** upload creation fee if you have not already.
3. **Drag and drop** or **browse** to add files:
   - Supported: **PDF**, **DOCX**, **PPTX**
   - Max **10 MB** per file, up to **10 files**
4. Choose **difficulty** (beginner / intermediate / advanced) — affects module and lesson depth.
5. Optionally add **tone instructions** (e.g. "exam-focused", "beginner-friendly").
6. Click **Create from Upload**.
7. Files upload, then AI extracts content and builds the full course journey.
8. On completion, you are taken to the Journey Map for the new course.

**URL shortcut:** `/create-course?mode=upload`

### 2.4 Browse community library (alternative)

1. Open the **Browse Library** tab on Create Course.
2. Search or browse published community courses.
3. Click **Add to Journey** to copy a course into your library without generating one.

---

## 3. Learning and quizzes

### 3.1 Journey overview

1. Go to **Sidebar → Journey** (`/journey`).
2. View all your courses as cards or icons; organise with **folders**, **sort**, and **view type** options.
3. Click a course to open its **Journey Map** (`/journey/{courseId}`).

### 3.2 Journey Map (course roadmap)

The roadmap shows:

- **Modules** as sections along a path
- **Lessons** as nodes within each module
- **Module quizzes** after each module
- **Final course quiz** at the end

**Progression rules:**

- Module 0 is unlocked by default.
- Complete lessons in order within a module (each lesson unlocks the next).
- **Module quiz:** score above **50%** to unlock the next module.
- **Final quiz:** available when all modules are complete.

Click a **lesson node** to open the lesson. Click a **quiz node** to start or resume a quiz.

### 3.3 Lesson blocks

Lessons open at `/journey/{courseId}/modules/{moduleIndex}/lessons/{lessonIndex}`.

Each lesson is a stream of **blocks**:

| Block type | What you do |
|------------|-------------|
| **Text** | Read content; use **Continue** to advance. Add personal **notes** per block. |
| **Swipe** | Swipe cards to categorise items. |
| **Reorder** | Drag items into the correct order. |
| **Fill blank** | Complete missing words. |
| **Bug hunter** | Find errors in code or text. |
| **Matching** | Match pairs. |
| **Chat simulation** | Interact with a scenario-based chat. |

- Complete interactions correctly to proceed; incorrect attempts may allow retry depending on block type.
- **Nexus** (AI chatbot) can help explain the current block — open the chat overlay.
- On lesson completion you earn **XP** and unlock the next lesson on the roadmap.

### 3.4 Module quizzes

- Path: from roadmap → **Module Quiz** node, or `/journey/quiz/{courseId}/modules/{moduleIndex}/quiz`
- Typically **10 questions** (9 objective + 1 subjective).
- Navigate with **Previous** / **Next**; answers auto-save.
- **Objective:** multiple choice, true/false, etc. — instant scoring.
- **Subjective:** type a written answer in the text area; **Gemini AI grades** your response (0–4 marks) with feedback when you submit.
- Leaving mid-quiz triggers a **warning dialog**.
- Score **> 50%** to pass and unlock the next module.
- Rewards (XP, etc.) may be **claimable from the roadmap** after completion.

### 3.5 Final course quiz

- Path: roadmap **Final Quiz** node, or `/journey/quiz/{courseId}/quiz`
- Mix of **objective** and **subjective** questions.
- Subjective answers are **AI-evaluated** on submit (same as module quizzes).
- Your **best score** is saved to course progress.
- **70%+** on the final quiz is required to **publish** a course to the community library (plus level and Nexon requirements).

### 3.6 Quiz history

View past attempts at `/journey/quiz/{courseId}/history`.

---

## 4. 1v1 challenges

Challenge a friend to a timed quiz duel on a shared course.

### 4.1 Add a friend

1. Go to **Sidebar → Social** (`/friends`).
2. **Search** tab: find users by nickname.
3. Send a friend request; they accept under the **Requests** tab.
4. Friends appear on the **Friends** tab.

### 4.2 Start a challenge

**From Social:**

1. Open a friend's profile or chat.
2. Use the **Challenge** (lightning) action.
3. Pick a **course** you both have access to (you must have unlocked the relevant quiz).

**From Journey Map:**

1. Open a course (`/journey/{courseId}`).
2. If you arrived via a friend link (`?friendId=...`), the challenge modal may open automatically.
3. Configure the challenge in the modal.

**Challenge settings:**

| Setting | Options |
|---------|---------|
| **Quiz** | Module quiz or Final quiz |
| **Mode** | **Classic** — async-style quiz with combo/timer options |
| | **Powered** — live 1v1; both players must be online |
| **Bet** | Optional Nexon wager (winner takes double) |
| **Expiry** | Challenge expires if not completed (e.g. 48 hours) |

4. Send the challenge. Your friend receives a **notification**.

### 4.3 Ready room (Powered mode)

When you open a challenge (`/challenges/{challengeId}/quiz`):

1. **Invitee** sees **Accept challenge** (locks in Nexon bet if any).
2. Both players click **Mark ready** in the **Live lobby**.
3. When both are ready, a **countdown** starts and the duel launches simultaneously.
4. **Classic mode** may allow starting without a live lobby (one player can begin when questions are ready).

Wait if you see **Preparing quiz questions** — question generation runs in the background.

### 4.4 During the duel

- **Objective questions only** in challenges (fair scoring).
- **Combo bar** tracks consecutive correct answers.
- **Powered mode — Power actions** (limited uses per player, shown as `Actions X/3`):

**Sabotage (vs opponent):**

| Action | Effect |
|--------|--------|
| False | Add 2 wrong options to opponent's question |
| Break | Reset opponent's combo streak |
| Harder | Swap opponent's question for a harder version |
| Distort | Blur opponent's screen for 10 seconds |

**Power-ups (for yourself):**

| Action | Effect |
|--------|--------|
| Halve | Remove half the wrong options on your question |
| Shield | Next wrong answer does not break your combo |
| Easier | Swap your question for an easier version |
| Switch | Swap combo streaks with opponent |

1. Tap an action button to select it.
2. Tap **Use** to fire it at the right moment during the quiz.
3. Submit answers question by question; leaving the tab may trigger a **tab-away warning** (auto-submit after grace period).

### 4.5 Results

- Performance score combines accuracy, speed, and combo.
- Winner receives XP and any Nexon wager.
- View results on the challenge results screen; rematch from Social or Journey.

---

## 5. Admin access

For examiners and project supervisors.

### 5.1 Becoming an admin

An existing admin or the developer runs:

```bash
npm run grant-admin examiner@example.com
```

Or sets `role: "admin"` on `users/{uid}` in Firestore, or adds the UID to `config/admins.userIds`.

**Sign out and sign back in** after being granted admin. New **Admin** links appear in the sidebar:

| Page | Path | Purpose |
|------|------|---------|
| Users | `/admin/users` | Manage accounts |
| Community Courses | `/admin/courses` | Moderate published courses |
| Keys | `/admin/keys` | View/test Gemini and Cloudflare API keys |

### 5.2 User management (`/admin/users`)

1. Sign in with an admin account.
2. Open **Admin → Users**.
3. **Search** by nickname, email, or UID.
4. Click a user to open their detail panel.

**You can:**

- Edit **XP**, **Nexon**, challenge wins/streak
- Edit **quest refresh tokens**, **style shards**, **free Nexus caches**
- Edit **weekly activity hours** (per day)
- View and edit **course progress** (module completion, quiz scores)
- **Grant / remove admin** role
- **Delete user** (destructive)
- **Impersonate user** (see below)

Click **Save** after editing fields.

### 5.3 Impersonate a user

1. On `/admin/users`, select a user.
2. Click **Impersonate** (mask icon).
3. You are signed in as that user and redirected to the Dashboard.
4. An **amber banner** at the top shows "Impersonating {nickname}" — all actions apply to their account.
5. Click **Exit impersonation** to restore your admin session and return to Admin Users.

Use impersonation to verify a student's journey, quiz state, or social features without their password.

### 5.4 Community courses (`/admin/courses`)

Review, feature, or remove courses published to the community library.

### 5.5 API keys (`/admin/keys`)

View configured Gemini and Cloudflare key pools (from Firestore `config/ai` or env fallbacks) and run connection tests.

---

## Quick reference — main routes

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/auth` | Sign in / Sign up |
| `/journey` | Course library |
| `/journey/{id}` | Journey Map |
| `/journey/{id}/modules/.../lessons/...` | Lesson |
| `/journey/quiz/{id}/quiz` | Final quiz |
| `/create-course` | Create / browse courses |
| `/friends` | Social |
| `/challenges/{id}/quiz` | Challenge / ready room |
| `/leaderboard` | Leaderboard |
| `/store` | Cosmetic store |
| `/profile` | Your profile |
| `/admin/users` | Admin user management |

---

## Getting help in-app

- **Nexus AI chatbot** — floating assistant; context-aware help on most pages.
- Suggested **chips** under the chatbot offer common questions for the current screen.
