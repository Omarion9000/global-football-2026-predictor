#!/usr/bin/env tsx
// =============================================================================
// scripts/run-national-backtest.ts
// =============================================================================
// Phase 9B — match-level backtest of the Dixon-Coles candidate adapted for
// national-team data with neutral-venue handling.
//
// Source: the Phase 9A martj42 CSV at data/raw/international_results.csv,
// parsed through the Phase 9A `parseResults` (same top-tier filter). No DB
// reads — offline + deterministic + no env vars required.
//
// Three predictors evaluated on a chronologically-disjoint holdout:
//   - uniform                  : [1/3, 1/3, 1/3]
//   - simple-elo               : standard Elo with neutral-gated home bonus
//   - dixon-coles-national     : weighted-MLE DC with neutral-gated h
//
// Tuning: grid over (xi, lambdaReg) on a 4-year validation window. Holdout
// is the years that follow. rho is always fitted, never tuned.
//
// Gates:
//   GATE 1 (analytic self-test): uniform Brier = 2/3 ± 1e-4, log-loss = ln 3
//   GATE A : DC beats uniform AND simple-elo on Brier and log-loss (holdout).
//            If it does NOT beat Elo we report plainly — not silent failure.
//   GATE D (fitted-param sanity): homeAdv > 0; rho ∈ (-0.2, 0.05);
//            |mean(att)|,|mean(def)| < 1e-8; final-fit objective monotone.
//
// Output: stdout JSON-ish report. No file writes in this step.
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calibrationBins,
  type CalibrationBin,
} from '@/lib/backtest/metrics';
import {
  EVAL_START_DATE,
  runBacktest,
  type PredictorReport,
} from '@/lib/backtest/harness';
import { createUniformPredictor } from '@/lib/backtest/baselines';
import { createDixonColesNationalPredictor } from '@/lib/backtest/national/dcPredictorNational';
import { createNationalEloPredictor } from '@/lib/backtest/national/nationalEloPredictor';
import { parseResults } from '@/lib/data/sources/internationalResults/parseResults';
import {
  resolveNation,
} from '@/lib/data/sources/internationalResults/teamMap';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'raw', 'international_results.csv');

const VALIDATION_START = '2014-01-01';
const VALIDATION_END = '2018-01-01';
const HOLDOUT_START = '2018-01-01';

const XI_GRID = [0.0005, 0.0009, 0.0013, 0.0019] as const;
const LAMBDA_REG_GRID = [0.5, 1, 2] as const;

const GATE1_UNIFORM_BRIER = 2 / 3;
const GATE1_UNIFORM_LOGLOSS = Math.log(3);
const GATE1_TOLERANCE = 1e-4;

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}

function loadIntlCorpus(): HistoricalMatch[] {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `run-national-backtest: corpus not found at ${CORPUS_PATH}. ` +
        `Re-download with: curl -sSL -o data/raw/international_results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv`,
    );
  }
  const { matches } = parseResults(readFileSync(CORPUS_PATH, 'utf-8'));
  const out: HistoricalMatch[] = matches.map((m) => ({
    season: m.dateIso.slice(0, 4),
    dateIso: m.dateIso,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeGoals: m.homeScore,
    awayGoals: m.awayScore,
    neutral: m.neutral,
  }));
  out.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return out;
}

function countInWindow(
  corpus: ReadonlyArray<HistoricalMatch>,
  fromIso: string,
  toIso?: string,
): number {
  let n = 0;
  for (const m of corpus) {
    if (m.dateIso < fromIso) continue;
    if (toIso != null && m.dateIso >= toIso) continue;
    n += 1;
  }
  return n;
}

type GridRow = {
  xi: number;
  lambdaReg: number;
  matches: number;
  brier: number;
  logLoss: number;
  accuracy: number;
};

function runTuning(corpus: HistoricalMatch[]): {
  grid: GridRow[];
  chosen: { xi: number; lambdaReg: number };
} {
  // Tuning corpus: every match before the holdout start. We don't need to
  // observe holdout-era matches to compute validation scores.
  const tuningCorpus = corpus.filter((m) => m.dateIso < HOLDOUT_START);
  const grid: GridRow[] = [];
  let bestLL = Number.POSITIVE_INFINITY;
  let chosen = { xi: XI_GRID[0] as number, lambdaReg: LAMBDA_REG_GRID[0] as number };

  for (const xi of XI_GRID) {
    for (const lambdaReg of LAMBDA_REG_GRID) {
      const dc = createDixonColesNationalPredictor({
        xi,
        lambdaReg,
        name: `dc-tune-${xi}-${lambdaReg}`,
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
        matches: r.overall.matchesScored,
        brier: r.overall.brier,
        logLoss: r.overall.logLoss,
        accuracy: r.overall.accuracy,
      });
      if (r.overall.logLoss < bestLL) {
        bestLL = r.overall.logLoss;
        chosen = { xi, lambdaReg };
      }
    }
  }
  return { grid, chosen };
}

function renderGridTable(
  grid: GridRow[],
  chosenXi: number,
  chosenLambdaReg: number,
): string {
  const rows = grid.map((r) => {
    const tag =
      r.xi === chosenXi && r.lambdaReg === chosenLambdaReg ? '  ← chosen' : '';
    const halfLife = (Math.log(2) / r.xi).toFixed(0);
    return `| ${r.xi} | ${halfLife} | ${r.lambdaReg} | ${r.matches} | ${fmt(r.brier)} | ${fmt(r.logLoss)} | ${fmt(r.accuracy)}${tag} |`;
  });
  return [
    '| ξ      | half-life (days) | λ_reg | matches | Brier  | log-loss | accuracy |',
    '|--------|------------------|-------|---------|--------|----------|----------|',
    ...rows,
  ].join('\n');
}

function renderOverallTable(reports: PredictorReport[]): string {
  const rows = reports.map(
    (r) =>
      `| ${r.name.padEnd(28)} | ${r.overall.matchesScored} | ${fmt(r.overall.brier)} | ${fmt(r.overall.logLoss)} | ${fmt(r.overall.accuracy)} |`,
  );
  return [
    '| predictor                    | matches | Brier  | log-loss | accuracy |',
    '|------------------------------|---------|--------|----------|----------|',
    ...rows,
  ].join('\n');
}

function renderCalibrationTable(name: string, bins: CalibrationBin[]): string {
  const rows = bins.map((b, i) => {
    const lower = (i / bins.length).toFixed(1);
    const upper = i === bins.length - 1 ? '1.0' : ((i + 1) / bins.length).toFixed(1);
    return `| [${lower}, ${upper}${i === bins.length - 1 ? ']' : ')'} | ${b.count} | ${fmt(b.meanPredicted)} | ${fmt(b.empiricalRate)} |`;
  });
  return [
    `### ${name} reliability (10-bin)`,
    '',
    '| bin | n | mean predicted | empirical rate |',
    '|-----|---|----------------|----------------|',
    ...rows,
  ].join('\n');
}

function computePerConfederationAccuracy(
  corpus: HistoricalMatch[],
  predictorReports: PredictorReport[],
  evalStartDate: string,
): Record<string, Record<string, { matches: number; accuracy: number }>> {
  // Recompute per-confederation buckets without re-running predictions: the
  // harness has already produced per-match calibration pairs ordered by the
  // match stream. We re-walk the corpus chronologically and bucket by
  // home-team confederation.
  //
  // Implementation note: we don't have direct per-match predictions stored
  // per predictor; the harness only exposes calibration pairs (which are
  // pooled by class). To compute argmax accuracy per confederation we'd
  // need to re-run. To keep this cheap and avoid a second backtest pass, we
  // skip per-confederation argmax for now and report only the overall
  // accuracy from the harness output. The hook is left in place for a
  // future enhancement.
  return {};
}

function main(): void {
  const t0 = Date.now();
  const corpus = loadIntlCorpus();

  const burnInCount = countInWindow(corpus, '0000-00-00', VALIDATION_START);
  const valCount = countInWindow(corpus, VALIDATION_START, VALIDATION_END);
  const holdoutCount = countInWindow(corpus, HOLDOUT_START);

  process.stdout.write('Phase 9B — corpus loaded\n');
  process.stdout.write(`  total parsed matches: ${corpus.length}\n`);
  process.stdout.write(`  earliest: ${corpus[0]?.dateIso}\n`);
  process.stdout.write(`  latest:   ${corpus[corpus.length - 1]?.dateIso}\n`);
  process.stdout.write(`  burn-in (< ${VALIDATION_START}):   ${burnInCount}\n`);
  process.stdout.write(`  validation [${VALIDATION_START}, ${VALIDATION_END}): ${valCount}\n`);
  process.stdout.write(`  holdout    [${HOLDOUT_START}, present): ${holdoutCount}\n\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // GATE 1 — uniform self-test on the holdout window.
  // ─────────────────────────────────────────────────────────────────────────
  process.stdout.write('Running uniform self-test …\n');
  const uniformProbe = createUniformPredictor();
  const probeReport = runBacktest(corpus, [uniformProbe], {
    evalStartDate: HOLDOUT_START,
  });
  const uniformR = probeReport.predictors[0];
  const g1ok =
    Math.abs(uniformR.overall.brier - GATE1_UNIFORM_BRIER) <= GATE1_TOLERANCE &&
    Math.abs(uniformR.overall.logLoss - GATE1_UNIFORM_LOGLOSS) <= GATE1_TOLERANCE;
  const g1Line = `GATE 1 (analytic self-test): ${g1ok ? 'PASS' : 'FAIL'} — uniform Brier=${fmt(uniformR.overall.brier, 6)} (target ${fmt(GATE1_UNIFORM_BRIER, 6)} ± ${GATE1_TOLERANCE}), log-loss=${fmt(uniformR.overall.logLoss, 6)} (target ${fmt(GATE1_UNIFORM_LOGLOSS, 6)} ± ${GATE1_TOLERANCE})`;
  process.stdout.write(g1Line + '\n');
  if (!g1ok) {
    process.stderr.write('STOP: metric implementation bug suspected.\n');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 9B — tuning sweep.
  // ─────────────────────────────────────────────────────────────────────────
  process.stdout.write('\nPhase 9B — tuning Dixon-Coles national on validation window …\n');
  const tStartTune = Date.now();
  const { grid, chosen } = runTuning(corpus);
  process.stdout.write(`  tuning runtime: ${((Date.now() - tStartTune) / 1000).toFixed(1)}s\n`);
  process.stdout.write(`  chosen: ξ=${chosen.xi}, λ_reg=${chosen.lambdaReg} (half-life ≈ ${(Math.log(2) / chosen.xi).toFixed(0)} days)\n\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Holdout run: three predictors.
  // ─────────────────────────────────────────────────────────────────────────
  process.stdout.write('Running holdout backtest (uniform / simple-elo / dixon-coles-national) …\n');
  const tStartHoldout = Date.now();
  const uniform = createUniformPredictor();
  const elo = createNationalEloPredictor({});
  const dcFinal = createDixonColesNationalPredictor({
    xi: chosen.xi,
    lambdaReg: chosen.lambdaReg,
    name: 'dixon-coles-national',
  });
  const holdoutReport = runBacktest(corpus, [uniform, elo, dcFinal], {
    evalStartDate: HOLDOUT_START,
  });
  process.stdout.write(`  holdout runtime: ${((Date.now() - tStartHoldout) / 1000).toFixed(1)}s\n\n`);

  const [hU, hE, hDC] = holdoutReport.predictors;

  // ─────────────────────────────────────────────────────────────────────────
  // GATE A — DC beats uniform AND simple-elo on Brier and log-loss.
  // ─────────────────────────────────────────────────────────────────────────
  const beatsUniformBrier = hDC.overall.brier < hU.overall.brier;
  const beatsUniformLL = hDC.overall.logLoss < hU.overall.logLoss;
  const beatsEloBrier = hDC.overall.brier < hE.overall.brier;
  const beatsEloLL = hDC.overall.logLoss < hE.overall.logLoss;
  const gateAok = beatsUniformBrier && beatsUniformLL && beatsEloBrier && beatsEloLL;
  const gateALine = `GATE A (DC dominates uniform + simple-Elo, holdout): ${gateAok ? 'PASS' : 'FAIL'} — DC Brier ${fmt(hDC.overall.brier)} vs uniform ${fmt(hU.overall.brier)} / elo ${fmt(hE.overall.brier)}; DC log-loss ${fmt(hDC.overall.logLoss)} vs uniform ${fmt(hU.overall.logLoss)} / elo ${fmt(hE.overall.logLoss)}`;

  // Per-direction call-outs for clarity (report plainly when DC loses to Elo).
  const gateANotes: string[] = [];
  if (!beatsEloBrier) gateANotes.push(`  - DC does NOT beat simple-Elo on Brier (${fmt(hDC.overall.brier)} vs ${fmt(hE.overall.brier)}).`);
  if (!beatsEloLL) gateANotes.push(`  - DC does NOT beat simple-Elo on log-loss (${fmt(hDC.overall.logLoss)} vs ${fmt(hE.overall.logLoss)}).`);
  if (!beatsUniformBrier) gateANotes.push(`  - DC does NOT beat uniform on Brier (${fmt(hDC.overall.brier)} vs ${fmt(hU.overall.brier)}).`);
  if (!beatsUniformLL) gateANotes.push(`  - DC does NOT beat uniform on log-loss (${fmt(hDC.overall.logLoss)} vs ${fmt(hU.overall.logLoss)}).`);

  // ─────────────────────────────────────────────────────────────────────────
  // GATE D — fitted-parameter sanity.
  // ─────────────────────────────────────────────────────────────────────────
  const dcStats = dcFinal.stats();
  const params = dcStats.finalParams;
  let gateDok = false;
  let gateDLine: string;
  if (params == null) {
    gateDLine = 'GATE D (fitted-param sanity): FAIL — no final params produced';
  } else {
    const meanAtt = params.att.reduce((a, b) => a + b, 0) / Math.max(1, params.att.length);
    const meanDef = params.def.reduce((a, b) => a + b, 0) / Math.max(1, params.def.length);
    const homeAdvOk = params.homeAdv > 0;
    const rhoOk = params.rho > -0.2 && params.rho < 0.05;
    const recenteredOk = Math.abs(meanAtt) < 1e-8 && Math.abs(meanDef) < 1e-8;
    let monotone = true;
    for (let i = 1; i < dcStats.lastObjectives.length; i += 1) {
      if (dcStats.lastObjectives[i] < dcStats.lastObjectives[i - 1] - 1e-9) {
        monotone = false;
        break;
      }
    }
    gateDok = homeAdvOk && rhoOk && recenteredOk && monotone;
    gateDLine = `GATE D (fitted-param sanity): ${gateDok ? 'PASS' : 'FAIL'} — homeAdv=${fmt(params.homeAdv, 4)} (need > 0), ρ=${fmt(params.rho, 4)} (need ∈ (−0.2, 0.05)), |mean(α)|=${fmt(Math.abs(meanAtt), 11)}, |mean(δ)|=${fmt(Math.abs(meanDef), 11)}, final-fit monotone=${monotone}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calibration tables for the DC model.
  // ─────────────────────────────────────────────────────────────────────────
  const dcCal = calibrationBins(hDC.calibration, 10);
  const eloCal = calibrationBins(hE.calibration, 10);

  // ─────────────────────────────────────────────────────────────────────────
  // Print STOP 1 report.
  // ─────────────────────────────────────────────────────────────────────────
  const runtimeMs = Date.now() - t0;
  process.stdout.write('\n========== STOP 1 — Phase 9B report ==========\n\n');
  process.stdout.write('## Train / holdout split\n\n');
  process.stdout.write(`Burn-in window  : <  ${VALIDATION_START}        (${burnInCount} matches; observed only)\n`);
  process.stdout.write(`Validation      : [${VALIDATION_START}, ${VALIDATION_END})  (${valCount} matches; tuning only)\n`);
  process.stdout.write(`Holdout headline: >= ${HOLDOUT_START}             (${holdoutCount} matches; headline metrics)\n\n`);

  process.stdout.write('## Tuning grid (validation only)\n\n');
  process.stdout.write(renderGridTable(grid, chosen.xi, chosen.lambdaReg));
  process.stdout.write('\n\n');
  process.stdout.write(`Chosen: ξ=${chosen.xi}, λ_reg=${chosen.lambdaReg} (half-life ≈ ${(Math.log(2) / chosen.xi).toFixed(0)} days)\n\n`);

  process.stdout.write('## Holdout headline\n\n');
  process.stdout.write(renderOverallTable(holdoutReport.predictors));
  process.stdout.write('\n\n');

  process.stdout.write('## Calibration tables (holdout)\n\n');
  process.stdout.write(renderCalibrationTable('dixon-coles-national', dcCal));
  process.stdout.write('\n\n');
  process.stdout.write(renderCalibrationTable('simple-elo', eloCal));
  process.stdout.write('\n\n');

  process.stdout.write('## Gates\n\n');
  process.stdout.write(`- ${g1Line}\n`);
  process.stdout.write(`- ${gateALine}\n`);
  for (const note of gateANotes) process.stdout.write(`${note}\n`);
  process.stdout.write(`- ${gateDLine}\n`);
  process.stdout.write(`- Runtime: ${(runtimeMs / 1000).toFixed(1)}s\n\n`);

  if (params != null) {
    process.stdout.write('## Fitted Dixon-Coles parameters (final fit)\n\n');
    process.stdout.write(`- μ        = ${fmt(params.mu, 5)}\n`);
    process.stdout.write(`- homeAdv  = ${fmt(params.homeAdv, 5)}\n`);
    process.stdout.write(`- ρ        = ${fmt(params.rho, 5)}\n`);
    process.stdout.write(`- N teams  = ${params.att.length}\n`);
    process.stdout.write(`- DC refits=${dcStats.refits}, total iterations=${dcStats.totalIterations}\n\n`);
  }

  process.stdout.write('## Elo final state (top 10 by rating)\n\n');
  const eloRatings = elo.ratings();
  const sortedRatings = [...eloRatings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [team, r] of sortedRatings) {
    process.stdout.write(`  ${fmt(r, 1).padStart(8)}  ${team}\n`);
  }
  process.stdout.write('\n========== END Phase 9B report ==========\n');
}

main();
