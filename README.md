# Meal tracker

A dead simple daily meal checklist for one person. Open it, tick the meals you ate, done. Everything autosaves.

- Today's plate: tick meals, "Ate something else", notes, one photo per meal, extra food
- Workout day toggle adds Meal 3 and Meal 4 (their data stays if you switch it off)
- The day rolls over at 3am device time
- History: a GitHub-style grid of the last 52 weeks, current streak, tap a square to edit that day
- Export to CSV or PDF (goes through the phone's share sheet when it can)
- Installable as a PWA, light and dark mode

## Stack

- Vanilla JS + [Vite](https://vite.dev), no framework
- [Supabase](https://supabase.com) for Postgres, Auth and Storage (private `meal-photos` bucket). No backend server
- jsPDF for the PDF export (lazy loaded, only fetched when you export)
- Vitest for unit tests, Playwright for e2e
- Hosted as a Render static site

## Setup

Needs Node 20.12+ (the e2e config uses `process.loadEnvFile`).

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

The database schema is in `supabase/migrations/0001_init.sql` (tables, RLS, storage bucket and policies, `ping()` RPC).

## Commands

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

The e2e tests run against the real Supabase project, signed in as the owner. They fake the clock to 2001 so everything they write lands in 2001, and they delete every 2001 day and photo before and after each test. Your real days are never touched. Tests run one at a time because they share that test year.

## Changing the meal plan

Edit `src/plan/meal-plan.js`, then bump `PLAN_VERSION` (any new string, a date works well).

Each day stores a snapshot of the plan the first time you log something on it, so past days keep showing (and scoring) the plan they were logged against. Only new days pick up the change.

## The secret link

There's no login screen. The app signs in with a link like:

```
https://<your-site>/#k=<token>
```

The token is the owner user's password. It sits in the URL hash so it never reaches server logs, and the app strips it from the address bar right after signing in. The session is then kept in the browser, so you only open the link once per device.

On iPhone, the installed home screen app doesn't share storage with Safari, so it starts signed out. It shows a paste field: paste the whole link (or just the token) once inside the app and you're set.

### Making a new link

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

## Deploy

### Render

`render.yaml` is a Render blueprint for a static site: it runs `npm ci && npm run build`, publishes `dist/`, sets cache headers (hashed assets cached forever, `index.html`, `sw.js` and the manifest always revalidated) and rewrites every path to `index.html`.

1. In Render, create a new Blueprint from this repo
2. Set the three env vars it asks for: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OWNER_EMAIL` (they're baked in at build time, so redeploy after changing them)

### Supabase keepalive

Free Supabase projects pause after a week with no activity. `.github/workflows/keepalive.yml` calls the `ping()` RPC every 3 days to cover holidays. Add these repo secrets in GitHub (Settings > Secrets and variables > Actions):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

You can run it by hand from the Actions tab (`workflow_dispatch`) to check it works.
