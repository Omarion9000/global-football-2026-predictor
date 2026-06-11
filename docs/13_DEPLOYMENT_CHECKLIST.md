# 13 — Deployment Checklist

Walkthrough and checklist for deploying Global Football 2026 Predictor to a Vercel **preview** environment safely. Production deploys follow the same checks; "preview" is the recommended mode while the project ships in demo/mock data.

The deployed UI today runs against **mock fixtures and in-memory persistence**. Nothing in this checklist enables real sports-API integration, real Supabase reads, or real flag assets — those are gated behind future phases. Deploying now is safe because the demo's data flow is server-only and the legal/IP perimeter is enforced by code (`docs/04` §3.6) and tests.

---

## 1. Pre-deploy verification

Run from the repo root:

```bash
pnpm verify   # typecheck + lint + CI test + build, all in sequence
```

Expected: all four steps green. The `verify` script is exactly:

```
pnpm typecheck && pnpm lint && CI=true pnpm test && pnpm build
```

Both `verify` and the individual commands must pass before any deploy.

Spot-check the build output:

- Routes: `/`, `/_not-found`, `/api/cron/predictions`, `/matches/[fixtureId]`.
- `/` and `/_not-found` are prerendered static.
- `/matches/[fixtureId]` and `/api/cron/predictions` are dynamic.
- First-load JS shared by all routes ≈ 102 kB.

If any of those numbers move materially, investigate before deploying.

---

## 2. Required environment variables

| Variable                     | Required where                          | Purpose                                                                                 |
|------------------------------|-----------------------------------------|-----------------------------------------------------------------------------------------|
| `CRON_SECRET`                | Production deploys                      | Bearer token Vercel Cron presents on its scheduled calls to `/api/cron/predictions`     |
| `NODE_ENV`                   | Set automatically                        | Next.js sets this; do not override                                                       |
| `POSTGRES_URL`               | Optional (Phase 7C — current production path) | **Server-only.** Pooled Neon HTTP connection string created by the Vercel Marketplace Neon integration. Read by `src/lib/data/postgres/serverClient.ts`. Highest priority in the repository factory. |
| `POSTGRES_URL_NON_POOLING`   | Optional (migration scripts)            | **Server-only.** Direct (non-pooled) connection string used by `pnpm db:migrate:postgres`. Falls back to `POSTGRES_URL` if unset. |
| `SUPABASE_URL`               | Optional (Phase 7A — alternate backend) | **Server-only.** Read by `src/lib/data/supabase/serverClient.ts`. Used only when `POSTGRES_URL` is absent. |
| `SUPABASE_SERVICE_ROLE_KEY`  | Optional (Phase 7A — alternate backend) | **Server-only.** Bypasses Row-Level Security. NEVER prefixed with `NEXT_PUBLIC_`. NEVER imported by client components. |

Today the deployed public UI runs against a server-only demo-predictions helper, not a real database. Leaving every database variable unset is safe — the app continues to operate in demo/mock mode. The repository factory at `src/lib/data/persistence/repositoryFactory.ts` chooses an implementation in this order:

1. `POSTGRES_URL` set → **`PostgresPredictionRepository`** (Neon / Vercel Postgres — current production path).
2. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` both set → `SupabasePredictionRepository` (alternate backend).
3. neither → `InMemoryPredictionRepository` (demo mode).

The cron route does not call the factory yet (deferred to Phase 7D). To activate real Neon persistence in a future phase:

- Confirm `POSTGRES_URL` exists in the Vercel **Production** environment (the Neon Marketplace integration populates it automatically).
- Apply the migration once: `vercel env pull .env.local && pnpm db:migrate:postgres` (or paste the contents of `supabase/migrations/0001_init.sql` into the Neon SQL Editor).
- Then Phase 7D will swap the cron route's `new InMemoryPredictionRepository()` for `createPredictionRepository()`.

**Important security note for `SUPABASE_SERVICE_ROLE_KEY`:**

- Must be set in Vercel project settings under the **Production** (and optionally Preview) environment, never committed.
- Must not be prefixed with `NEXT_PUBLIC_`. The Vercel build would otherwise embed it in the client bundle.
- The `src/lib/data/supabase/serverClient.ts` module uses `import 'server-only'`, which causes a build-time error if that path is ever pulled into a client component. The ESLint UI-boundary rule and the runtime `ui-boundaries.test.ts` are additional backstops.

### What `CRON_SECRET` does

The route handler (`src/app/api/cron/predictions/route.ts`) reads `Authorization: Bearer ${CRON_SECRET}` and returns:

- **`401 unauthorized`** when the secret is missing or mismatched in production.
- **Allowed** (no auth check) when the secret is missing AND `NODE_ENV === 'development'` — purely for ergonomic local testing.
- **`500 internal_error`** (opaque) on any scheduler error — no stack traces, no Next.js debug output.

This means the deployed preview is **safe even if `CRON_SECRET` is not configured**: missing secret in production → every cron-route request gets a 401. The UI pages don't depend on the cron route, so the deployed demo continues to render either way.

### Setting `CRON_SECRET` on Vercel

Generate a random 32-byte hex string (do not commit it):

```bash
openssl rand -hex 32
```

Then add to the project on Vercel:

```bash
# requires vercel CLI installed and project linked
vercel env add CRON_SECRET production
# paste the value; production scope
vercel env add CRON_SECRET preview
# (optional) paste a different value for preview deployments
```

Vercel encrypts these at rest and exposes them as `process.env.CRON_SECRET` to the runtime. The local `.env.local` file (gitignored) holds the development value; `.env.example` shows the placeholder.

---

## 3. Cron route protection — confirm before deploy

Already verified by Phase 5 tests but worth eyeballing once before any deploy:

- [ ] `src/app/api/cron/predictions/route.ts` calls `isAuthorized(request)` before doing any work.
- [ ] Missing secret in production returns `{ error: 'unauthorized' }` with status 401.
- [ ] Wrong Bearer token returns `{ error: 'unauthorized' }` with status 401.
- [ ] Wrong scheme (e.g. `Token <secret>` instead of `Bearer <secret>`) returns 401.
- [ ] Internal errors caught by `try/catch` return `{ error: 'internal_error' }` with status 500 — never a stack trace.
- [ ] `vercel.json` declares the cron at `/api/cron/predictions` with the `*/5 * * * *` schedule.
- [ ] Cron writes are in-memory only today. Until a Supabase-backed `PredictionRepository` lands (Phase 7), cron runs produce a JSON summary but persist nothing across requests. **This is by design** and is not a deployment blocker.

---

## 4. Demo mode without credentials — what works, what doesn't

Without any environment variables set:

| Surface                                | Works without env?                                                       |
|----------------------------------------|--------------------------------------------------------------------------|
| `/` home page                          | ✅ Yes — demo predictions run at module load                              |
| `/matches/[fixtureId]` detail page     | ✅ Yes — same demo data source                                            |
| Footer disclaimer                      | ✅ Yes — static                                                          |
| WavingFlag placeholders                | ✅ Yes — inline geometric SVG, no asset paths                             |
| `/api/cron/predictions`                | ⚠️ 401 in production (missing `CRON_SECRET`); the UI does not depend on it |

This is the point of demo mode: the deployed preview is fully informative even when no secrets are configured. Configure `CRON_SECRET` only if you want to be able to manually hit the cron route (e.g., from `curl` with the Bearer header).

---

## 5. Vercel project setup

One-time, from a clean clone:

```bash
# install Vercel CLI if not present
npm i -g vercel@latest

# link the project (interactive — choose scope, project name, etc.)
vercel link

# add the cron secret (see §2)
vercel env add CRON_SECRET production
vercel env add CRON_SECRET preview

# first preview deploy
vercel
# follow the printed preview URL
```

Project settings to confirm in the Vercel UI:

- **Framework preset:** Next.js (auto-detected).
- **Build command:** `pnpm build` (auto from `package.json`).
- **Install command:** `pnpm install` (auto from `packageManager` field).
- **Output directory:** `.next` (default).
- **Node.js version:** 22.x (matches `.nvmrc` / `engines.node`).
- **Cron schedule:** loaded from `vercel.json`.

For ongoing work, `vercel` from the repo root produces a preview URL on the current branch; `vercel --prod` promotes to production when ready.

---

## 6. Post-deploy smoke checks

Open the preview URL in a browser and run through this list. All items must pass before you share the URL externally.

### 6.1 Functional

- [ ] Home page (`/`) loads, returns HTTP 200, no console errors.
- [ ] Masthead reads **"Global Football 2026 Predictor"** in the header and the hero `<h1>`.
- [ ] Featured "Next kickoff" panel is visible in the right column on desktop and stacks below on mobile.
- [ ] At least four match cards render in a day-grouped grid.
- [ ] Each card carries: status badge, kickoff countdown, kickoff string in `Sat, Jun 13 · 18:30 GMT` format, probability bar, confidence badge, and **"View match center →"** CTA.
- [ ] Clicking a card navigates to `/matches/{fixtureId}` (returns HTTP 200).
- [ ] Match-center page renders: header with stage chip + teams + kickoff + venue; headline probabilities + confidence + humanized warnings; expected-goals callouts; top-scorelines table; broadcast-style prediction timeline.
- [ ] An unknown id (`/matches/no-such-fixture`) returns the Next.js 404 page (not a stack trace).
- [ ] Footer renders the independence disclaimer + project sign-off + Model version pill on every page.

### 6.2 Cron route

- [ ] `GET /api/cron/predictions` (no auth) returns `{ error: 'unauthorized' }` with status 401 in production.
- [ ] `GET /api/cron/predictions` with `Authorization: Bearer <CRON_SECRET>` returns `{ modelVersion, due, succeeded, skipped, failed, warnings }` with status 200.
- [ ] Response does not contain any stack trace or internal error detail.

### 6.3 Accessibility

- [ ] Keyboard `Tab` reaches every interactive element on the home page (masthead link, schedule nav, each match card, each featured panel link).
- [ ] Focus rings are visible (the `accent-blue` 2 px outline from `globals.css`).
- [ ] Toggle Reduce Motion (macOS: System Settings → Accessibility → Display → Reduce Motion; Chrome DevTools: Rendering → Emulate CSS media `prefers-reduced-motion: reduce`). Foil tilt, cursor highlight, and flag-band sway should stop. Cards remain fully informative.
- [ ] Lighthouse a11y score on the home page is ≥ 95 (target from `docs/05` Phase 6 acceptance).

### 6.4 Responsive

- [ ] DevTools at 390 × 844 (iPhone 14): hero stacks (Featured panel falls below copy), match cards stack to single column, match-center header collapses, expected-goals callouts stack, footer stacks.
- [ ] DevTools at 1440 × 900 (default desktop): two-column hero, two-column match grid, two-column footer.

---

## 7. Screenshot checklist

Once the preview URL is live, capture screenshots per `docs/11_SCREENSHOT_AND_DEMO_GUIDE.md`. Quick-reference:

- [ ] Browser at 1440 × 900 logical (Retina capture).
- [ ] Chrome's "Capture full size screenshot" used (URL bar cropped).
- [ ] System tray, dock, and other tabs hidden.
- [ ] DevTools Console clean before each capture.
- [ ] OS theme set to light.
- [ ] Six README hero screenshots captured (`01-home-hero.png` through `06-timeline-xg.png`), placed in `screenshots/`.
- [ ] Each screenshot reviewed for the legal/IP perimeter (no FIFA/World Cup/Mundial visible; no foreign tabs in frame; no localhost in URL bar; no copyrighted artwork incidentally captured).
- [ ] README updated to reference the new files (Phase 6.2 left them as placeholders).
- [ ] At least one capture includes the visible footer disclaimer.

---

## 8. Legal / IP preflight — confirm before sharing the URL

The 234-test suite enforces most of this automatically, but a five-minute manual sweep is cheap insurance before public sharing.

### 8.1 Branding and metadata

- [ ] Browser tab title reads **"Global Football 2026 Predictor"** on every page.
- [ ] Page source `<title>` matches.
- [ ] `<meta property="og:title">` matches.
- [ ] `<meta property="og:description">` references "2026 international tournament" — not restricted competition marks.

### 8.2 Vocabulary

- [ ] No restricted tournament mark (`FIFA World Cup`, `World Cup`, `Mundial`, `Copa Mundial`, `Coupe du Monde`, etc.) appears in product UI, masthead, navigation, route names, or repeated chrome.
- [ ] Standalone `FIFA` appears only in the footer non-affiliation sentence.
- [ ] `sponsor` appears only in the footer non-affiliation sentence.
- [ ] Banned betting / sportsbook vocabulary (`odds`, `bet`, `wager`, `stake`, `bookmaker`, `value bet`, `official`, `licensed`) does not appear anywhere in product UI.

### 8.3 Independence disclaimer

- [ ] Footer disclaimer renders on every public page (home, match detail, 404).
- [ ] Disclaimer text covers: independence statement, non-affiliation with FIFA + federations + tournament organizers + broadcasters + sponsors, probabilistic-estimate clause.
- [ ] Disclaimer is not hidden behind a dropdown, modal, or off-screen on mobile.

### 8.4 Assets

- [ ] `WavingFlag` renders three abstract horizontal colour bands per team. No national symbology. No `<img>` tags.
- [ ] No federation crests, kits, broadcaster graphics, sponsor marks, agency photographs, trophy imagery, FUT/EA/Panini trade dress, or mascots anywhere on the deployed site.
- [ ] No real flag SVG files exist under `public/` (none were added).
- [ ] No screenshots captured to `screenshots/` contain any of the above.

If any item above fails, **do not share the URL.** Fix the regression, re-run `pnpm verify`, redeploy.

---

## 9. Rollback

Vercel preserves every deployment as immutable. Two-step rollback:

```bash
# list recent deployments
vercel ls

# promote a previous deployment to production
vercel rollback <deployment-url>
```

Or from the Vercel dashboard: Project → Deployments → click a previous deployment → "Promote to Production."

**No data migration concerns.** The deployed app uses mock fixtures and in-memory persistence — no production database, no schema state to roll back. The Supabase migration (`supabase/migrations/0001_init.sql`) has not been applied to any production database; rolling back the deployed app does not change any external state.

When Phase 7 introduces a real Supabase implementation, this section will gain a database-rollback subsection.

---

## 10. Known limitations of the current deploy

State these honestly in any README, demo recording, or interview walkthrough. They are deliberate phase boundaries, not bugs.

| Limitation                                                              | Why it is here                                                                |
|-------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| **Mock/demo data only.** 8 fictional teams, 4 group-stage fixtures.     | Real provider integration is gated on a documented `data_sources` row per `docs/04` §4.3. Deferred to Phase 7. |
| **No real sports-API integration.**                                     | Adapter interface (`FixtureSource`) and registry schema exist; the live implementation does not.              |
| **No real flag assets.**                                                | Real flags are gated on the asset registry in `docs/08` §5. Placeholder geometric colour bands ship today.    |
| **No Supabase production read wiring.**                                 | `PredictionRepository` interface exists with both an in-memory implementation (default) and a Supabase-backed implementation (Phase 7A). The UI still reads from the demo helper; swap-in happens in Phase 7B. |
| **Cron route writes are in-memory.**                                    | Each cron invocation produces a JSON summary but persists nothing across requests. The cron route does NOT yet call `createPredictionRepository()` — the factory exists but is unwired. Becomes durable in Phase 7B. |
| **Live match status (`HALF_TIME`, `FULL_TIME`) never triggers.**         | All mock fixtures ship in `SCHEDULED` status; the HT/FT status-gated paths in `getDuePredictionRuns` are exercised by tests but not by the deployed cron. |
| **No accuracy dashboard.**                                              | `accuracy_reviews` schema is in place. The `/accuracy` UI surface lands in Phase 8.                            |
| **No auth.**                                                            | The product is a public read-only demo. Auth is gated on a real persistence layer; not in scope.              |
| **No live scores.**                                                     | Out of scope for v1.                                                                                          |
| **No player cards.**                                                    | V2.1, gated on the flag asset registry plus an explicit approval round.                                       |

---

## 11. Pre-share final gate

Last sweep before sharing the preview URL on LinkedIn, a portfolio site, or any external surface:

- [ ] `pnpm verify` is green on the deployed commit (the same commit that produced the preview).
- [ ] Six smoke checks in §6 all pass on the preview URL.
- [ ] Five-minute IP preflight in §8 all passes on the preview URL.
- [ ] Screenshot capture per §7 is complete and committed.
- [ ] README's "Live demo" placeholder updated to the actual preview URL.
- [ ] README's "Screenshots" placeholder replaced with the captured image references.
- [ ] Commit message clearly notes the preview URL and the commit it was deployed from.

When all 7 boxes are checked, the URL is shareable.
