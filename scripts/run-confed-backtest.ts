#!/usr/bin/env tsx
// =============================================================================
// scripts/run-confed-backtest.ts
// =============================================================================
// Phase 9B.2 — head-to-head backtest comparing the Phase 9B
// `dixon-coles-national` and the confederation-aware `dixon-coles-confed`
// variant on the SAME harness, SAME split, SAME corpus.
//
// Step 1: tune (xi, lambdaReg) for the confed variant on the validation
// window only. Phase 9B's chosen (0.0005, 0.5) is reused as-is — we don't
// re-tune the baseline. The grid spans the same xi values as 9B.
//
// Step 2: holdout run with FOUR predictors in one walk: uniform,
// simple-elo (the 9B baseline), dixon-coles-national (9B re-run for direct
// comparison), and dixon-coles-confed (the new variant tuned in step 1).
//
// Step 3: gate decision. confed-keep iff holdout log-loss < 9B holdout
// log-loss. Plus GATE D fitted-parameter sanity (incl. conf[] mean-zero).
//
// Output: stdout report. No file writes; this is a single STOP-1 artifact.
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EVAL_START_DATE,
  runBacktest,
  type PredictorReport,
} from '@/lib/backtest/harness';
import { calibrationBins, type CalibrationBin } from '@/lib/backtest/metrics';
import { createUniformPredictor } from '@/lib/backtest/baselines';
import { createDixonColesNationalPredictor } from '@/lib/backtest/national/dcPredictorNational';
import { createNationalEloPredictor } from '@/lib/backtest/national/nationalEloPredictor';
import { createDixonColesConfedPredictor } from '@/lib/backtest/national/dcPredictorConfed';
import { CONFEDERATIONS } from '@/lib/backtest/national/dixonColesConfed';
import { parseResults } from '@/lib/data/sources/internationalResults/parseResults';
import {
  resolveNation,
} from '@/lib/data/sources/internationalResults/teamMap';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'raw', 'international_results.csv');

const VALIDATION_START = '2014-01-01';
const VALIDATION_END = '2018-01-01';
const HOLDOUT_START = '2018-01-01';

// Phase 9B chosen pair — used both as the baseline and as a starting point for
// the confed model's tuning grid.
const PHASE_9B_XI = 0.0005;
const PHASE_9B_LAMBDA_REG = 0.5;

const XI_GRID = [0.0005, 0.0009, 0.0013, 0.0019] as const;
const LAMBDA_REG_GRID = [0.5, 1, 2] as const;

const GATE1_UNIFORM_BRIER = 2 / 3;
const GATE1_UNIFORM_LOGLOSS = Math.log(3);
const GATE1_TOLERANCE = 1e-4;

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}

function loadCorpus(): HistoricalMatch[] {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `run-confed-backtest: corpus not found at ${CORPUS_PATH}.`,
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

function countIntercontinental(
  corpus: ReadonlyArray<HistoricalMatch>,
  upToDate: string,
): number {
  let n = 0;
  for (const m of corpus) {
    if (m.dateIso >= upToDate) break;
    const cH = resolveNation(m.homeTeam).confederation;
    const cA = resolveNation(m.awayTeam).confederation;
    if (cH !== cA) n += 1;
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

function runTuningConfed(corpus: HistoricalMatch[]): {
  grid: GridRow[];
  chosen: { xi: number; lambdaReg: number };
} {
  const tuningCorpus = corpus.filter((m) => m.dateIso < HOLDOUT_START);
  const grid: GridRow[] = [];
  let bestLL = Number.POSITIVE_INFINITY;
  let chosen = { xi: XI_GRID[0] as number, lambdaReg: LAMBDA_REG_GRID[0] as number };
  for (const xi of XI_GRID) {
    for (const lambdaReg of LAMBDA_REG_GRID) {
      const dc = createDixonColesConfedPredictor({
        xi, lambdaReg,
        name: `confed-tune-${xi}-${lambdaReg}`,
        maxIterationsCold: 300,
        maxIterationsWarm: 50,
      });
      const report = runBacktest(tuningCorpus, [dc], {
        evalStartDate: VALIDATION_START,
        evalEndDate: VALIDATION_END,
      });
      const r = report.predictors[0];
      grid.push({
        xi, lambdaReg,
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

function renderGridTable(grid: GridRow[], xi: number, lambdaReg: number): string {
  const rows = grid.map((r) => {
    const tag = r.xi === xi && r.lambdaReg === lambdaReg ? '  ← chosen' : '';
    const hl = (Math.log(2) / r.xi).toFixed(0);
    return `| ${r.xi} | ${hl} | ${r.lambdaReg} | ${r.matches} | ${fmt(r.brier)} | ${fmt(r.logLoss)} | ${fmt(r.accuracy)}${tag} |`;
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

function main(): void {
  const t0 = Date.now();
  const corpus = loadCorpus();
  const burnIn = countInWindow(corpus, '0000-00-00', VALIDATION_START);
  const valCount = countInWindow(corpus, VALIDATION_START, VALIDATION_END);
  const holdoutCount = countInWindow(corpus, HOLDOUT_START);
  const interconAll = countIntercontinental(corpus, '9999-12-31');
  const interconPreHoldout = countIntercontinental(corpus, HOLDOUT_START);

  process.stdout.write('Phase 9B.2 — confed vs 9B baseline backtest\n');
  process.stdout.write(`  total parsed matches: ${corpus.length}\n`);
  process.stdout.write(`  burn-in (< ${VALIDATION_START}): ${burnIn}\n`);
  process.stdout.write(`  validation [${VALIDATION_START}, ${VALIDATION_END}): ${valCount}\n`);
  process.stdout.write(`  holdout    [${HOLDOUT_START}, present): ${holdoutCount}\n`);
  process.stdout.write(`  intercontinental matches all-time:    ${interconAll}\n`);
  process.stdout.write(`  intercontinental matches pre-holdout: ${interconPreHoldout}  ← effective sample for conf[] estimation by holdout-walk start\n\n`);

  // GATE 1 — uniform self-test.
  const uniformProbe = createUniformPredictor();
  const probeReport = runBacktest(corpus, [uniformProbe], { evalStartDate: HOLDOUT_START });
  const u0 = probeReport.predictors[0];
  const g1ok =
    Math.abs(u0.overall.brier - GATE1_UNIFORM_BRIER) <= GATE1_TOLERANCE &&
    Math.abs(u0.overall.logLoss - GATE1_UNIFORM_LOGLOSS) <= GATE1_TOLERANCE;
  if (!g1ok) {
    process.stderr.write('GATE 1 FAILED — metric implementation bug suspected.\n');
    process.exit(1);
  }
  process.stdout.write(`GATE 1 (analytic self-test): PASS — uniform Brier=${fmt(u0.overall.brier, 6)}, log-loss=${fmt(u0.overall.logLoss, 6)}\n\n`);

  // Tune confed model.
  process.stdout.write('Tuning dixon-coles-confed on validation window …\n');
  const tTune = Date.now();
  const { grid, chosen } = runTuningConfed(corpus);
  process.stdout.write(`  tuning runtime: ${((Date.now() - tTune) / 1000).toFixed(1)}s\n`);
  process.stdout.write(`  chosen: ξ=${chosen.xi}, λ_reg=${chosen.lambdaReg} (half-life ≈ ${(Math.log(2) / chosen.xi).toFixed(0)} days)\n\n`);

  // Holdout run with FOUR predictors.
  process.stdout.write('Running holdout backtest (uniform / simple-elo / 9B / confed) …\n');
  const tHold = Date.now();
  const uniform = createUniformPredictor();
  const elo = createNationalEloPredictor({});
  const dc9b = createDixonColesNationalPredictor({
    xi: PHASE_9B_XI,
    lambdaReg: PHASE_9B_LAMBDA_REG,
    name: 'dixon-coles-national',
  });
  const dcConfed = createDixonColesConfedPredictor({
    xi: chosen.xi,
    lambdaReg: chosen.lambdaReg,
    name: 'dixon-coles-confed',
  });
  const holdout = runBacktest(corpus, [uniform, elo, dc9b, dcConfed], {
    evalStartDate: HOLDOUT_START,
  });
  process.stdout.write(`  holdout runtime: ${((Date.now() - tHold) / 1000).toFixed(1)}s\n\n`);

  const [hU, hE, hDC, hCF] = holdout.predictors;

  // GATE A — confed must beat 9B AND uniform on log-loss; report Brier too.
  const beatsUniformLL = hCF.overall.logLoss < hU.overall.logLoss;
  const beats9bLL = hCF.overall.logLoss < hDC.overall.logLoss;
  const gateAOk = beatsUniformLL && beats9bLL;

  // GATE D — confed model fitted-parameter sanity.
  const confStats = dcConfed.stats();
  const params = confStats.finalParams;
  let gateDOk = false;
  let gateDLine: string;
  if (params == null) {
    gateDLine = 'GATE D (fitted-param sanity): FAIL — no final params produced';
  } else {
    const meanA = params.att.reduce((a, b) => a + b, 0) / Math.max(1, params.att.length);
    const meanD = params.def.reduce((a, b) => a + b, 0) / Math.max(1, params.def.length);
    const meanC = params.conf.reduce((a, b) => a + b, 0) / Math.max(1, params.conf.length);
    const homeAdvOk = params.homeAdv > 0;
    const rhoOk = params.rho > -0.2 && params.rho < 0.05;
    const recOk = Math.abs(meanA) < 1e-8 && Math.abs(meanD) < 1e-8 && Math.abs(meanC) < 1e-8;
    let mono = true;
    for (let i = 1; i < confStats.lastObjectives.length; i += 1) {
      if (confStats.lastObjectives[i] < confStats.lastObjectives[i - 1] - 1e-9) {
        mono = false;
        break;
      }
    }
    gateDOk = homeAdvOk && rhoOk && recOk && mono;
    gateDLine = `GATE D: ${gateDOk ? 'PASS' : 'FAIL'} — homeAdv=${fmt(params.homeAdv, 4)}, ρ=${fmt(params.rho, 4)}, |mean(α)|=${fmt(Math.abs(meanA), 11)}, |mean(δ)|=${fmt(Math.abs(meanD), 11)}, |mean(conf)|=${fmt(Math.abs(meanC), 11)}, final-fit monotone=${mono}`;
  }

  // Calibration tables.
  const dc9bCal = calibrationBins(hDC.calibration, 10);
  const dcCfCal = calibrationBins(hCF.calibration, 10);

  // ---------------- STOP 1 REPORT --------------------
  const runtimeMs = Date.now() - t0;
  process.stdout.write('\n========== STOP 1 — Phase 9B.2 report ==========\n\n');
  process.stdout.write(`## Setup\n\n`);
  process.stdout.write(`  baseline   : dixon-coles-national (Phase 9B chosen ξ=${PHASE_9B_XI}, λ_reg=${PHASE_9B_LAMBDA_REG})\n`);
  process.stdout.write(`  candidate  : dixon-coles-confed   (tuned on validation only)\n`);
  process.stdout.write(`  validation : [${VALIDATION_START}, ${VALIDATION_END})  ${valCount} matches\n`);
  process.stdout.write(`  holdout    : >= ${HOLDOUT_START}             ${holdoutCount} matches\n`);
  process.stdout.write(`  intercontinental matches pre-holdout: ${interconPreHoldout}\n\n`);

  process.stdout.write('## Confed tuning grid (validation only)\n\n');
  process.stdout.write(renderGridTable(grid, chosen.xi, chosen.lambdaReg));
  process.stdout.write('\n\n');

  process.stdout.write('## Holdout headline\n\n');
  process.stdout.write(renderOverallTable(holdout.predictors));
  process.stdout.write('\n\n');

  if (params != null) {
    process.stdout.write('## Fitted confederation strengths (confed model, final fit)\n\n');
    process.stdout.write('| confederation | conf[c] |\n');
    process.stdout.write('|---------------|---------|\n');
    for (let k = 0; k < CONFEDERATIONS.length; k += 1) {
      process.stdout.write(`| ${CONFEDERATIONS[k].padEnd(13)} | ${fmt(params.conf[k], 4)} |\n`);
    }
    process.stdout.write(`\n  Σ conf[c] = ${fmt(params.conf.reduce((a, b) => a + b, 0), 11)} (recenter target: 0)\n`);
    process.stdout.write(`  μ       = ${fmt(params.mu, 5)}\n`);
    process.stdout.write(`  homeAdv = ${fmt(params.homeAdv, 5)}\n`);
    process.stdout.write(`  ρ       = ${fmt(params.rho, 5)}\n\n`);
  }

  process.stdout.write('## Calibration (holdout)\n\n');
  process.stdout.write(renderCalibrationTable('dixon-coles-national (9B baseline)', dc9bCal));
  process.stdout.write('\n\n');
  process.stdout.write(renderCalibrationTable('dixon-coles-confed (candidate)', dcCfCal));
  process.stdout.write('\n\n');

  // Side-by-side gap.
  const dBrier = hCF.overall.brier - hDC.overall.brier;
  const dLL = hCF.overall.logLoss - hDC.overall.logLoss;
  const dAcc = hCF.overall.accuracy - hDC.overall.accuracy;
  process.stdout.write('## Confed vs 9B gap (negative = confed wins)\n\n');
  process.stdout.write(`  ΔBrier   = ${fmt(dBrier, 6)}\n`);
  process.stdout.write(`  Δlog-loss= ${fmt(dLL, 6)}\n`);
  process.stdout.write(`  Δaccuracy= ${fmt(dAcc, 6)}\n\n`);

  process.stdout.write('## Gates\n\n');
  process.stdout.write(`  - GATE 1 (analytic self-test): PASS\n`);
  process.stdout.write(`  - GATE A (confed beats 9B on log-loss): ${gateAOk ? 'PASS — KEEP' : 'FAIL — DISCARD'}\n`);
  if (!beats9bLL) process.stdout.write(`    confed log-loss ${fmt(hCF.overall.logLoss)} NOT lower than 9B ${fmt(hDC.overall.logLoss)}\n`);
  if (!beatsUniformLL) process.stdout.write(`    confed does NOT beat uniform on log-loss\n`);
  process.stdout.write(`  - ${gateDLine}\n\n`);

  process.stdout.write(`Runtime: ${(runtimeMs / 1000).toFixed(1)}s\n\n`);
  process.stdout.write('========== END Phase 9B.2 report ==========\n');
}

main();
