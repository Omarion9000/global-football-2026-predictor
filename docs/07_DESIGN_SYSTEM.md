# 07 — Design System

A slim, portfolio-grade design system for World Cup 2026 Predictor.

The product aesthetic is **a premium tournament fan experience** — emotional, colourful, energetic, and accessible. It draws from match centers, collectible albums, stadium atmosphere, national-team colour coding, and sports-editorial layouts.

It is **not** an AI lab, **not** neon cyberpunk, **not** a sportsbook, **not** a casino, and **not** a FIFA/Panini/EA clone. If a design choice would feel at home on a model-debugger dashboard, a bookmaker site, a Vegas slot floor, or an official tournament product, it does not belong here.

---

## 1. Aesthetic principles

1. **Tournament atmosphere first.** Warm cream surfaces, sun-baked golds, deep tournament reds and greens. The home page should feel like a print match-day programme, not a control panel.
2. **Collectible-feeling match cards.** Match cards are the hero surface — each one a small object the visitor wants to inspect, tilt, and return to. Subtle holographic/foil interaction is permitted (see §9) but never imitates Panini, EA FC / FUT, or any official collectible trade dress.
3. **National colour as identity.** Country codes, text labels, and abstract colour bands carry national identity without using federation crests, kits, or photographs. Flags are allowed only as decorative bands or unicode glyphs and only when legally safe (see §10 and `docs/04_DATA_AND_LEGAL_POLICY.md`).
4. **Probability data stays trustworthy.** Numbers, bars, and badges remain calm and legible. Excitement lives in the chrome around the data; never in the data itself.
5. **Excitement must not reduce readability.** Foil shimmers, tilt, and decorative gradients are sized so the underlying number, percentage, or scoreline is always the most legible thing on screen.
6. **No betting / no gambling / no streaming visual language.** No bookmaker greens-on-black, no money symbols on non-monetary data, no "hot streak" chips, no LED-scoreboard imitations, no overlay graphics borrowed from broadcasters.
7. **No official tournament trade dress.** No FIFA wordmark, trophy silhouette, confederation marks, federation crests, broadcaster graphics, or commercial-collectibles trade dress, ever. See §10 and `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1.
8. **Accessibility is non-negotiable.** Contrast, focus, keyboard, and reduced-motion are tokens, not afterthoughts. All decorative motion has a still-frame equivalent.

---

## 2. Colour tokens

Warm tournament palette. All hex values pinned by `MODEL_VERSION`-style discipline — bumping a token requires an explicit token-set bump and is reflected in `tailwind.config.ts` plus CSS variables on `:root`.

| Token              | Hex       | Usage                                                                                |
|--------------------|-----------|--------------------------------------------------------------------------------------|
| `background`       | `#F7F3EA` | App canvas — warm cream, evokes a printed programme                                  |
| `surface`          | `#FFFFFF` | Primary card / container surface                                                     |
| `surface-muted`    | `#FFF8E7` | Secondary surfaces, hovered rows, callouts                                           |
| `surface-strong`   | `#F2E6C9` | Card backplates, foil substrate, accented panels                                     |
| `border`           | `#E7DCC8` | Hairline dividers and component outlines                                             |
| `text-primary`     | `#1C1917` | Headings, body, key numbers (warm near-black for editorial feel)                     |
| `text-secondary`   | `#78716C` | Supporting copy, axis labels, metadata                                               |
| `accent-gold`      | `#D6A84F` | Headline tournament accent — trophies, premium chrome, hero numbers                  |
| `accent-red`       | `#C2410C` | Primary data accent (e.g. team A in a 1v1), warmth highlights                        |
| `accent-green`     | `#166534` | Secondary data accent (e.g. team B), tournament greens                               |
| `accent-blue`      | `#2563EB` | Tertiary accent / link state / draws                                                 |
| `success`          | `#15803D` | Positive state — correct prediction, on-target metric, high confidence               |
| `warning`          | `#D97706` | Cautionary state — model warning, low-confidence band                                |
| `danger`           | `#DC2626` | Error and incorrect-prediction state                                                 |

### Accent usage rules

- **Probability segments.** Use `accent-red` for team A, `text-secondary` (muted) for draw, `accent-green` for team B. This is the canonical default; specific matches may use national colour coding when both teams have safe identifiers and the contrast still clears WCAG AA.
- **Hero numerics.** `accent-gold` is reserved for headline tournament chrome (e.g. the marquee probability on a match card, a winning-bracket call-out). It is never used for ordinary copy or for state communication.
- **State colours are state-only.** `success`, `warning`, `danger` are reserved for state communication. They are never used decoratively.
- **No raw rainbow.** Multiple accents in one card require a clear semantic reason (two data series, side identity). Three or more accents in the same surface need explicit approval.
- **No gradient backgrounds on interactive surfaces** other than the controlled foil interaction in §9.

### Theme exposure

Tokens are exposed both as Tailwind theme extensions (`theme.extend.colors`) and as CSS custom properties on `:root` so Recharts, raw SVG, and any non-Tailwind context can consume the same source of truth.

---

## 3. Typography

| Role          | Family                                    | Notes                                                                  |
|---------------|-------------------------------------------|------------------------------------------------------------------------|
| Display       | `Inter`, system sans-serif fallback       | Page headings, marquee numbers, country code labels                    |
| Body          | `Inter`, system sans-serif fallback       | Default UI text                                                        |
| Monospace     | `JetBrains Mono`, system mono fallback    | Scorelines, percentages, model version strings, tabular numerics       |

Fallback chain (in `tailwind.config`):

```
'sans': ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif']
'mono': ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
```

Hierarchy is built through **weight, tracking, and size** — not by introducing a third decorative family. The goal is a confident editorial-sports feel.

### Type scale

| Token | Pixel | Use                                          |
|-------|-------|----------------------------------------------|
| `xs`  | 12    | Metadata, axis labels, run-type chips        |
| `sm`  | 14    | Secondary copy, table cells                  |
| `base`| 16    | Default body                                 |
| `lg`  | 18    | Card headings                                |
| `xl`  | 22    | Section headings                             |
| `2xl` | 28    | Page headings                                |
| `3xl` | 40    | Hero numbers (probabilities, scorelines)     |

Tabular figures (`font-variant-numeric: tabular-nums`) are enabled wherever numbers align in columns or change in place (countdowns, probability bars).

### Weight ladder

- `font-normal` (400) — body copy
- `font-medium` (500) — card metadata, status chips
- `font-semibold` (600) — section headings, card team names
- `font-bold` (700) — hero numerics

Bold + slightly tightened tracking on hero numerics creates the "condensed editorial" feel without shipping a condensed font.

---

## 4. Spacing scale

A single linear scale used for padding, margins, and gaps:

`4, 8, 12, 16, 24, 32, 48, 64` (px)

Tailwind utility correspondence: `1, 2, 3, 4, 6, 8, 12, 16`.

Layout grids use multiples of `8`. Component-internal padding uses multiples of `4`.

---

## 5. Border radius

| Token | Pixel | Use                                                  |
|-------|-------|------------------------------------------------------|
| `sm`  | 6     | Inputs, small badges, chips                          |
| `md`  | 12    | Buttons, secondary cards                             |
| `lg`  | 20    | Match cards, primary surfaces                        |
| `xl`  | 28    | Hero containers, modal sheets                        |

No fully-rounded ("pill") shapes on interactive surfaces unless explicitly justified (e.g. a status chip).

---

## 6. Motion

Motion is communicative and tournament-warm: gentle inertia rather than slick efficiency, but never bouncy or sticker-pack.

- **Default duration:** 150 ms for micro-interactions, 250 ms for layout transitions, **up to 400 ms** for card foil/tilt settle.
- **Default easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` (a quick start, gentle settle).
- **What motion is for:** signalling state change (probability updated, status moved from pre-match to in-play), inviting collectible-like inspection on match cards, and a single subtle live-tick on the countdown.
- **What motion is not for:** entrance animations on first render, parallax of decorative backgrounds, looping shimmer that never settles, sparkle storms, or any motion that loops idly when the user isn't interacting.
- **Reduced motion.** Respect `prefers-reduced-motion: reduce` by disabling tilt, foil, shimmer, and any non-essential transition entirely. The site must remain fully functional and visually complete with motion off — see §9 for the still-frame requirements.

---

## 7. Accessibility commitments

- **WCAG 2.2 Level AA** is the floor.
- **Body-text contrast:** minimum 4.5:1 against its surface. Large text (≥18 px bold or ≥24 px regular) may use 3:1.
- **Non-text contrast:** focus rings, borders, and icons used to convey state must clear 3:1.
- **Focus styles** are always visible — a 2 px outline in `accent-blue` with a 2 px offset is the default for interactive elements on cream surfaces. Focus is never suppressed by `outline: none` without an equivalent replacement.
- **Keyboard navigation** is exhaustive. Every interactive element is reachable and operable by keyboard alone, with a logical tab order.
- **Semantic landmarks** (`<header>`, `<nav>`, `<main>`, `<footer>`) are present on every page.
- **Reduced motion** is honoured per §6 and §9.
- **Reduced transparency** and **forced colours** (Windows High Contrast) are tested in Phase 8.
- **Live regions.** The countdown and live-status hydration use `aria-live="polite"`, not `assertive` — this is analytical content, not an alert.
- **Holographic/tilt effects MUST have a still-frame equivalent.** Match cards must convey identical data — teams, probabilities, confidence, kickoff — with no hover, no pointer, no motion. Tilt and foil only enhance; they never carry information.

---

## 8. Component direction

These are the components Phase 6 will build. Their visual posture is decided here so each implementation isn't re-litigated.

- **Home — tournament dashboard.** Matches grouped by day under a date header. Each day is a small editorial section with the date in display weight and a tight grid of match cards beneath. Header carries a wordmark and a thin metadata band (model version, last-run time). Footer carries the independence and probabilistic-estimate disclosures.

- **Match card (the collectible).** Teams, country codes, kickoff time, countdown, latest-prediction probability bar, confidence badge, prediction timestamp. Optional foil interaction per §9. Card uses `surface` on `background`, `lg` radius, a soft `surface-strong` accent strip on the leading edge, and a subtle drop-shadow that lifts on hover. Country identity is conveyed by an abstract colour band per side (drawn from the project's safe palette), the 3-letter code, and the team name — never by a federation crest.

- **Match detail — match center.** Top-of-page header with status chip, stage, group code, kickoff and venue. Below that, three editorial blocks: (1) headline probabilities + confidence + warnings, (2) top scorelines table, (3) prediction timeline. An "expected goals" callout sits at the bottom with the two side-by-side hero numerics. Aesthetic reads as a broadcast match-center page, not a dashboard.

- **Prediction timeline — broadcast strip.** Five chips in a row: `T−3h`, `T−1h`, `Kickoff`, `HT`, `FT`. Available chips are filled `surface-strong` with `text-primary`; pending chips are outlined in `border` with `text-secondary`. The current chip carries a subtle `accent-gold` underline. Reads like a TV broadcast progress bar, not a model debugger.

- **Probability bars.** Three-segment horizontal bar at 8 px tall. Segment colours per §2 accent usage rules. Each segment is labelled below the bar with its percentage rounded to the nearest integer in mono with tabular figures. The bar is purely informational — no animated fills on initial load, no sportsbook tally-counter effect, no win-flash on the leading side.

- **Confidence badge — three-band chip.** `LOW` / `MEDIUM` / `HIGH` rendered as a small pill (`sm` radius) with explanatory copy: "Confidence: Low / Medium / High". Colours: `warning` for LOW, `text-secondary` on `surface-muted` for MEDIUM, `success` for HIGH. The badge never displays a raw probability — only the band — per `docs/03_MODEL_SPEC.md` §9.

- **Status badge.** Scheduled / Pre-match / Live / Half-time / Full-time / Postponed / Cancelled. Each renders as a small pill with a state-appropriate colour from §2. Live is `success`, half-time and postponed are `warning`, cancelled is `danger`, others are neutral.

- **Countdown.** Mono tabular figures, smallest readable size by default, rises in prominence as kickoff approaches (≤1h, larger weight; ≤10m, `accent-gold` foreground). One ticking digit per second; pause when the tab is hidden.

- **Empty state.** Cream surface with editorial copy. No illustrations of footballs, trophies, or stadiums (avoids accidentally edging toward official trade dress). Just typography and breathing room.

- **Disclosure / footer.** Independence statement + probabilistic-estimate statement, set in `text-secondary` at `xs`. Always present, never dismissable.

Components share the spacing, radius, and typography tokens above. They never invent their own values.

---

## 9. Match card — holographic / foil interaction

Match cards may carry a custom holographic / foil interaction. **This is an original visual treatment** invented for this project. It is not derivative of Panini, EA FC / FUT, official tournament collectibles, or any sportsbook surface.

### Interaction behaviour

- **3D tilt.** On pointer movement over the card, tilt the card up to ±6° on each axis. Use CSS `transform: perspective(800px) rotateX(...) rotateY(...)`. Tilt settles on pointer leave with a soft 400 ms ease-out.
- **Radial highlight.** A soft radial gradient follows the cursor as a thin overlay. Highlight is `accent-gold` at 10–15 % opacity at the centre, fading to transparent over ~40 % of the card width.
- **Metallic border.** A subtle conic-gradient border in `accent-gold` → `surface-strong` → `accent-gold` (sub-pixel rotation locked in CSS so the card doesn't look like an animated GIF). Border thickness: 1 px.
- **Layered paper / card texture.** A very low-opacity noise/grain layer on `surface-strong` gives the card a printed-paper feel. Static, never animated.
- **Restrained shimmer.** A single sweeping highlight crosses the card once per hover-enter, lasting ~600 ms, never looping. No idle shimmer.

### Internal vs public naming

- **Internally** (in code, design notes, internal docs) the treatment may be called the "holographic match card" or the "foil prediction card."
- **Publicly** (in UI copy, marketing surfaces, page metadata, social previews) the surface is simply called a **Match Card** or, on the detail page, a **Prediction**. The product never advertises holographic / foil aesthetics in copy, to keep distance from collectible-trading trade dress.

### Hard constraints

- **No Panini frames.** No corner cutoffs, no sticker-album geometry, no hexagonal "shiny" panels.
- **No EA FC / FUT card frames.** No diagonal rating-chemistry treatments, no stat blocks reminiscent of FUT chemistry styles.
- **No FIFA tournament chrome.** No trophy silhouette, no confederation marks, no official mascot art.
- **No broadcaster lower-third graphics.**
- **No player photographs.** Player likenesses are V2+ and explicitly out of scope for Phase 6 (see `docs/04_DATA_AND_LEGAL_POLICY.md` §3.3).
- **Still-frame equivalent.** With reduced-motion or no pointer, the card carries all of its information statically — same probabilities, same confidence, same teams, same kickoff. Tilt / foil / shimmer enhance only.

### Performance budget

- Tilt and highlight effects must run at ≥ 55 fps on a mid-range laptop. If not, drop to a simpler hover-lift only.
- `will-change` is scoped tightly to the tilt subtree; never applied to the whole card.

---

## 10. Prohibited visual language

For the avoidance of doubt, the following are **not** part of this design system and must not appear in any UI surface:

- **Bookmaker palettes** (high-saturation green-on-black, hazard orange-on-black) and any sportsbook visual cues.
- **Gambling-coded badges** ("hot streak," "value," "lock," "edge," "sure thing," fractional/decimal/American odds in chip form).
- **LED-scoreboard imitations** or arcade typography.
- **AI / model-debugger aesthetic** (terminal panels, monospace-everything, dataset-row chrome). Mono is reserved for numerics, not whole surfaces.
- **Neon cyberpunk** (saturated cyan/magenta on black, glow halos, animated grid backgrounds).
- **Flashing, pulsing, or looping animations** on numbers.
- **Money symbols** (`$`, `£`, `€`) used for non-monetary data.
- **Trade-dress imitations** of FIFA, UEFA / CONMEBOL / other confederations, federations, clubs, broadcasters, Panini, EA Sports — see `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 for the full prohibited list.
- **Official tournament chrome** — no trophy silhouette, mascot artwork, slogans, posters, or emblem-shaped containers.
- **Hero photography** of players, managers, stadiums, or trophies sourced from agencies or broadcasters.
- **National flags rendered as official federation emblems.** Country identity may be conveyed by code, name, and abstract colour bands; if a flag glyph is used, it is the unicode emoji glyph or a public-domain SVG with documented provenance, and it is treated as decoration — not authority.

If a proposed component or visual treatment falls into any of the above, it is rejected and a compliant alternative is designed.

---

## 11. SVG flag wave animation

The product may apply a subtle waving animation to approved flag assets in the asset registry per `docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md` §6. This section pins the design-system view of the effect; the legal / provenance / asset-registry discipline lives in `docs/08`. Both documents apply.

### 11.1 Implementation

An SVG filter using `feDisplacementMap` driving a low-frequency sinusoidal displacement field, **or** a low-amplitude SVG path / mesh deformation animated via CSS or a small JS routine. Either is acceptable. The flag's underlying geometry — colours, stripes, fields, coat-of-arms if present — must remain immediately recognisable at every frame.

### 11.2 Motion characteristics

- **Subtlety.** Displacement amplitude held small. As a heuristic, no pixel should travel more than ~5 % of the flag's width during animation. Identifying elements are never warped into illegibility.
- **Pace.** Cycle length ≥ 3 s. Slow enough to read as ambient atmosphere rather than active animation.
- **No idle looping.** The effect does not loop indefinitely from first render. Prefer triggering on intersection-observer-in-viewport, on hover, or after a brief idle, and pausing when off-screen.
- **No commentary motion.** No tearing, fading, burning, falling, melting, or other dramatic state-implying transforms. No politically- or emotionally-loaded easing.

### 11.3 Reduced motion and static fallback

- **Reduced motion.** Wave animation MUST be disabled entirely under `prefers-reduced-motion: reduce`. The static flag remains rendered and fully informative.
- **Static fallback required.** Every page using waving flags must work and look complete with the wave disabled. The wave conveys atmosphere only; it never carries information.

### 11.4 IP boundary

This effect is permitted **only** on flag assets in the registry (`docs/08` §5). It is **not** permitted on:

- Official federation crests or any prohibited mark from `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 or §3.6 — including the FIFA / tournament marks restricted under the §3.6 hardening.
- Logos, badges, kits, broadcaster graphics, sponsor marks, or photographs.
- The match-card holographic / foil treatment from §9. The two effects are separate; they are not combined on the same surface.

### 11.5 Respect

No animation may distort, occlude, mock, or "comment on" a flag. Effects that imply defacement, political commentary, celebration of a specific outcome, or mockery are categorically prohibited. The wave is gentle, decorative, atmospheric — nothing more.
