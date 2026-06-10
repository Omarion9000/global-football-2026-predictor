# 04 — Data and Legal Policy

This document defines what World Cup 2026 Predictor may and may not do with data, imagery, marks, broadcasts, and external services. It is binding on every contributor — human or AI — and on every release of the project, including the public demo.

The policy is intentionally strict because the project is a public-facing portfolio piece. Reputational, legal, and licensing risk are all minimised by refusing borderline material rather than relying on case-by-case judgement.

When this document conflicts with a request, the request loses. When this document is silent, default to the most conservative interpretation and surface the question for review.

---

## 1. Project positioning

1. World Cup 2026 Predictor is a **sports analytics and educational portfolio project**.
2. It is **not a betting product, gambling product, wagering product, sportsbook, or odds product**. It is not affiliated with any of those categories and does not aspire to be.
3. **Language discipline.** All user-facing copy uses the word "probability." The words and phrases below are prohibited in **product UI, page metadata (titles, descriptions, OpenGraph, JSON-LD), marketing copy, tooltips, error messages, chart labels, and any other public-facing feature copy**:
   - "odds" (fractional, decimal, American, or otherwise)
   - "stake," "wager," "bet," "punt," "lay," "back"
   - "value bet," "edge," "sure thing," "lock"
   - "bookmaker," "sportsbook," "house," "vig," "juice"
   - "payout," "winnings," "returns"

   **Disclosure carve-out.** These same words may appear in policy documents, legal disclosures, internal documentation, the README's "what this is not" / non-goals sections, and other contexts where they are used *only* to declare what the product is not. The carve-out is narrow: it does not weaken the no-betting rule and does not permit any of these words to appear in a product surface that a user interacts with. When in doubt, rewrite to avoid the word.
4. **No comparative odds.** The product never displays, ingests, or links to bookmaker odds for comparison, "model vs market" framing, or any other purpose.
5. **No financial framing.** No money symbols, ROI charts, P&L curves, or "if you'd followed the model" historical-return narratives.
6. **Independence statement.** Every public page carries a clear note that the product is independent and not affiliated with FIFA, any confederation, any federation, or any broadcaster.

If a contributor or AI agent is asked to add any of the disallowed elements, the request is refused, the rule above is cited, and a compliant alternative is offered (e.g. "expressed as a probability percentage" instead of "odds").

---

## 2. Streams and broadcasts

1. **No embedded unauthorised streams.** The product does not embed `<iframe>`, `<video>`, or HLS/DASH manifests pointing at content the project does not have a redistribution licence for.
2. **No scraping or redistribution of broadcast video.** Including: clip recordings, highlight reels, GIF extractions, frame grabs, audio rips, and transcripts of commentary.
3. **No linking to illegal stream-locator sites.** Including aggregators, "live football TV" mirror sites, and Telegram / Discord channels known to host pirated streams. Even one-off links in documentation, blog posts, or social cards are prohibited.
4. **No bypass instructions.** The product never explains, encourages, or links to methods for bypassing paywalls, geo-restrictions, VPN-based access to restricted broadcasts, account sharing of licensed services, or DRM circumvention.
5. **"Where to watch" is out of scope for v1.** If a future version implements a "where to watch" feature, it must be:
   - Limited to official broadcaster homepages (the broadcaster's own primary domain, not a deep link to a video player).
   - Limited to official FIFA / FIFA+ pages where their terms permit linking.
   - Reviewed against this policy and the broadcaster's terms before implementation.
6. **No clip embeds from social platforms** even when technically permissible, in v1. The visual identity of the product is data-journalism; embedded video isn't part of it.
7. **Streaming links of any kind are out of v1 and require legal review before any future implementation.** This is recorded in `docs/05_BUILD_ROADMAP.md` as a permanent out-of-scope item.

---

## 3. Brand and intellectual-property restrictions

### 3.1 Marks and visual identity (prohibited)

The product does not copy, reproduce, or imitate any of the following without an explicit written licence:

- FIFA wordmark, FIFA emblem, FIFA World Cup wordmark and trophy silhouette, FIFA+ marks, mascot artwork, slogans, posters, and official tournament identity.
- Confederation marks: UEFA, CONMEBOL, CAF, AFC, CONCACAF, OFC, and their tournament identities.
- National federation crests, federation typography, and federation kit designs.
- Club crests and club kit designs.
- Broadcaster marks (BBC Sport, ESPN, Sky Sports, Fox Sports, beIN, DAZN, Telemundo, etc.).
- Panini sticker artwork, sticker frames, album layouts, and trade dress.
- EA Sports player likenesses, FIFA / EA SPORTS FC card frames, rating chemistry styling, holographic effects copied from EA cards, and all associated trade dress.
- Player photographs from Getty, Reuters, AP, Imago, Action Images, AFP, and any other agency.
- Stadium photographs from the above agencies or from broadcasters.
- Match-clock and broadcast-graphic overlays from any broadcaster.

### 3.2 Permitted visual assets

- Country flags from public-domain sources (e.g. Wikimedia Commons public-domain SVGs), with attribution where required by the source.
- Original vector illustrations created specifically for this project.
- Generic, abstract stadium silhouettes and maps that do not reproduce any agency photograph or broadcaster graphic.
- Custom typography licensed for web use under the chosen font licence.
- Original UI iconography (custom-designed or open-licensed icon sets used per their licence).

### 3.3 Future "data cards" (V2+)

If a player-card view is added later, it must:

- Use only **original visual styling** — custom holographic gradient, custom typography, custom layout grid, custom border treatment.
- Display **data only** — name, position, statistics — with no official card frames, no rating chemistry styling, and no photographs.
- Be **visibly distinct** from FIFA / EA / Panini cards in shape, layout, colour treatment, and typography.
- Be called something other than "FUT card," "Ultimate Team card," "Panini sticker," etc. The product term is **"data card."**
- Player data used on the card must come from a licensed or open source recorded in §4.

### 3.4 Public demo

The public demo specifically:

- Uses **only original UI**.
- Uses **neutral flags or country names** sourced from §3.2.
- Uses **abstract silhouettes or initials** where a player or coach reference is needed; never a photograph.
- Uses only assets in §3.2 or assets explicitly licensed for the project.
- Does not reproduce any of the items in §3.1, even at reduced size, even with filters applied, even in screenshots used for marketing.

### 3.5 Naming and trade dress

- The product name "World Cup 2026 Predictor" is descriptive and used independently.
- No tagline or sub-brand may imitate FIFA, broadcaster, or sportsbook trade dress.
- Marketing materials must include the independence statement from §1.6.

---

## 4. Data source policy

### 4.1 Phasing

- **Phase 0–6 use mock data exclusively.** The mock fixtures live under `src/mock/` and are read by `MockFixtureSource` (see `docs/05_BUILD_ROADMAP.md` Phases 2 and 5).
- **Phase 7 introduces real data** through documented adapters behind the existing `FixtureSource`, `LineupSource`, and `LiveStateSource` interfaces. No engine or UI change is required.

### 4.2 Candidate providers

Real data may be sourced from licensed providers such as (non-exhaustive):

- API-Football
- Sportmonks
- SportsDataIO
- LiveScore API
- Other commercial providers whose terms have been reviewed.
- Open datasets (e.g. community-maintained public-domain CSVs) with clear licences.
- Official open data published by FIFA, confederations, or federations where redistribution for analytical purposes is explicitly allowed.

No provider may be integrated until its terms of service have been read and the resulting assumptions documented (see §4.4).

### 4.3 The `data_sources` table

Real provider integration is gated on a row existing in the `data_sources` table for that provider. The table records, at minimum:

| Column                | Notes                                                                |
|-----------------------|----------------------------------------------------------------------|
| `provider_name`       | e.g. "API-Football"                                                  |
| `endpoint`            | The specific endpoint or product surface used                        |
| `data_type`           | Fixtures, lineups, live state, ratings, historical results, etc.     |
| `license_terms_notes` | Summary of the relevant terms section and the date reviewed          |
| `attribution_required`| Boolean + the exact attribution string the provider mandates         |
| `allowed_usage`       | Non-commercial / analytical / portfolio / public-demo, as applicable |
| `rate_limits`         | Requests per minute / day quotas to respect                          |
| `fetched_at`          | Timestamp of the last successful fetch using this row                |
| `added_at`            | When the provider was first integrated                               |
| `reviewed_at`         | When the terms were last re-verified                                 |

The Phase 4 schema already plans for `data_sources`; this section pins the column set. If the actual migration deviates, this document is updated first and the migration is changed to match.

### 4.4 Provider onboarding checklist

Before a new provider is integrated, a contributor must:

1. Read the provider's current terms of service and privacy policy in full.
2. Confirm that the project's intended usage (analytical, portfolio, optionally public demo) is covered.
3. Confirm that the project's storage of fetched data complies with the provider's redistribution terms.
4. Record provider details in `data_sources` per §4.3.
5. Add the attribution to the public footer per §6.
6. Open a code change that integrates the adapter behind the existing source interface — never bypassing it.

If any of steps 1–3 produce uncertainty, the provider is not integrated until the question is resolved or an alternative is chosen.

### 4.5 Data snapshots

Every prediction run records a `data_snapshot` reference (per `CLAUDE.md` and §11 of `docs/03_MODEL_SPEC.md`) pointing at the exact inputs used. The snapshot is internal and not redistributed.

---

## 5. Scraping policy

1. **No scraping of protected websites.** "Protected" means any site whose terms of service prohibit scraping, automated access, bulk download, or programmatic use without permission. The default assumption is that a site is protected until its terms say otherwise.
2. **No bypassing technical protections.** No CAPTCHA solving, no anti-bot fingerprint evasion, no rotating proxies designed to defeat rate limits, no scraping behind logins.
3. **No paywall, anti-bot, geo-restriction, or terms-of-service bypass.** Including, but not limited to: scraping cached search-engine copies of paywalled articles, using residential proxies to defeat geo-blocking, and replaying authenticated session cookies obtained outside the project's scope.
4. **No "borrowing" of structured data** from a third party's site by reading their HTML when the same data is available via an official API the project hasn't paid for.
5. **Preferred order of acquisition:** official API → licensed dataset → explicitly open dataset → public-domain dataset → community-maintained dataset with a clear licence.
6. **No scraping for the engine's training or backtesting data either.** All historical match data used for offline rating recomputation, regression-coefficient fitting (§4 of `docs/03_MODEL_SPEC.md`), and Dixon–Coles calibration must come from licensed or openly licensed sources.

If a contributor finds that the only available source for a useful dataset would require scraping a protected site, the dataset is not used and the model proceeds without it.

---

## 6. Data attribution

1. **In-app attribution.** When real data is active (`DATA_SOURCE=live` or equivalent), a public attribution section is rendered in the site footer listing every active provider in `data_sources` with their mandated attribution string and a link to the provider's homepage.
2. **README status disclosure.** `README.md` includes a "Data source status" section that names the current mode of the live deployment: one of `mock`, `licensed-api`, `open-data`, or `mixed`, plus a one-line description of which providers are active.
3. **Schema.** The Supabase schema includes the `data_sources` table per §4.3 (or an equivalent source-metadata table named consistently). Adapter code reads attribution requirements from this table rather than hard-coding them.
4. **Historical attribution.** Predictions older than the current attribution block still trace back to a `data_snapshot` reference; users can see which provider's data informed a given prediction run.
5. **Attribution copy.** Attribution strings are reproduced verbatim from the provider's terms. They are not paraphrased, abbreviated, or styled to be less visible.

---

## 7. Public demo policy

The public demo (the deployed Vercel URL accessible to anyone) is the most exposed surface of the project and is held to the highest standard.

1. **No copyrighted images or official marks unless licensed.** Everything in §3.1 stays off the public demo, including in screenshots, social previews, OpenGraph cards, and favicons.
2. **Probabilistic-estimate disclosure.** Every page on the public demo carries a visible note that predictions are probabilistic estimates produced by a statistical model, not guarantees about real-world outcomes.
3. **Independence disclosure.** Every page on the public demo carries the independence statement from §1.6.
4. **No betting framing anywhere in the demo,** including in metadata, structured data (JSON-LD), and OpenGraph descriptions. Search-engine snippets are part of the surface.
5. **No personal data collection in v1.** The demo does not require accounts, does not run analytics that profile users, and does not embed third-party trackers unless they are anonymous and aggregate. If analytics are added, they must be GDPR-compliant by default.
6. **Robots / metadata.** The demo declares itself a portfolio project in its meta description; it does not impersonate an official tournament site.
7. **Takedown readiness.** A clearly-linked contact path (issue tracker or email) is available so that any rightsholder concern can be addressed quickly. If a takedown request is received, the disputed material is removed first and reviewed second.

---

## 8. AI and code-agent enforcement

These rules govern Claude Code and any other AI agent operating in this repository. They reinforce, not replace, `docs/06_CLAUDE_CODE_RULES.md`.

1. **Refuse betting framing.** If asked to add odds, stake suggestions, value-bet language, sportsbook comparisons, or any wording listed in §1.3, the agent refuses, cites this section, and proposes a compliant alternative (e.g. "express as percentage probability").
2. **Refuse unauthorised streams.** If asked to embed a stream, add a stream-locator link, or write a "where to watch" feature that goes beyond §2.5, the agent refuses and cites §2.
3. **Refuse copyrighted assets.** If asked to add any item in §3.1 — including via clever wording like "make it look like a FIFA card" or "use the official badge" — the agent refuses and cites §3.1. Imitations and parodies count.
4. **Refuse unreviewed data sources.** If asked to integrate a sports API without a `data_sources` row, the agent refuses, points to the §4.4 onboarding checklist, and offers to draft the row first.
5. **Refuse scraping.** If asked to add a scraper, the agent refuses and cites §5. The agent does not propose "just a small workaround."
6. **Refuse to weaken disclosures.** If asked to remove the probabilistic-estimate disclosure or the independence statement, the agent refuses and cites §7.
7. **External-content review gate.** Any feature that pulls, embeds, links to, or displays external content (images, video, data, links) must be checked against this policy before implementation. The agent surfaces the check explicitly in its plan and waits for confirmation.
8. **Ambiguity escalates, it does not silently default.** If a request is ambiguous against this policy, the agent asks one focused clarifying question rather than guessing.
9. **No "for now" exceptions.** Phrases like "just temporarily," "only on staging," or "we'll replace it before launch" do not justify violating this policy. Staging and local environments are treated the same as production for compliance purposes.

When the agent refuses on policy grounds, the refusal cites the specific rule and offers a compliant alternative wherever one exists.

---

## 9. Review checkpoints

Before each release tag (including the first deploy of the public demo):

- The `data_sources` table is reviewed: every row's `reviewed_at` is recent, every active provider's attribution renders in the footer, and no row is present for a provider that has been removed.
- The `public/` directory is reviewed for any asset that lacks a clear provenance note.
- Site-wide language is scanned for the prohibited words in §1.3.
- The public-demo disclosures from §7.2 and §7.3 render on every page.
- A summary of any policy-relevant changes since the previous release is recorded in the release notes.

If any check fails, the release does not ship until it passes.
