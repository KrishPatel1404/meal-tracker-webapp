# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Single-user, phone-first daily meal checklist. Vanilla JS + Vite, talks straight to Supabase (Postgres + Auth + Storage), hosted as a Render static site. `README.md` covers setup, the secret link and deploy.

## Commands

```sh
npm run dev                         # dev server (sign in via http://localhost:5173/#k=<OWNER_TOKEN>)
npm run build && npm run preview    # production build + serve
npm test                            # Vitest unit tests (tests/unit)
npx vitest run tests/unit/score.test.js          # one file
npx vitest run -t "3am"                          # by test name
TZ=Pacific/Auckland npx vitest run               # date logic must pass in other time zones too
npm run test:e2e                                 # Playwright, iPhone 13 (webkit) + Pixel 7 (chromium)
npx playwright test tests/e2e/today.spec.js --project="iPhone 13"
npm run lint && npx prettier --check .
```

Keep e2e runs light: one run before handing over at most. The owner tests manually.

## Environment

`.env` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OWNER_EMAIL` are baked into the bundle at build time. `OWNER_TOKEN` (the owner's password / secret link token) has no `VITE_` prefix on purpose and must never reach the bundle, logs or commits; it's only read by the e2e tests.

## Architecture

- **Auth = secret link.** `#k=<token>` in the URL hash → `data/auth.js` signs in with `OWNER_EMAIL` + token and strips the hash. supabase-js keeps the session. No session → `ui/link-screen.js` paste field (needed because installed iOS PWAs don't share storage with Safari). Sign-ups are blocked by a `before insert on auth.users` trigger in the migration.
- **Layers:** `data/*` is the only code that touches Supabase and throws typed errors (`AuthError`, `NetworkError`, `SaveError`, `LoadError` via `unwrap`/`toTypedError` in `data/errors.js`). `lib/*` is pure logic (dates, scoring, image compression). `ui/*` builds DOM with `h()` / `icon()` from `ui/dom.js`; views are `mountX(root, opts) -> unmount()` and `main.js` is a tiny in-memory router (today/day view vs history).
- **Logical day:** before `DAY_RESET_HOUR` (3am local) you're still on the previous day (`lib/day.js`). Dates are `YYYY-MM-DD` strings in local time; the day view schedules a timer to the next reset and re-checks on `visibilitychange`.
- **Plan snapshots:** `src/plan/meal-plan.js` is the meal plan; bump `PLAN_VERSION` when editing. `ensureDay` upserts the `days` row with `ignoreDuplicates`, so a day's `plan_snapshot` is written once and never overwritten. Everything that renders or scores a past day (score, history, export) must use that day's `plan_snapshot`, not `MEAL_PLAN`. Workout-only meals hidden on rest days keep their data and don't count.
- **Autosave (`ui/save-status.js`):** module singleton behind the header pill. Every UI write goes through `settleSave(promise, retry)`; failed typed writes keep their `retry` and are re-sent on the next write, the `online` event, and `flushPendingSaves()` (called on leaving a day / `pagehide`). Text fields use `debounceTextSave`; per-row ordering uses `createSaveQueue`. Retries re-send the latest values, so they're always safe to repeat.
- **Photos:** compressed client-side (`lib/image.js`, WebP with JPEG fallback for Safari), stored in the private `meal-photos` bucket at `<user_id>/<date>/<ownerKey>.<ext>` (ext from `blob.type`), read through batched, cached signed URLs.
- **Export:** `ui/export-sheet.js` lazy-imports `export/pdf.js` so jsPDF stays out of the main bundle. Keep it that way.
- **PWA:** `public/sw.js` is hand-written (no plugin): navigations served from the cached shell and refreshed in the background, hashed `/assets/*` cache-first, cross-origin (Supabase) never cached. Bump `CACHE_NAME` when changing its caching logic. Registered only in production (`src/pwa.js`).
- **Styles:** `src/styles/tokens.css` (primitive → semantic tokens, light/dark via `prefers-color-scheme` and `[data-theme]`, icons as SVG data-URI tokens), `components.css` lists every class in its header comment. Adherence-neutral copy: no red, no "missed"/"failed" wording.

## Database

Schema, RLS (owner-only on every table and the storage bucket) and the `ping()` keepalive RPC are in `supabase/migrations/0001_init.sql` (local only, gitignored). The project is live; inspect before changing and add a new migration file rather than editing `0001`.

## Tests touching the real database

Unit tests mock Supabase. E2E runs against the real project as the owner: `tests/e2e/support/fixtures.js` fakes the clock to `2001-03-07` and `owner-db.js` deletes all 2001 rows and photos before and after each test, with `workers: 1`. Any new test or manual script that writes data must also use 2001 dates and clean up.

## Accounts

Personal project: GitHub `KrishPatel1404/meal-tracker` (use `-R KrishPatel1404/meal-tracker` with `gh`), Render "KP Workspace". Never use any Decoded / work account, email or workspace. Don't push without the owner's go-ahead.
