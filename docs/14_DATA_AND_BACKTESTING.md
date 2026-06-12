# 14 — Data corpus and backtesting

Phase 8A starts the offline historical corpus that future phases (8B accuracy
dashboard, 8C backtest harness) need. This document covers the source, the
licensing posture, the on-disk shape, and how to reproduce the corpus from
scratch.

> **Important.** Real club names appear only inside this gitignored corpus and
> in this document. The deployed product, the source-controlled mock data, and
> every public surface remain fictional. Real-data ingestion does not change
> any UI, formula, schema, or production runtime.

## 1. Source and attribution

- **Source.** [football-data.co.uk](https://www.football-data.co.uk/) — Joseph
  Buchdahl's freely-published archive of historical European football results
  with closing-line bookmaker odds.
- **Coverage in this corpus.** English Premier League (`E0`), seasons
  **2015-16 through 2024-25** — ten seasons.
- **URL pattern (verified 2026-06-11).**
  `https://www.football-data.co.uk/mmz4281/{YYYY}/E0.csv` where `{YYYY}` is the
  four-digit season code (e.g. `1516`, `2425`).
- **Licensing.** football-data.co.uk states the data is free to download for
  personal use; commercial redistribution requires permission. This project
  treats the corpus as personal-use research data only:
  - never redistributed in raw form (the `data/` directory is gitignored);
  - never rendered to the public UI (the public surface is mock data);
  - referenced in published portfolio material with the attribution string
    "Historical match results & closing odds: football-data.co.uk
    (Joseph Buchdahl)".

## 2. On-disk shape

```
data/
├── raw/                # CSVs as downloaded — NOT in git
│   ├── E0-2015-16.csv
│   ├── E0-2016-17.csv
│   ├── …
│   └── E0-2024-25.csv
└── processed/          # aggregated JSON output — NOT in git
    └── matches.json    # single file, sorted ASC by dateIso
```

The `.gitignore` excludes both `data/raw/` and `data/processed/`. A trimmed
30-row sample of the 2024-25 file lives under
`src/lib/data/history/__tests__/fixtures/E0-2024-25-sample.csv` and is the
only piece of real-club-name data in the repository — it exists to anchor
the parser against the live wire shape.

### Output JSON record shape

```ts
type HistoricalMatch = {
  season: string;       // e.g., "2024-25"
  dateIso: string;      // YYYY-MM-DD
  homeTeam: string;     // trimmed
  awayTeam: string;     // trimmed
  homeGoals: number;
  awayGoals: number;
  odds?: {              // optional — Bet365 preferred, Pinnacle (PS) fallback
    home: number;
    draw: number;
    away: number;
  };
};
```

## 3. Reproduce the corpus

```bash
# 1. Download every season CSV. Idempotent: re-runs skip files already on disk.
pnpm history:fetch

# 2. Parse and aggregate into data/processed/matches.json. Prints a summary
#    JSON to stdout with file count, total matches, rows with odds, and the
#    date range.
pnpm history:build
```

`pnpm history:fetch` paces requests at ~300 ms between seasons. The summary
returned by `pnpm history:build` has the canonical shape:

```json
{
  "files": 10,
  "matches": 3800,
  "withOdds": 3800,
  "rejected": 0,
  "firstDate": "2015-08-08",
  "lastDate": "2025-05-25"
}
```

(Exact numbers will vary with corpus updates; the structure does not.)

## 4. Parsing rules

`src/lib/data/history/parseHistoricalCsv.ts` is a pure function — no I/O, no
side effects, taking a raw CSV string + season label and returning
`{matches, rejected}`. The rules it enforces:

- **Required columns.** `Date`, `HomeTeam`, `AwayTeam`, `FTHG`, `FTAG` must
  all appear in the header. If any is missing, the entire body is rejected.
- **Dates.** `DD/MM/YYYY` and `DD/MM/YY` are both accepted. 2-digit years
  expand as `< 70 → 2000+YY`, `≥ 70 → 1900+YY`.
- **Goals.** Must be non-negative integers; otherwise the row is rejected.
- **Odds.** Bet365 (`B365H`/`B365D`/`B365A`) is preferred; Pinnacle
  (`PSH`/`PSD`/`PSA`) is the fallback. If neither produces a complete triple,
  the match is recorded without odds (odds are optional).
- **BOM + CRLF.** UTF-8 BOMs are stripped; `\r\n` and `\r` are normalised to
  `\n` before splitting.

Tests at `src/lib/data/history/__tests__/parseHistoricalCsv.test.ts` exercise
each rule against the committed 30-row sample plus inline synthetic CSVs for
edge cases (2-digit dates, PS fallback, malformed rows).

## 5. What this corpus enables

Future phases consume `data/processed/matches.json` as a deterministic input:

- **Phase 8B — accuracy dashboard.** Compute Brier and log-loss against the
  realised results; render a calibration chart and a scoreline hit-rate plot.
  Read-only — the dashboard is its own surface, not a change to the predictor
  UI.
- **Phase 8C — backtest harness.** Train / tune the engine's parameters
  (Elo k-factor, decay half-life, Dixon-Coles ρ) by walking the corpus
  chronologically and scoring each prediction.

Neither phase changes the live prediction engine or schema. Both run offline,
consume the JSON, and emit reports — no production reads, no writes.
