# 07 — Design System

A slim, portfolio-grade design system for World Cup 2026 Predictor. It defines the tokens and the visual posture that Phase 1 wires into Tailwind and that every later UI phase consumes.

The product aesthetic is **a premium sports-analytics dashboard, in the visual tradition of data journalism**. It is calm, typographic, and confident. It is **not** a sportsbook — no neon greens-on-black, no flashing odds boards, no slot-machine motion, no aggressive gradients designed to provoke a tap.

If a design choice would feel at home on a bookmaker site, it does not belong here.

---

## 1. Aesthetic principles

1. **Data first, chrome second.** Numbers, probabilities, and trends are the heroes. Decoration recedes.
2. **Restrained colour.** A muted, near-monochrome surface set, lifted by two accents and used sparingly.
3. **Typographic hierarchy.** Size, weight, and tracking carry information before colour does.
4. **Quiet motion.** Transitions communicate state change. Nothing moves to entertain.
5. **Accessibility is non-negotiable.** Contrast, focus, and reduced-motion are tokens, not afterthoughts.
6. **No sportsbook visual language.** No money-coloured chips, no win/lose flash animations, no "hot streak" framing, no scoreboard-style LED imitations.

---

## 2. Colour tokens

All tokens are designed for a dark, navy-leaning surface set. Light-mode tokens are deferred to a later phase if needed.

| Token              | Hex       | Usage                                                              |
|--------------------|-----------|--------------------------------------------------------------------|
| `background`       | `#0B1020` | App background; the canvas behind everything                       |
| `surface`          | `#111827` | Cards, sheets, primary container surfaces                          |
| `surface-muted`    | `#1F2937` | Secondary surfaces, inputs, hovered rows                           |
| `border`           | `#334155` | Hairline dividers and component outlines                           |
| `text-primary`     | `#F8FAFC` | Headings, primary body text, key numbers                           |
| `text-secondary`   | `#CBD5E1` | Supporting copy, axis labels, metadata                             |
| `accent`           | `#38BDF8` | Primary accent — links, interactive emphasis, headline data marks  |
| `accent-secondary` | `#A78BFA` | Secondary accent — second data series, complementary highlights    |
| `success`          | `#22C55E` | Positive state — correct prediction, on-target metric              |
| `warning`          | `#F59E0B` | Cautionary state — model warning, low-confidence band              |
| `danger`           | `#EF4444` | Error and incorrect-prediction state                               |

Tokens are exposed as Tailwind theme extensions (`theme.extend.colors`) and as CSS variables on `:root` so non-Tailwind contexts (Recharts, SVG, raw `<style>`) can consume the same palette.

### Accent usage rules

- `accent` and `accent-secondary` are not used together within the same small surface (e.g. a match card) except to distinguish two data series.
- Saturated colours (`success`, `warning`, `danger`) are reserved for state communication. They are never used for decoration.
- No gradient backgrounds on interactive surfaces.

---

## 3. Typography

| Role          | Family                                    | Notes                                                       |
|---------------|-------------------------------------------|-------------------------------------------------------------|
| Display       | `Inter`, system sans-serif fallback       | Page headings, marquee numbers                              |
| Body          | `Inter`, system sans-serif fallback       | Default UI text                                             |
| Monospace     | `JetBrains Mono`, system mono fallback    | Scorelines, model version strings, tabular numerics         |

Fallback chain (in `tailwind.config`):

```
'sans': ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif']
'mono': ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
```

### Type scale

| Token | Pixel | Use                                          |
|-------|-------|----------------------------------------------|
| `xs`  | 12    | Metadata, axis labels                        |
| `sm`  | 14    | Secondary copy, table cells                  |
| `base`| 16    | Default body                                 |
| `lg`  | 18    | Card headings                                |
| `xl`  | 22    | Section headings                             |
| `2xl` | 28    | Page headings                                |
| `3xl` | 40    | Hero numbers (probabilities, scorelines)     |

Numeric tabular figures are enabled (`font-variant-numeric: tabular-nums`) wherever numbers are aligned in columns.

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

- **Default duration:** 150 ms for micro-interactions, 250 ms for layout transitions. Nothing slower in default operation.
- **Default easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` (a quick start, gentle settle).
- **What motion is for:** signalling state change (probability updated, status moved from pre-match to in-play), not delighting.
- **What motion is not for:** entrance animations on first render, parallax, bounce, sparkle, or any motion that loops idly.
- **Reduced motion.** Respect `prefers-reduced-motion: reduce` by disabling non-essential transitions entirely. The site must remain fully functional with motion off.

---

## 7. Accessibility commitments

- **WCAG 2.2 Level AA** is the floor.
- **Body-text contrast:** minimum 4.5:1 against its surface. Large text (≥18 px bold or ≥24 px regular) may use 3:1.
- **Non-text contrast:** focus rings, borders, and icons used for state must clear 3:1.
- **Focus styles** are always visible — a 2 px outline in `accent` with a `2 px` offset is the default. Focus is never suppressed by `outline: none` without an equivalent replacement.
- **Keyboard navigation** is exhaustive. Every interactive element is reachable and operable by keyboard alone, with logical tab order.
- **Semantic landmarks** (`<header>`, `<nav>`, `<main>`, `<footer>`) are present on every page.
- **Reduced-motion** is honoured per §6.
- **Reduced-transparency** and **forced-colors** (Windows High Contrast) are tested in Phase 8.
- **Live regions.** The countdown and live-status hydration use `aria-live="polite"` where appropriate, not `assertive` — this is analytical content, not an alert.

---

## 8. Component direction

These are the components Phase 6 will build. Listed here so their visual posture is decided once.

- **Match card** — surface `surface`, radius `lg`, padding `16`. Teams left-aligned, kickoff right-aligned. Probability row sits beneath the team row using the probability-bar component. Status chip top-right.
- **Probability bar** — a three-segment horizontal bar showing `pHome`, `pDraw`, `pAway`. Segment colours: `accent`, `text-secondary` (muted), `accent-secondary`. Each segment is labelled with its percentage rounded to the nearest integer. Numbers use the mono family with tabular figures.
- **Timeline chip** — a small pill (`sm` radius) carrying a `run_type` label (`T-3h`, `T-1h`, `T-0`, `HT`, `FT`) and the prediction timestamp. Chip background `surface-muted`, border `border`.
- **Scoreline table** — a compact table showing the top-N most likely scorelines and their probabilities. Mono numerics, `sm` body text, alternating row backgrounds using `surface` and `surface-muted`.
- **Confidence badge** — a three-band badge (low / medium / high). Colours: `warning` for low, `text-secondary` for medium, `success` for high. The badge never displays a raw probability — it shows the band only, per `docs/03_MODEL_SPEC.md` §9.
- **Factor breakdown** — Recharts visualisations consuming the engine's stored factor payload. Single accent per series; no rainbow palettes.

Components share spacing tokens, radius tokens, and the type scale. They never invent their own values.

---

## 9. Prohibited visual language

For the avoidance of doubt, the following are **not** part of this design system and must not appear in any UI surface:

- Bookmaker colour palettes (high-saturation green-on-black, hazard orange-on-black).
- LED-scoreboard imitations or arcade typography.
- "Hot streak," "value," "lock," or other gambling-coded badges.
- Flashing, pulsing, or looping animations on numbers.
- Money symbols (`$`, `£`, `€`) used for non-monetary data.
- Trade-dress imitations of FIFA, Panini, EA Sports, broadcasters, or sportsbooks — see `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 for the full list.
- Hero photography of players, managers, stadiums, or trophies sourced from agencies or broadcasters.

If a proposed component or visual treatment falls into any of the above, it is rejected and a compliant alternative is designed.
