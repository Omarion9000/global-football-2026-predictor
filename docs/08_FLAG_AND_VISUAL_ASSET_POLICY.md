# 08 — Flag and Visual Asset Policy

This document governs the use of national flags and related decorative visual assets in the project. It complements `docs/04_DATA_AND_LEGAL_POLICY.md` — which categorically forbids federation crests, marks, broadcaster graphics, trade dress, and official tournament IP — by providing concrete handling for the narrower category of national flag glyphs and the optional "waving" decorative effect.

It is binding on every contributor and on every release of the product.

When this document conflicts with a request, the request loses. When this document is silent, default to the most conservative interpretation and surface the question for review.

---

## 1. Scope

This policy covers:

- Flag-shaped SVG renderings (national flags).
- Flag glyphs (e.g. unicode emoji flags).
- Country colour bands rendered as decorative chrome adjacent to a country name or code.
- Any visual treatment that combines or animates the above (e.g. a "waving" effect).

It does NOT cover, and never relaxes the prohibition on:

- Federation crests, national-team badges, club logos, or kit designs.
- Player, manager, or referee photographs from any source.
- Broadcaster graphics, lower-thirds, or branded match-clock overlays.
- Trophy imagery, mascots, or any official tournament IP.
- FIFA, confederation, federation, sponsor, or commercial-collectibles marks.

All categories in the "does not cover" list remain categorically prohibited per `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 and §3.6.

---

## 2. Permitted uses

National flags may be used in this product strictly as:

- **Decorative country identifiers** alongside a team's textual name and 3-letter code on match cards, match-detail headers, and the prediction timeline.
- **Informational accents** at small sizes (≤ 32 px tall) where the flag clarifies which team is being referenced.
- **Optional subtle "waving" decorative animation** within the constraints in §6.

The flag is never the primary carrier of identity. It always accompanies the country / team name and code, so readers without flag recognition (visually impaired, geographically unfamiliar, low-context, or rendering with images disabled) lose no information.

---

## 3. Prohibited uses

National flags are NOT used as:

- The app's logo, wordmark, masthead identity, or favicon.
- A sponsor mark, "presented by" element, or partnership indicator.
- A merchandise mark, downloadable sticker, or social-share asset.
- An official-looking badge that implies endorsement or affiliation with a federation, FIFA, or any official body.
- A large-format hero image or full-bleed background on landing pages.
- A celebratory animation tied to specific match outcomes (e.g. flashing a flag when a side "wins" — too close to fan-merchandise framing).
- A replacement for the country name in text copy (headlines must say "Brazil," not just render a flag glyph).

**Misleading or disrespectful modification of any national flag is prohibited under all conditions.** This includes recolouring beyond what the asset's licence permits, distorting beyond the §6 wave envelope, defacement, or any treatment that could be read as political commentary.

---

## 4. Asset sourcing and provenance

Preferred sources, in order:

1. **Internally authored simple SVGs.** Small, schematic, intentionally non-photographic representations created for the project. Lowest-risk and the default for Phase 6 placeholder geometric mock flags.
2. **Public-domain SVGs** with documented provenance — typically Wikimedia Commons entries marked PD-self, PD-flag, or equivalent country-specific public-domain declarations, with the source URL recorded in the registry.
3. **Open-licensed SVGs** under permissive licences (CC0, CC-BY, etc.) where attribution is rendered per the licence terms in the public footer.
4. **Statutory / government-released SVGs** if explicitly released by the issuing country for public use.

Sources NOT permitted:

- Commercial flag-icon libraries with usage or redistribution restrictions.
- Federation websites, broadcaster sites, or sponsor properties.
- Stock photography of physical flags.
- Any flag rendered as a photograph (cloth texture, stadium scene, parade footage) — only schematic SVGs.
- Anything obtained via scraping (per `docs/04` §5).

---

## 5. Flag asset registry

Every flag asset shipped with the product must have a row in the project's flag asset registry. The implementation may be:

- a JSON / TS module at `src/lib/data/flags/registry.ts` (preferred), or
- a `flags.json` manifest next to the SVGs under `public/flags/`.

The implementation choice is deferred to the phase that introduces real flags. The schema is binding from this point forward.

Each row records, at minimum:

| Field                  | Notes                                                                       |
|------------------------|-----------------------------------------------------------------------------|
| `country_code`         | ISO 3166-1 alpha-3, e.g. "BRA".                                              |
| `country_name`         | Display name used in UI copy.                                                |
| `source_url`           | Canonical URL the SVG was obtained from.                                     |
| `license`              | `public-domain` | `cc0` | `cc-by` | `internally-authored` | `statutory`.    |
| `attribution_required` | Boolean.                                                                     |
| `attribution_string`   | Verbatim attribution text rendered in the footer when required.              |
| `notes`                | Special handling — simplified geometry, coat-of-arms omitted, colour adjustments, statutory restrictions, etc. |
| `added_at`             | Date the asset was first added.                                              |
| `reviewed_at`          | Date the licence and provenance were last verified.                          |

A row must exist BEFORE the asset is rendered in any public surface. AI-assisted contributions add the row first, then the asset.

---

## 6. SVG wave animation policy

A "waving flag" effect is permitted as a subtle decorative treatment, subject to all of the following constraints:

- **Implementation.** SVG filter / `feDisplacementMap` driving a low-frequency sinusoidal displacement field, OR a low-amplitude SVG path / mesh deformation driven by CSS or a small JS routine. Either is acceptable.
- **Recognisability.** The flag's underlying geometry — colours, stripes, fields, coat-of-arms if present — must remain immediately recognisable at every frame.
- **Subtlety.** Maximum displacement is small. As a rough heuristic, no pixel travels more than ~5 % of the flag's width during the animation. Identifying elements are never warped into illegibility.
- **Pace.** Animation cycle length ≥ 3 seconds. No fast or aggressive motion. No looping animation that fires automatically on first render — prefer triggering on intersection-observer-in-viewport, on hover, or after a brief idle.
- **Reduced motion.** Wave animation MUST be disabled entirely under `prefers-reduced-motion: reduce`. The static flag remains rendered and fully informative.
- **Static fallback.** A static flag rendering is always available. Pages must work, look complete, and convey identical information without the wave. The wave is purely presentational.
- **Respect.** No animation may distort, occlude, mock, or "comment on" the flag. No tearing, burning, melting, falling, fading-out, or other state-implying transforms.
- **Scope.** The wave is applied only to approved flag assets in the §5 registry. It is never applied to user-uploaded content, third-party imagery, logos, badges, or any asset whose provenance is undocumented.

---

## 7. Special-case flags

Some national flags carry complex coats of arms, religious imagery, or statutory restrictions on reproduction in non-official contexts. Examples include but are not limited to:

- Flags with coats of arms (Mexico, Spain, Portugal, etc.).
- Flags incorporating religious calligraphy or imagery (Saudi Arabia, Iran, etc.).
- Flags whose use is governed by specific national statutes mandating exact colour values, aspect ratios, or restrictions on commercial use.

For these flags:

- A case-by-case provenance and lawful-use review is required before adding the asset to the registry.
- Simplified internally-authored SVGs that omit the contested element (e.g. coat-of-arms omitted, stripes-only) are acceptable provided the simplification is documented in the registry `notes`.
- The default disposition when any concern remains is **do not ship**; use a generic colour-band placeholder instead, accompanied by the country code and name.

---

## 8. Other visual assets

This document does not relax `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 or §3.6. Federation crests, national-team badges, club logos, official kits, broadcaster assets, trophy imagery, FIFA marks, sponsor marks, Panini / EA Sports / FUT trade dress, and official player photographs remain categorically prohibited, regardless of whether they appear alongside a flag.

The "waving" effect in §6 is permitted only on flag SVGs from the registry. It is not permitted on logos, crests, badges, photographs, or any non-flag asset.

---

## 9. Review and enforcement

Before each release tag:

- The flag asset registry is reviewed for completeness. Any flag rendered in the UI must trace to a registry row with a current `reviewed_at`.
- Any flag found in the codebase without a registry row is removed before release.
- Special-case flags from §7 are re-confirmed against their statutory or licence terms.

AI-assisted contributions that introduce a flag asset must:

1. Add the registry row first.
2. Document the source URL and licence verbatim.
3. Flag any §7 special-case concerns explicitly for human review.
4. Refuse to add the asset if provenance is unknown — proposing the simplified internally-authored alternative instead.

If a takedown request or licence dispute arises, the contested asset is removed before review.
