# 11 — Screenshot and Demo Guide

How to capture, name, and present screenshots and demo recordings of the deployed UI for the README, the portfolio site, LinkedIn posts, and interview walkthroughs. Internal-facing; not deployed.

The point is to make the project legible in 5 seconds (recruiter scan), 30 seconds (LinkedIn skim), and 90 seconds (interview demo). Every recommendation below is in service of one of those windows.

---

## 1. Recommended screenshots — README hero set

Six screenshots is the right number. More than that and the README scrolls forever; fewer and there's no shape to the story.

| Order | Screenshot                              | What it shows                                                                                                               | Suggested file name              |
|-------|-----------------------------------------|------------------------------------------------------------------------------------------------------------------------------|----------------------------------|
| 1     | **Home hero + featured match**          | Masthead, hero copy, hero stats pills, the right-column "Next kickoff" Featured Match panel with foil treatment              | `screenshots/01-home-hero.png`   |
| 2     | **Match card grid**                     | Two-column grid of MatchCards under a day-group divider; status chips, kickoffs, probability bars, confidence badges, CTAs   | `screenshots/02-match-grid.png`  |
| 3     | **Match detail — header**               | Match-center header on warm cream — stage chip, teams in red/green, flanking placeholder flags, kickoff + venue line         | `screenshots/03-match-header.png`|
| 4     | **Probability breakdown**               | Headline-probabilities card — three-segment probability bar with team labels and confidence badge                            | `screenshots/04-probability.png` |
| 5     | **Top scorelines table**                | Scoreline table with alternating row backgrounds and accent-coloured goal numerals                                           | `screenshots/05-scorelines.png`  |
| 6     | **Prediction timeline + xG**            | Broadcast-strip timeline chips below the integrated expected-goals callouts                                                  | `screenshots/06-timeline-xg.png` |

Place all six in a top-level `screenshots/` directory in the repo (currently doesn't exist — create it the first time you capture). The README references the files by relative path so they render on GitHub.

### Optional extra captures

Useful for the portfolio site or a Twitter thread, less so for the README:

- **Foil hover state** — animated GIF of one MatchCard with the cursor moving across it, showing the tilt + radial highlight. Keep it under 3 MB.
- **Reduced-motion comparison** — two stills side by side: foil on / foil off. Demonstrates accessibility commitment.
- **Mobile** — same screens at 390 px width, showing the responsive stacking. One mobile shot is enough.

---

## 2. Browser / device settings

Use Chrome or Firefox. Use the warm-cream background of the deployed site — don't capture against macOS Sonoma's dark menu bar.

| Setting                  | Value                                                  | Why                                                                                          |
|--------------------------|--------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Window size              | **1440 × 900 logical (Retina 2880 × 1800)**            | Matches a 13" MacBook; gives the desktop two-column hero room without leaving giant margins  |
| Mobile capture           | **DevTools → 390 × 844 (iPhone 14)**                   | Reasonable phone width; the responsive grid kicks in cleanly here                            |
| Zoom                     | **100% logical zoom**                                  | DPI-independent; Retina output stays crisp                                                   |
| URL bar                  | **Cropped out**                                        | See §4 below — localhost in the address bar reads as "demo not deployed yet"                 |
| Browser chrome           | **Hidden** (use Chrome's "Capture full size screenshot" or `Cmd+Shift+P → Capture viewport`) | Prevents window-frame distraction; produces clean rectangular images |
| OS theme                 | **Light**                                              | The product is a warm-cream light theme; OS dark mode bleeds into transparent screenshots    |
| Background apps          | **None visible**                                       | No Slack notifications, no dock peek-through                                                 |

If you want a single command to capture every page at a consistent size, a small Playwright script works (`npx playwright screenshot --viewport-size=1440,900 http://localhost:3000/ screenshots/01-home-hero.png`). Not required.

---

## 3. File naming and dimensions

- **Format:** `.png` (lossless, crisp typography). Convert to `.webp` only if the README's first paint cost matters.
- **Dimensions:** capture at retina (2× the logical viewport) and let GitHub downscale. A 2880 × 1800 file renders sharp on hi-DPI displays.
- **Naming:** numbered prefix + kebab-case slug (`01-home-hero.png` → `06-timeline-xg.png`). Keeps the directory sorted in the order the README references them.
- **Alt text** in the README: descriptive, not "Screenshot of home page." Use something like `Global Football 2026 Predictor home — hero, featured match panel, day-grouped match cards`.

---

## 4. What NOT to capture

These rules apply equally to README screenshots, portfolio-site images, LinkedIn posts, and any interview walkthrough video.

- ❌ **Localhost in the URL bar.** Either crop the bar out, use Chrome's viewport-only capture, or set up a vercel preview deployment so the URL bar shows a real domain. Localhost reads as "demo not deployed."
- ❌ **Dev console errors.** Open DevTools and confirm the Console is clean before capturing. The current build has none; if HMR has been thrashing during development, restart the dev server first.
- ❌ **404 or "page not found" UI** unless it's specifically the screenshot you want.
- ❌ **Restricted tournament marks anywhere on screen.** The product UI scrubs them but if you happen to have a browser tab open titled `FIFA World Cup 2026`, crop it out. Don't capture other browser windows in the background.
- ❌ **Real federation crests, kits, broadcaster graphics, photographs, FUT/EA/Panini chrome.** None of these are in the product — but if a stale browser tab or open window happens to contain them, exclude them from frame.
- ❌ **Personal information.** Bookmarks bar, browser profile photo, system tray, identifiable wallpaper, identifiable tabs. Capture with a clean window.
- ❌ **Foil hover GIFs longer than 3 seconds.** Loops longer than that look like sticker packs.
- ❌ **Animated probability counts or sportsbook-style flash effects.** They're not in the product; don't simulate them for marketing.

---

## 5. README screenshot section — markdown template

Drop this near the top of `README.md`, after the disclaimer and before "What it does":

```markdown
## Screenshots

> Live demo: _coming soon — Vercel preview deployment._

![Home — hero and featured match](screenshots/01-home-hero.png)
*Home hero with the right-column "Next kickoff" featured match panel and the hero stats pills.*

![Match grid](screenshots/02-match-grid.png)
*Day-grouped match cards with the subtle gold foil treatment and "View match center" CTA.*

![Match detail — header](screenshots/03-match-header.png)
*Match-center header with status chip, oversized team names, kickoff, and venue.*

![Probability breakdown](screenshots/04-probability.png)
*Three-segment probability bar — team A in red, draw in muted, team B in green — with confidence badge and humanized model warnings.*

![Top scorelines](screenshots/05-scorelines.png)
*Top scorelines table with alternating warm rows and accent-coloured goal numerals.*

![Timeline and xG](screenshots/06-timeline-xg.png)
*Broadcast-style prediction timeline and integrated expected-goals callouts.*
```

Use the same set on the portfolio website if you have one — the file names stay consistent and the alt-text lines double as captions.

---

## 6. 60-second demo video script

Format: screen recording with voiceover. Keep total length under 60 seconds. Record in Chrome at 1440 × 900 with the URL bar visible (showing the Vercel preview domain, not localhost).

**0:00 – 0:08 — Home hero**
> "This is Global Football 2026 Predictor — an independent football probability dashboard for the 2026 international tournament. The featured match in the right column shows the next upcoming fixture with a foil-card treatment."

*Action: page loads; mouse hovers over the featured panel briefly to show the foil tilt.*

**0:08 – 0:18 — Match card grid**
> "Matches are grouped by day. Each card carries a status chip, a live countdown, the latest probability breakdown, a confidence band, and a link to the match center."

*Action: scroll slowly through the grid; hover one card to show the foil interaction.*

**0:18 – 0:32 — Match detail**
> "Clicking a card opens the match center. Headline probabilities for win / draw / win, expected goals per side, top scorelines from the Poisson matrix, and a broadcast-style prediction timeline showing T−3h, T−1h, kickoff, half-time, and full-time anchors."

*Action: click into a match; scroll past each panel.*

**0:32 – 0:42 — Architecture call-out**
> "Under the hood the engine is pure TypeScript — Elo ratings, Poisson scorelines, seeded Monte Carlo. Same input plus same seed produces byte-identical output. Components don't import any of that math; an ESLint boundary keeps the UI on the read side only."

*Action: cut to a quick split-screen of `src/lib/model/predict.ts` and `.eslintrc.json`.*

**0:42 – 0:52 — Append-only persistence**
> "Predictions are append-only. A SQL unique constraint plus a TypeScript interface with no update methods means scheduler retries are idempotent at both layers, and every match accumulates a complete prediction history."

*Action: cut to `supabase/migrations/0001_init.sql` highlighting the unique constraint.*

**0:52 – 0:60 — Closing**
> "Independent analytical project. Not affiliated with FIFA or any federation. Predictions are probabilistic estimates, not guarantees. Repo and live demo in the description."

*Action: return to home; fade out on the footer disclosure.*

Voiceover tips: deliver in 145–155 wpm, slow at the architecture call-out. If you're not confident about voice, run a clean captioned silent version with text overlays — works fine on LinkedIn autoplay.

---

## 7. 90-second interview walkthrough script

Format: live screen-share during the technical interview. Drives the conversation from UI → architecture → engineering decisions. Practice once before the interview so the timing feels natural.

**0:00 – 0:10 — Open the home page**
> "So this is the deployed UI for a portfolio project I built called Global Football 2026 Predictor. There's a featured-match panel here on the right, and the matches are grouped by day below."

*Action: scroll once through the home page.*

**0:10 – 0:25 — Click into a match**
> "Clicking a match opens the match center — headline probabilities, expected goals per side, top scorelines, and a broadcast-style prediction timeline showing the five lifecycle anchors. T−3h, T−1h, kickoff, half-time, full-time."

*Action: click into a fixture; cursor traces each panel.*

**0:25 – 0:45 — Pivot to architecture**
> "But what I actually want to walk through is the architecture, because that's the engineering decision I'd want to talk about. There are five layers and the rule is that each one talks only to its immediate neighbours."

*Action: open `docs/12_ARCHITECTURE_DIAGRAM.md` and screenshare it. Walk the layers from bottom to top in 20 seconds.*

**0:45 – 1:05 — Engine isolation**
> "The engine is fully isolated. It's pure TypeScript — no React, no I/O. Components don't import it. An ESLint rule blocks the imports, a runtime test scans every component file for them, and the contract — components only see DB row shapes — means there's nothing for a component to ask for. The pay-off is the deployed UI today runs against a server-only helper that runs the real engine at module load, and tomorrow it'll run against Supabase, and nothing in the components changes."

*Action: open `src/lib/model/predict.ts` and `src/components/MatchCard.tsx` side by side.*

**1:05 – 1:25 — Append-only**
> "Predictions are append-only. A SQL unique constraint on `(fixture_id, run_type, model_version, scheduled_for)` plus a TypeScript repository interface with no `update` methods means scheduler retries are idempotent at both layers. Every match accumulates a complete prediction history that I can compare across model-version bumps."

*Action: open `supabase/migrations/0001_init.sql` highlighting the unique constraint, then `src/lib/data/persistence/predictionRepository.ts` showing the interface.*

**1:25 – 1:30 — Hand off**
> "There's a lot more to talk about — the legal/IP perimeter, the test discipline — but I'll stop there. Where would you like to dig in?"

*Action: pause and let them steer.*

Important: stop talking at 1:30. The point is to demonstrate that you can explain a system tersely; rambling past 1:30 undermines that.

---

## 8. Demo deployment checklist

Before recording any demo or capturing any screenshot, run through this once:

- [ ] `pnpm typecheck`, `pnpm lint`, `CI=true pnpm test`, `pnpm build` all green.
- [ ] Dev server started fresh after any token / palette change (Tailwind caches can stale).
- [ ] Browser DevTools Console is clean — no errors, no warnings beyond the known Next.js dev banner.
- [ ] No other tabs visible in the captured viewport.
- [ ] URL bar shows the intended domain (Vercel preview ideally; cropped out if localhost).
- [ ] No system notifications during the recording window — turn on Do Not Disturb.
- [ ] Mouse is visible during the demo video and invisible (off-screen) during still-screenshot captures.
- [ ] Reduced-motion mode disabled for the "with motion" screenshots; enabled for the comparison shot.
- [ ] OS theme is light; system tray and dock cropped out or hidden.
- [ ] Footer disclaimer is visible in at least one screenshot per session.

---

## 9. Where to host the captures

- **README:** in-repo under `screenshots/`. GitHub serves them with the rendered markdown.
- **Portfolio site:** copy the same files; use the same alt-text as captions.
- **LinkedIn post:** drop the carousel; LinkedIn rescales but png at 1440 × 900 looks great after compression.
- **Interview screen-share:** show the live deployed site, not the screenshots. The screenshots are for asynchronous audiences.

When the live demo URL is available, replace the "_coming soon — Vercel preview deployment._" line in the README with the actual URL and add a short bullet pointing at the headline numbers (mock fixtures count, model version, last-run timestamp).
