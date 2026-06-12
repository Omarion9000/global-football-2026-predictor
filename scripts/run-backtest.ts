#!/usr/bin/env tsx
// =============================================================================
// scripts/run-backtest.ts
// =============================================================================
// Phase 8C + 8B — backtest runner.
//
// Layers
//   1. Naive + market baselines on a 2016-08-01-cutoff (Phase 8C).
//   2. Dixon-Coles candidate v0.2 with leakage-safe tuning on validation
//      seasons 2016-17 + 2017-18 and headline evaluation on 2018-19..2024-25
//      (Phase 8B).
//
// Inputs
//   data/processed/matches.json  — full football-data.co.uk E0 corpus.
//
// Outputs
//   docs/15_BACKTEST_BASELINES.md     (committed; aggregate-only)
//   data/processed/backtest-report.json (gitignored; full detail)
//
// Gates (in addition to the original 1-3 self-tests on uniform):
//   GATE 1  — uniform Brier = 2/3 ± 1e-4, log-loss = ln 3 ± 1e-4 (analytic).
//   GATE 2  — market beats both naive baselines on the legacy 2016-08-01 cut.
//   GATE 3  — market Brier ∈ [0.55, 0.61] on the legacy cut (warn-only).
//   GATE A  — DC beats uniform AND rolling on Brier and log-loss in HOLDOUT.
//   GATE B  — DC holdout Brier ∈ [0.57, 0.62] WARN; > 0.64 STOP.
//   GATE C  — DC vs market gap reported (no enforcement).
//   GATE D  — homeAdv > 0; ρ ∈ (-0.2, 0.05); |mean(α)|, |mean(δ)| < 1e-8;
//             objective non-decreasing across iterations of the final fit.
//   Runtime — WARN if total runtime exceeds 10 min.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createMarketImpliedPredictor,
  createRollingHomeAdvantagePredictor,
  createUniformPredictor,
} from '@/lib/backtest/baselines';
import { calibrationBins, type CalibrationBin } from '@/lib/backtest/metrics';
import {
  EVAL_START_DATE,
  runBacktest,
  type PredictorReport,
} from '@/lib/backtest/harness';
import {
  createDixonColesPredictor,
  type DixonColesPredictor,
} from '@/lib/backtest/models/dcPredictor';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'processed', 'matches.json');
const REPORT_JSON_PATH = resolve(process.cwd(), 'data', 'processed', 'backtest-report.json');
const REPORT_MD_PATH = resolve(process.cwd(), 'docs', '15_BACKTEST_BASELINES.md');

// -----------------------------------------------------------------------------
// Phase 8C self-test gate thresholds (legacy 2016-08-01 cutoff for baselines).
// -----------------------------------------------------------------------------
const GATE1_UNIFORM_BRIER = 2 / 3;
const GATE1_UNIFORM_LOGLOSS = Math.log(3);
const GATE1_TOLERANCE = 1e-4;
const GATE3_MARKET_BRIER_MIN = 0.55;
const GATE3_MARKET_BRIER_MAX = 0.61;

// -----------------------------------------------------------------------------
// Phase 8B windows.
// -----------------------------------------------------------------------------
const VALIDATION_START = '2016-08-01';
const VALIDATION_END = '2018-08-01'; // exclusive — 2016-17 + 2017-18
const HOLDOUT_START = '2018-08-01';   // 2018-19..2024-25

// Hyperparameter grid (W4).
const XI_GRID = [0.001, 0.002, 0.004, 0.0065] as const;
const LAMBDA_REG_GRID = [0.5, 1, 2] as const;

// -----------------------------------------------------------------------------
// Phase 8B holdout-Brier sanity thresholds (W5).
// -----------------------------------------------------------------------------
const GATE_B_BAND_MIN = 0.57;
const GATE_B_BAND_MAX = 0.62;
const GATE_B_HARD_STOP = 0.64;
const RUNTIME_WARN_MS = 10 * 60 * 1000;

// =============================================================================
// I/O
// =============================================================================

function loadCorpus(): HistoricalMatch[] {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `run-backtest: corpus not found at ${CORPUS_PATH}. Run \`pnpm history:fetch && pnpm history:build\` first.`,
    );
  }
  const data = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as HistoricalMatch[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`run-backtest: corpus at ${CORPUS_PATH} is empty or malformed`);
  }
  return data;
}

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}

// =============================================================================
// Markdown helpers (aggregate-only — never includes team names).
// =============================================================================

function renderOverallTable(reports: PredictorReport[], header = 'predictor'): string {
  const rows = reports.map(
    (r) =>
      `| ${r.name} | ${r.overall.matchesScored} | ${fmt(r.overall.brier)} | ${fmt(
        r.overall.logLoss,
      )} | ${fmt(r.overall.accuracy)} |`,
  );
  return [
    `| ${header} | matches | Brier | log-loss | accuracy |`,
    `|${'-'.repeat(header.length + 2)}|---------|-------|----------|----------|`,
    ...rows,
  ].join('\n');
}

function renderSeasonTable(
  reports: PredictorReport[],
  validationSeasons: ReadonlyArray<string>,
): string {
  const seasons = [
    ...new Set(reports.flatMap((r) => r.bySeason.map((s) => s.season))),
  ].sort();
  // Build a fully-aligned table: one column per (predictor, metric) pair.
  const colHeaders = ['season', ...reports.flatMap((r) => [`B(${r.name})`, `LL(${r.name})`])];
  const header = `| ${colHeaders.join(' | ')} |`;
  const sep = `|${colHeaders.map(() => '---').join('|')}|`;
  const rows = seasons.map((season) => {
    const cells = reports.flatMap((r) => {
      const row = r.bySeason.find((s) => s.season === season);
      if (!row) return ['–', '–'];
      return [fmt(row.brier), fmt(row.logLoss)];
    });
    const tag = validationSeasons.includes(season) ? ` ${season} (val)` : ` ${season}`;
    return `|${tag} | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function renderCalibrationTable(name: string, bins: CalibrationBin[]): string {
  const rows = bins.map((b, i) => {
    const lower = (i / bins.length).toFixed(1);
    const upper = i === bins.length - 1 ? '1.0' : ((i + 1) / bins.length).toFixed(1);
    return `| [${lower}, ${upper}${
      i === bins.length - 1 ? ']' : ')'
    } | ${b.count} | ${fmt(b.meanPredicted)} | ${fmt(b.empiricalRate)} |`;
  });
  return [
    `### ${name}`,
    '',
    '| bin | n | mean predicted | empirical rate |',
    '|-----|---|----------------|----------------|',
    ...rows,
  ].join('\n');
}

function renderGridTable(
  rows: ReadonlyArray<{
    xi: number;
    lambdaReg: number;
    brier: number;
    logLoss: number;
    matches: number;
  }>,
  chosenXi: number,
  chosenLambdaReg: number,
): string {
  const formatted = rows.map((r) => {
    const tag = r.xi === chosenXi && r.lambdaReg === chosenLambdaReg ? '  ← chosen' : '';
    return `| ${r.xi} | ${r.lambdaReg} | ${r.matches} | ${fmt(r.brier)} | ${fmt(
      r.logLoss,
    )}${tag} |`;
  });
  return [
    '| ξ | λ_reg | matches | Brier | log-loss |',
    '|---|-------|---------|-------|----------|',
    ...formatted,
  ].join('\n');
}

// =============================================================================
// Phase 8B — tuning + holdout
// =============================================================================

type GridRow = {
  xi: number;
  lambdaReg: number;
  brier: number;
  logLoss: number;
  matches: number;
};

function runTuningGrid(corpus: HistoricalMatch[]): {
  grid: GridRow[];
  chosen: { xi: number; lambdaReg: number };
} {
  // For tuning we want every (ξ, λ_reg) to see the same matches. Pre-filter
  // the corpus to matches with dateIso < VALIDATION_END so the harness loop
  // is cheap.
  const tuningCorpus = corpus.filter((m) => m.dateIso < VALIDATION_END);
  const grid: GridRow[] = [];
  let bestLogLoss = Number.POSITIVE_INFINITY;
  let chosen = { xi: XI_GRID[0] as number, lambdaReg: LAMBDA_REG_GRID[0] as number };

  for (const xi of XI_GRID) {
    for (const lambdaReg of LAMBDA_REG_GRID) {
      const dc = createDixonColesPredictor({
        xi,
        lambdaReg,
        name: `dc-tune-${xi}-${lambdaReg}`,
        // Keep tuning fits a little leaner to control runtime.
        maxIterationsCold: 300,
        maxIterationsWarm: 50,
      });
      const report = runBacktest(tuningCorpus, [dc], {
        evalStartDate: VALIDATION_START,
        evalEndDate: VALIDATION_END,
      });
      const r = report.predictors[0];
      grid.push({
        xi,
        lambdaReg,
        brier: r.overall.brier,
        logLoss: r.overall.logLoss,
        matches: r.overall.matchesScored,
      });
      if (r.overall.logLoss < bestLogLoss) {
        bestLogLoss = r.overall.logLoss;
        chosen = { xi, lambdaReg };
      }
    }
  }
  return { grid, chosen };
}

// =============================================================================
// Gates
// =============================================================================

type GateOutcome = { ok: boolean; line: string };

function gate1(uniform: PredictorReport): GateOutcome {
  const dB = Math.abs(uniform.overall.brier - GATE1_UNIFORM_BRIER);
  const dL = Math.abs(uniform.overall.logLoss - GATE1_UNIFORM_LOGLOSS);
  const ok = dB <= GATE1_TOLERANCE && dL <= GATE1_TOLERANCE;
  return {
    ok,
    line: `GATE 1 (analytic self-test, legacy cut): ${
      ok ? 'PASS' : 'FAIL'
    } — uniform Brier=${fmt(uniform.overall.brier, 6)} (target ${fmt(
      GATE1_UNIFORM_BRIER,
      6,
    )} ± ${GATE1_TOLERANCE}), log-loss=${fmt(uniform.overall.logLoss, 6)} (target ${fmt(
      GATE1_UNIFORM_LOGLOSS,
      6,
    )} ± ${GATE1_TOLERANCE})`,
  };
}

function gate2(
  market: PredictorReport,
  uniform: PredictorReport,
  rolling: PredictorReport,
): GateOutcome {
  const beatsBrier =
    market.overall.brier < uniform.overall.brier && market.overall.brier < rolling.overall.brier;
  const beatsLL =
    market.overall.logLoss < uniform.overall.logLoss &&
    market.overall.logLoss < rolling.overall.logLoss;
  const ok = beatsBrier && beatsLL;
  return {
    ok,
    line: `GATE 2 (market dominates naive, legacy cut): ${
      ok ? 'PASS' : 'FAIL'
    } — Brier ${fmt(market.overall.brier)} < ${fmt(uniform.overall.brier)} & ${fmt(
      rolling.overall.brier,
    )}; log-loss ${fmt(market.overall.logLoss)} < ${fmt(uniform.overall.logLoss)} & ${fmt(
      rolling.overall.logLoss,
    )}`,
  };
}

function gate3(market: PredictorReport): GateOutcome {
  const inBand =
    market.overall.brier >= GATE3_MARKET_BRIER_MIN &&
    market.overall.brier <= GATE3_MARKET_BRIER_MAX;
  return {
    ok: true,
    line: `GATE 3 (market Brier sanity, warn-only): ${
      inBand ? 'OK' : 'WARN'
    } — market Brier=${fmt(market.overall.brier)} band [${GATE3_MARKET_BRIER_MIN}, ${GATE3_MARKET_BRIER_MAX}]`,
  };
}

function gateA(
  dc: PredictorReport,
  uniform: PredictorReport,
  rolling: PredictorReport,
): GateOutcome {
  const beatsBrier = dc.overall.brier < uniform.overall.brier && dc.overall.brier < rolling.overall.brier;
  const beatsLL = dc.overall.logLoss < uniform.overall.logLoss && dc.overall.logLoss < rolling.overall.logLoss;
  const ok = beatsBrier && beatsLL;
  return {
    ok,
    line: `GATE A (DC dominates naive, holdout): ${
      ok ? 'PASS' : 'FAIL'
    } — Brier ${fmt(dc.overall.brier)} < ${fmt(uniform.overall.brier)} & ${fmt(
      rolling.overall.brier,
    )}; log-loss ${fmt(dc.overall.logLoss)} < ${fmt(uniform.overall.logLoss)} & ${fmt(
      rolling.overall.logLoss,
    )}`,
  };
}

function gateB(dc: PredictorReport): { hardFail: boolean; line: string } {
  const b = dc.overall.brier;
  if (b > GATE_B_HARD_STOP) {
    return {
      hardFail: true,
      line: `GATE B (DC holdout Brier sanity): FAIL — Brier=${fmt(b)} > ${GATE_B_HARD_STOP}`,
    };
  }
  if (b < GATE_B_BAND_MIN || b > GATE_B_BAND_MAX) {
    return {
      hardFail: false,
      line: `GATE B (DC holdout Brier sanity): WARN — Brier=${fmt(b)} outside [${GATE_B_BAND_MIN}, ${GATE_B_BAND_MAX}]`,
    };
  }
  return {
    hardFail: false,
    line: `GATE B (DC holdout Brier sanity): OK — Brier=${fmt(b)} ∈ [${GATE_B_BAND_MIN}, ${GATE_B_BAND_MAX}]`,
  };
}

function gateC(dc: PredictorReport, market: PredictorReport): string {
  const brierGap = dc.overall.brier - market.overall.brier;
  const llGap = dc.overall.logLoss - market.overall.logLoss;
  return `GATE C (DC vs market, report-only): Brier gap ${fmt(brierGap, 5)} (positive = market wins), log-loss gap ${fmt(llGap, 5)}`;
}

function gateD(dcPredictor: DixonColesPredictor): GateOutcome {
  const stats = dcPredictor.stats();
  const params = stats.finalParams;
  if (params == null) {
    return { ok: false, line: 'GATE D (fitted-param sanity): FAIL — no final params produced' };
  }
  const meanAtt =
    params.att.reduce((a, b) => a + b, 0) / Math.max(1, params.att.length);
  const meanDef =
    params.def.reduce((a, b) => a + b, 0) / Math.max(1, params.def.length);
  const homeAdvOk = params.homeAdv > 0;
  const rhoOk = params.rho > -0.2 && params.rho < 0.05;
  const recenteredOk = Math.abs(meanAtt) < 1e-8 && Math.abs(meanDef) < 1e-8;
  // Non-decreasing across the final fit's iterations.
  let monotone = true;
  for (let i = 1; i < stats.lastObjectives.length; i += 1) {
    if (stats.lastObjectives[i] < stats.lastObjectives[i - 1] - 1e-9) {
      monotone = false;
      break;
    }
  }
  const ok = homeAdvOk && rhoOk && recenteredOk && monotone;
  return {
    ok,
    line: `GATE D (fitted-param sanity): ${ok ? 'PASS' : 'FAIL'} — homeAdv=${fmt(
      params.homeAdv,
      4,
    )} (need > 0), ρ=${fmt(params.rho, 4)} (need ∈ (−0.2, 0.05)), |mean(α)|=${fmt(
      Math.abs(meanAtt),
      11,
    )}, |mean(δ)|=${fmt(Math.abs(meanDef), 11)}, final-fit monotone=${monotone}`,
  };
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  const t0 = Date.now();
  const corpus = loadCorpus();

  // -------------------------------------------------------------------------
  // Layer 1 — legacy baseline run (GATEs 1-3).
  // -------------------------------------------------------------------------
  const legacyUniform = createUniformPredictor();
  const legacyRolling = createRollingHomeAdvantagePredictor();
  const legacyMarket = createMarketImpliedPredictor();
  const legacyReport = runBacktest(corpus, [legacyUniform, legacyRolling, legacyMarket]);
  const [legacyU, legacyR, legacyM] = legacyReport.predictors;

  const g1 = gate1(legacyU);
  const g2 = gate2(legacyM, legacyU, legacyR);
  const g3 = gate3(legacyM);
  if (!g1.ok) {
    process.stderr.write(`${g1.line}\nSTOP: metric implementation bug suspected.\n`);
    process.exit(1);
  }
  if (!g2.ok) {
    process.stderr.write(`${g2.line}\nSTOP: market does not dominate naive baselines — odds conversion bug suspected.\n`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Layer 2 — Phase 8B tuning over (ξ, λ_reg).
  // -------------------------------------------------------------------------
  process.stdout.write('Phase 8B — tuning Dixon-Coles on 2016-17 + 2017-18 …\n');
  const { grid, chosen } = runTuningGrid(corpus);
  process.stdout.write(`Phase 8B — chosen: ξ=${chosen.xi}, λ_reg=${chosen.lambdaReg}\n`);

  // -------------------------------------------------------------------------
  // Layer 3 — holdout: baselines + DC on 2018-19 .. 2024-25.
  // -------------------------------------------------------------------------
  const holdoutUniform = createUniformPredictor();
  const holdoutRolling = createRollingHomeAdvantagePredictor();
  const holdoutMarket = createMarketImpliedPredictor();
  const dcFinal = createDixonColesPredictor({
    xi: chosen.xi,
    lambdaReg: chosen.lambdaReg,
    name: 'dixon-coles-v0.2-candidate',
  });
  const holdoutReport = runBacktest(
    corpus,
    [holdoutUniform, holdoutRolling, holdoutMarket, dcFinal],
    { evalStartDate: HOLDOUT_START },
  );
  const [hU, hR, hM, hDC] = holdoutReport.predictors;

  // -------------------------------------------------------------------------
  // Gates A–D + runtime.
  // -------------------------------------------------------------------------
  const gA = gateA(hDC, hU, hR);
  const gB = gateB(hDC);
  const gC = gateC(hDC, hM);
  const gD = gateD(dcFinal);

  if (!gA.ok) {
    process.stderr.write(`${gA.line}\nSTOP: DC does not dominate naive baselines on the holdout.\n`);
    process.exit(1);
  }
  if (gB.hardFail) {
    process.stderr.write(`${gB.line}\nSTOP: DC holdout Brier above the hard ceiling.\n`);
    process.exit(1);
  }
  if (!gD.ok) {
    process.stderr.write(`${gD.line}\nSTOP: fitted-parameter sanity failed.\n`);
    process.exit(1);
  }

  const runtimeMs = Date.now() - t0;
  const runtimeLine = `Runtime: ${(runtimeMs / 1000).toFixed(1)}s${
    runtimeMs > RUNTIME_WARN_MS ? ' — WARN (> 10 min)' : ''
  }`;

  // -------------------------------------------------------------------------
  // Calibration tables.
  // -------------------------------------------------------------------------
  const calibrations = holdoutReport.predictors.map((p) => ({
    name: p.name,
    bins: calibrationBins(p.calibration, 10),
  }));

  // -------------------------------------------------------------------------
  // Render aggregate-only markdown.
  // -------------------------------------------------------------------------
  const generatedAt = new Date().toISOString();
  const md = [
    '# 15 — Backtest baselines and v0.2 candidate',
    '',
    `Generated by \`pnpm backtest\` ${generatedAt}.`,
    '',
    '> **Aggregate report only.** Real club names live in the gitignored',
    '> `data/processed/backtest-report.json` and are never published.',
    '> The production engine remains `MODEL_VERSION = "v0.1.0"`; the',
    '> v0.2 candidate is a backtest-only artifact pending its own promotion phase.',
    '',
    '## Evaluation windows',
    '',
    `- **Burn-in:** \`2015-08-08 .. 2016-07-31\` (380 matches; observed, not scored).`,
    `- **Validation (Phase 8B tuning only):** \`${VALIDATION_START} .. ${VALIDATION_END}\` (seasons 2016-17 + 2017-18; tagged "(val)" in the per-season table).`,
    `- **Holdout (Phase 8B headline):** \`>= ${HOLDOUT_START}\` (seasons 2018-19 .. 2024-25).`,
    `- **Legacy baseline cut (Phase 8C):** \`>= ${EVAL_START_DATE}\` — kept so the Phase 8C self-test gates 1–3 are reproducible on every run.`,
    '',
    '## Metrics',
    '',
    '- **Brier** — multiclass Brier score `Σ (pᵢ − oᵢ)²`. Perfect = 0; uniform = 2/3 ≈ 0.6667; worst = 2.',
    '- **log-loss** — `−log p(observed class)` clamped at 1e-12. Perfect = 0; uniform = ln 3 ≈ 1.0986.',
    '- **accuracy** — diagnostic only; share where `argmax(probs) == observed`.',
    '',
    '## Phase 8B — tuning grid',
    '',
    `Validation seasons (2016-17 + 2017-18) only. Pick the (ξ, λ_reg) that minimises validation log-loss; ties broken by lower Brier. Chosen pair: **ξ = ${chosen.xi}, λ_reg = ${chosen.lambdaReg}**.`,
    '',
    renderGridTable(grid, chosen.xi, chosen.lambdaReg),
    '',
    '## Headline — holdout (seasons 2018-19 .. 2024-25)',
    '',
    renderOverallTable(holdoutReport.predictors),
    '',
    '## Phase 8C legacy baseline run (seasons 2016-17 .. 2024-25)',
    '',
    'Same predictors and pipeline as Phase 8C, scored over the legacy 2016-08-01 cut so the original gates 1–3 remain inspectable on each run.',
    '',
    renderOverallTable([legacyU, legacyR, legacyM]),
    '',
    '## Per-season Brier and log-loss',
    '',
    '`(val)` marks the validation seasons used for Phase 8B hyperparameter selection.',
    '',
    renderSeasonTable(holdoutReport.predictors, ['2016-17', '2017-18']),
    '',
    '## Reliability diagrams (10-bin) — holdout',
    '',
    ...calibrations.flatMap((c) => [renderCalibrationTable(c.name, c.bins), '']),
    '## Gates',
    '',
    `- ${g1.line}`,
    `- ${g2.line}`,
    `- ${g3.line}`,
    `- ${gA.line}`,
    `- ${gB.line}`,
    `- ${gC}`,
    `- ${gD.line}`,
    '',
    `- ${runtimeLine}`,
    '',
    '## Notes',
    '',
    '- Closing-line odds (Bet365 preferred, Pinnacle fallback) are converted',
    '  to implied probabilities by proportional removal of the bookmaker',
    '  overround — the standard first-order method.',
    '- Dixon-Coles tuning is leakage-safe: validation seasons 2016-17 + 2017-18',
    '  decide (ξ, λ_reg); the headline table is computed on disjoint seasons',
    '  2018-19 .. 2024-25 with the chosen pair.',
    '- The lazy-refit predictor refits at most once per calendar date using',
    '  strictly-prior matches (no-lookahead invariant; tested).',
    '- Promoted-team cold start initialises α = δ = 0 (league average); ridge',
    '  keeps them near that mean until enough matches accumulate. See',
    '  `docs/16_MODEL_V02_CANDIDATE.md` for the honest-limitations list.',
    '',
  ].join('\n');
  writeFileSync(REPORT_MD_PATH, md);

  // -------------------------------------------------------------------------
  // Full-detail JSON (gitignored). Carries everything including the per-pair
  // calibration arrays and the DC stats.
  // -------------------------------------------------------------------------
  mkdirSync(resolve(process.cwd(), 'data', 'processed'), { recursive: true });
  writeFileSync(
    REPORT_JSON_PATH,
    JSON.stringify(
      {
        generatedAt,
        runtimeMs,
        legacyEvalStartDate: legacyReport.evalStartDate,
        validation: { start: VALIDATION_START, end: VALIDATION_END, grid, chosen },
        holdout: {
          start: HOLDOUT_START,
          predictors: holdoutReport.predictors,
          calibrations,
        },
        legacy: { predictors: legacyReport.predictors },
        dcStats: dcFinal.stats(),
        gates: {
          gate1: g1.line,
          gate2: g2.line,
          gate3: g3.line,
          gateA: gA.line,
          gateB: gB.line,
          gateC: gC,
          gateD: gD.line,
        },
      },
      (_, v) => {
        // The DC stats `finalParams` carries the parameter arrays; suppress
        // them in the full report because the per-team α/δ values are not
        // useful with anonymised team indices. Aggregate-only.
        if (v && typeof v === 'object' && 'att' in v && 'def' in v && 'mu' in v) {
          return { mu: v.mu, homeAdv: v.homeAdv, rho: v.rho, nTeams: v.att.length };
        }
        return v;
      },
      2,
    ) + '\n',
  );

  // -------------------------------------------------------------------------
  // Console summary.
  // -------------------------------------------------------------------------
  process.stdout.write('\n');
  process.stdout.write(`${g1.line}\n${g2.line}\n${g3.line}\n${gA.line}\n${gB.line}\n${gC}\n${gD.line}\n\n`);
  process.stdout.write('Phase 8B tuning grid (validation 2016-17 + 2017-18):\n');
  process.stdout.write(renderGridTable(grid, chosen.xi, chosen.lambdaReg) + '\n\n');
  process.stdout.write('Holdout headline (seasons 2018-19 .. 2024-25):\n');
  process.stdout.write(renderOverallTable(holdoutReport.predictors) + '\n\n');
  process.stdout.write(`${runtimeLine}\n`);
  process.stdout.write(
    `Matches observed: ${holdoutReport.matchesObserved.toLocaleString()}; holdout scored: ${holdoutReport.matchesScored.toLocaleString()}; legacy scored: ${legacyReport.matchesScored.toLocaleString()}\n`,
  );
  const dcStats = dcFinal.stats();
  process.stdout.write(
    `Dixon-Coles candidate: refits=${dcStats.refits}, total iterations=${dcStats.totalIterations}, teams known=${dcStats.teamsKnown}\n`,
  );
}

main();
