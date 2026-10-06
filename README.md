<div align="center">

# 🍽️ Meal tracker

**A dead simple daily meal checklist for one person. Open it, tick the meals you ate, done. Everything autosaves.**

![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e?logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_Auth_·_Storage-3ecf8e?logo=supabase&logoColor=white)
![Render](https://img.shields.io/badge/hosted_on-Render-46e3b7?logo=render&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white)

[Features](#-features) · [Stack](#-stack) · [Setup](#-setup) · [Commands](#-commands) · [Meal plan](#-changing-the-meal-plan) · [Secret link](#-the-secret-link)

</div>

---

## ✨ Features

|                        |                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Today's plate**      | Tick meals, "Ate something else", notes, one photo per meal, extra food               |
| **Workout day toggle** | Adds Meal 3 and Meal 4 (their data stays if you switch it off)                        |
| **3am rollover**       | The day rolls over at 3am device time                                                 |
| **History**            | GitHub-style grid of the last 52 weeks, current streak, tap a square to edit that day |
| **Export**             | Coach-ready PDF (week grid + swaps) or spreadsheet CSV, via the share sheet           |
| **PWA**                | Installable, light and dark mode                                                      |

## 🧱 Stack

| Layer    | What                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend | Vanilla JS + [Vite](https://vite.dev), no framework                                                               |
| Backend  | [Supabase](https://supabase.com) for Postgres, Auth and Storage (private `meal-photos` bucket). No backend server |
| PDF      | [jsPDF](https://github.com/parallax/jsPDF), lazy loaded, only fetched when you export                             |
| Tests    | [Vitest](https://vitest.dev) for unit, [Playwright](https://playwright.dev) for e2e                               |
| Hosting  | [Render](https://render.com) static site                                                                          |

## 🚀 Setup

```sh
npm ci
cp .env.example .env
```

Fill in `.env`:

| Key                      | What it is                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase project URL                                                                                                   |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key. Public by design, RLS blocks everything without the owner session                     |
| `VITE_OWNER_EMAIL`       | Email of the single owner user                                                                                         |
| `OWNER_TOKEN`            | The secret link token (the owner's password). Not bundled into the app (no `VITE_` prefix), only used by the e2e tests |

> [!NOTE]
> The database schema (tables, RLS, storage bucket and policies, `ping()` RPC) lives locally in `supabase/migrations/0001_init.sql`. It's gitignored, so it's not in the repo.

## 🛠️ Commands

| Command            | What it does                                                |
| ------------------ | ----------------------------------------------------------- |
| `npm run dev`      | Dev server                                                  |
| `npm run build`    | Production build into `dist/`                               |
| `npm run preview`  | Serve the production build                                  |
| `npm test`         | Unit tests (Vitest)                                         |
| `npm run test:e2e` | Playwright e2e on iPhone 13 (WebKit) and Pixel 7 (Chromium) |
| `npm run lint`     | ESLint                                                      |
| `npm run format`   | Prettier                                                    |

First time running e2e, install the browsers with `npx playwright install webkit chromium`.

> [!IMPORTANT]
> The e2e tests run against the real Supabase project, signed in as the owner. They fake the clock to 2001 so everything they write lands in 2001, and they delete every 2001 day and photo before and after each test. Your real days are never touched. Tests run one at a time because they share that test year.

## 🥗 Changing the meal plan

Edit [`src/plan/meal-plan.js`](src/plan/meal-plan.js), then bump `PLAN_VERSION` (any new string, a date works well).

Each day stores a snapshot of the plan the first time you log something on it, so past days keep showing (and scoring) the plan they were logged against. Only new days pick up the change.

## 🔑 The secret link

There's no login screen. The app signs in with a link like:

```
https://<your-site>/#k=<token>
```

The token is the owner user's password. It sits in the URL hash so it never reaches server logs, and the app strips it from the address bar right after signing in. The session is then kept in the browser, so you only open the link once per device.

> [!TIP]
> On iPhone, the installed home screen app doesn't share storage with Safari, so it starts signed out. It shows a paste field: paste the whole link (or just the token) once inside the app and you're set.

<details>
<summary><b>Making a new link</b></summary>

<br>

Pick a new long random token, for example:

```sh
openssl rand -base64 48 | tr -d '/+=' | cut -c1-48
```

Then reset the owner password in the Supabase SQL editor:

```sql
update auth.users
set encrypted_password = extensions.crypt('<new token>', extensions.gen_salt('bf'))
where email = '<owner email>';
```

Your new link is `https://<your-site>/#k=<new token>`. Update `OWNER_TOKEN` in `.env` too.

Changing the password doesn't sign out devices that already have a session. To kick them out too, delete the owner's sessions (their refresh tokens go with them, and current access tokens run out within the hour):

```sql
delete from auth.sessions
where user_id = (select id from auth.users where email = '<owner email>');
```

Then open the new link on each device.

</details>

## 📁 Repo layout

```
src/
  main.js              # tiny in-memory router (today/day view vs history)
  config.js
  pwa.js               # registers the service worker (production only)
  data/                # the only code that talks to Supabase (auth, days, extras, photos)
  lib/                 # pure logic: logical day, scoring, image compression
  ui/                  # views and components built with h() / icon()
  export/              # CSV + PDF export (PDF lazy loaded)
  plan/meal-plan.js    # the meal plan, bump PLAN_VERSION when editing
  styles/              # tokens.css, base.css, components.css
public/
  sw.js                # hand-written service worker
  manifest.webmanifest # PWA manifest + icons
tests/
  unit/                # Vitest
  e2e/                 # Playwright, iPhone 13 + Pixel 7
.github/workflows/
  keepalive.yml        # pings Supabase every 3 days
render.yaml            # Render static site blueprint
```
