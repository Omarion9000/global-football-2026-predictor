#!/usr/bin/env tsx
// =============================================================================
// scripts/run-backtest.ts
// =============================================================================
// Phase 8C — backtest runner. Reads the Phase 8A corpus, runs the three
// baseline predictors through the harness, and emits two artifacts:
//
//   - docs/15_BACKTEST_BASELINES.md     (committed; aggregate-only)
//   - data/processed/backtest-report.json (gitignored; full detail)
//
// Three gates run before either artifact is written:
//   GATE 1 (analytic self-test) — uniform Brier = 2/3 ± 1e-4, logLoss = ln 3 ± 1e-4
//   GATE 2 — market beats both naive baselines on Brier AND logLoss
//   GATE 3 (warn-only) — market Brier outside [0.55, 0.61] → WARN
//
// Gates 1 + 2 trigger a non-zero exit on failure.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createMarketImpliedPredictor,
  createRollingHomeAdvantagePredictor,
  createUniformPredictor,
} from '@/lib/backtest/baselines';
import { calibrationBins, type CalibrationBin } from '@/lib/backtest/metrics';
import { EVAL_START_DATE, runBacktest, type PredictorReport } from '@/lib/backtest/harness';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'processed', 'matches.json');
const REPORT_JSON_PATH = resolve(process.cwd(), 'data', 'processed', 'backtest-report.json');
const REPORT_MD_PATH = resolve(process.cwd(), 'docs', '15_BACKTEST_BASELINES.md');

// =============================================================================
// Gate thresholds
// =============================================================================

const GATE1_UNIFORM_BRIER = 2 / 3;
const GATE1_UNIFORM_LOGLOSS = Math.log(3);
const GATE1_TOLERANCE = 1e-4;

const GATE3_MARKET_BRIER_MIN = 0.55;
const GATE3_MARKET_BRIER_MAX = 0.61;

// =============================================================================
// I/O
// =============================================================================

function loadCorpus(): HistoricalMatch[] {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `run-backtest: corpus not found at ${CORPUS_PATH}. Run \`pnpm history:fetch && pnpm history:build\` first.`,
    );
  }
  const raw = readFileSync(CORPUS_PATH, 'utf-8');
  const data = JSON.parse(raw) as HistoricalMatch[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`run-backtest: corpus at ${CORPUS_PATH} is empty or malformed`);
  }
  return data;
}

// =============================================================================
// Markdown report (aggregate-only — never includes team names)
// =============================================================================

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}

function renderOverallTable(reports: PredictorReport[]): string {
  const rows = reports.map(
    (r) =>
      `| ${r.name} | ${r.overall.matchesScored} | ${fmt(r.overall.brier)} | ${fmt(
        r.overall.logLoss,
      )} | ${fmt(r.overall.accuracy)} |`,
  );
  return [
    '| predictor | matches | Brier | log-loss | accuracy |',
    '|-----------|---------|-------|----------|----------|',
    ...rows,
  ].join('\n');
}

function renderSeasonTable(reports: PredictorReport[]): string {
  const seasons = [...new Set(reports.flatMap((r) => r.bySeason.map((s) => s.season)))].sort();
  const header = ['| season |', ...reports.flatMap((r) => [`B(${r.name})`, `LL(${r.name})`])].join(
    ' | ',
  );
  const sep = `|${' --- |'.repeat(reports.length * 2 + 1)}`;
  const rows = seasons.map((season) => {
    const cells = reports.flatMap((r) => {
      const row = r.bySeason.find((s) => s.season === season);
      if (!row) return ['–', '–'];
      return [fmt(row.brier), fmt(row.logLoss)];
    });
    return `| ${season} | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function renderCalibrationTable(name: string, bins: CalibrationBin[]): string {
  const rows = bins.map((b, i) => {
    const lower = (i / bins.length).toFixed(1);
    const upper = i === bins.length - 1 ? '1.0' : ((i + 1) / bins.length).toFixed(1);
    return `| [${lower}, ${upper}${i === bins.length - 1 ? ']' : ')'} | ${b.count} | ${fmt(
      b.meanPredicted,
    )} | ${fmt(b.empiricalRate)} |`;
  });
  return [
    `### ${name}`,
    '',
    '| bin | n | mean predicted | empirical rate |',
    '|-----|---|----------------|----------------|',
    ...rows,
  ].join('\n');
}

function renderMarkdown(args: {
  generatedAt: string;
  evalStartDate: string;
  matchesObserved: number;
  matchesScored: number;
  reports: PredictorReport[];
  calibrations: ReadonlyArray<{ name: string; bins: CalibrationBin[] }>;
  gates: { gate1: string; gate2: string; gate3: string };
}): string {
  return [
    '# 15 — Backtest baselines',
    '',
    `Generated by \`pnpm backtest\` over the Phase 8A corpus. ${args.generatedAt}`,
    '',
    '> **Aggregate report only.** Real club names live in the gitignored',
    '> `data/processed/backtest-report.json` and are never published.',
    '',
    '## Evaluation set',
    '',
    `- Evaluation cutoff: \`dateIso >= ${args.evalStartDate}\` (season 2015-16 is observed but not scored — burn-in).`,
    `- Matches observed (full corpus): ${args.matchesObserved.toLocaleString()}`,
    `- Matches scored (post-burn-in): ${args.matchesScored.toLocaleString()}`,
    '',
    '## Metrics',
    '',
    '- **Brier** — multiclass Brier score `Σ (pᵢ − oᵢ)²`, lower is better.',
    '  Perfect = 0; uniform [1/3, 1/3, 1/3] = 2/3 ≈ 0.6667; worst = 2.',
    '- **log-loss** — `−log p(observed class)` clamped at 1e-12.',
    '  Perfect = 0; uniform = ln 3 ≈ 1.0986.',
    '- **accuracy** — secondary diagnostic only; share of matches where',
    '  argmax(predicted) equals realised outcome. Argmax discards calibration',
    '  signal so Brier / log-loss are the primary metrics.',
    '',
    '## Overall metrics',
    '',
    renderOverallTable(args.reports),
    '',
    '## Per-season Brier and log-loss',
    '',
    renderSeasonTable(args.reports),
    '',
    '## Reliability diagrams (10-bin)',
    '',
    ...args.calibrations.flatMap((c) => [renderCalibrationTable(c.name, c.bins), '']),
    '## Gates',
    '',
    `- ${args.gates.gate1}`,
    `- ${args.gates.gate2}`,
    `- ${args.gates.gate3}`,
    '',
    '## Notes',
    '',
    '- Closing-line odds (Bet365 preferred, Pinnacle fallback) are converted',
    '  to implied probabilities by proportional removal of the bookmaker',
    '  overround — the standard first-order method. See `docs/14_DATA_AND_BACKTESTING.md`',
    '  for the broader methodology.',
    '- Rolling-home-advantage is add-one (Laplace) smoothed and updated only',
    '  through `observe()` — no peeking at the current match.',
    '',
  ].join('\n');
}

// =============================================================================
// Gates
// =============================================================================

type GateOutcome = { ok: boolean; line: string };

function gate1(uniform: PredictorReport): GateOutcome {
  const dB = Math.abs(uniform.overall.brier - GATE1_UNIFORM_BRIER);
  const dL = Math.abs(uniform.overall.logLoss - GATE1_UNIFORM_LOGLOSS);
  const ok = dB <= GATE1_TOLERANCE && dL <= GATE1_TOLERANCE;
  const line = `GATE 1 (analytic self-test): ${
    ok ? 'PASS' : 'FAIL'
  } — uniform Brier=${fmt(uniform.overall.brier, 6)} (target ${fmt(
    GATE1_UNIFORM_BRIER,
    6,
  )} ± ${GATE1_TOLERANCE}), logLoss=${fmt(uniform.overall.logLoss, 6)} (target ${fmt(
    GATE1_UNIFORM_LOGLOSS,
    6,
  )} ± ${GATE1_TOLERANCE})`;
  return { ok, line };
}

function gate2(
  market: PredictorReport,
  uniform: PredictorReport,
  rolling: PredictorReport,
): GateOutcome {
  const beatsBrier =
    market.overall.brier < uniform.overall.brier && market.overall.brier < rolling.overall.brier;
  const beatsLL =
    market.overall.logLoss < uniform.overall.logLoss && market.overall.logLoss < rolling.overall.logLoss;
  const ok = beatsBrier && beatsLL;
  const line = `GATE 2 (market dominates naive baselines): ${
    ok ? 'PASS' : 'FAIL'
  } — market Brier=${fmt(market.overall.brier)} vs uniform=${fmt(
    uniform.overall.brier,
  )} / rolling=${fmt(rolling.overall.brier)}; market logLoss=${fmt(
    market.overall.logLoss,
  )} vs uniform=${fmt(uniform.overall.logLoss)} / rolling=${fmt(
    rolling.overall.logLoss,
  )}`;
  return { ok, line };
}

function gate3(market: PredictorReport): GateOutcome {
  const inBand =
    market.overall.brier >= GATE3_MARKET_BRIER_MIN &&
    market.overall.brier <= GATE3_MARKET_BRIER_MAX;
  const tag = inBand ? 'OK' : 'WARN';
  const line = `GATE 3 (market Brier sanity, warn-only): ${tag} — market Brier=${fmt(
    market.overall.brier,
  )} (expected band [${GATE3_MARKET_BRIER_MIN}, ${GATE3_MARKET_BRIER_MAX}])`;
  return { ok: true, line }; // warn-only — never trips a non-zero exit
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  const corpus = loadCorpus();
  const uniform = createUniformPredictor();
  const rolling = createRollingHomeAdvantagePredictor();
  const market = createMarketImpliedPredictor();

  const report = runBacktest(corpus, [uniform, rolling, market]);

  const [uReport, rReport, mReport] = report.predictors;

  // Run gates.
  const g1 = gate1(uReport);
  const g2 = gate2(mReport, uReport, rReport);
  const g3 = gate3(mReport);

  if (!g1.ok) {
    process.stderr.write(`${g1.line}\n`);
    process.stderr.write('STOP: metric implementation bug suspected.\n');
    process.exit(1);
  }
  if (!g2.ok) {
    process.stderr.write(`${g2.line}\n`);
    process.stderr.write('STOP: market does not dominate naive baselines — odds conversion bug suspected.\n');
    process.exit(1);
  }

  // Calibration tables (separate from harness because the harness emits
  // the raw pairs and the bin count is a runner choice).
  const calibrations = report.predictors.map((p) => ({
    name: p.name,
    bins: calibrationBins(p.calibration, 10),
  }));

  // Markdown — aggregate-only.
  const md = renderMarkdown({
    generatedAt: new Date().toISOString(),
    evalStartDate: report.evalStartDate,
    matchesObserved: report.matchesObserved,
    matchesScored: report.matchesScored,
    reports: report.predictors,
    calibrations,
    gates: { gate1: g1.line, gate2: g2.line, gate3: g3.line },
  });
  writeFileSync(REPORT_MD_PATH, md);

  // Full detail JSON — gitignored. Includes per-class calibration pairs.
  mkdirSync(resolve(process.cwd(), 'data', 'processed'), { recursive: true });
  writeFileSync(
    REPORT_JSON_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        evalStartDate: report.evalStartDate,
        matchesObserved: report.matchesObserved,
        matchesScored: report.matchesScored,
        predictors: report.predictors,
        calibrations,
        marketStats: market.stats(),
        gates: { gate1: g1.line, gate2: g2.line, gate3: g3.line },
      },
      null,
      2,
    ) + '\n',
  );

  // Console summary — single line per gate + the overall table.
  process.stdout.write(`${g1.line}\n${g2.line}\n${g3.line}\n\n`);
  process.stdout.write('Overall metrics:\n');
  process.stdout.write(renderOverallTable(report.predictors) + '\n');
  process.stdout.write(
    `\nMatches observed: ${report.matchesObserved.toLocaleString()}; scored: ${report.matchesScored.toLocaleString()}\n`,
  );
  process.stdout.write(
    `Market fallback to uniform on missing odds: ${market.stats().oddsFallback} / ${market.stats().predictions}\n`,
  );
}

main();
