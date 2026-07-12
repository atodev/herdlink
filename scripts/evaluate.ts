/**
 * Reproducible evaluation harness for the white paper.
 *
 * Runs R seeded replicates and reports statistics (means with 95% CIs,
 * latency distributions, feature-family ablations) for four experiments:
 *
 *   A  Classification    — held-out per-class precision/recall
 *   B  False positives   — alert rate on HEALTHY herds under four weather regimes
 *   C  Detection latency — time-to-alert for injected conditions
 *   D  Ablation          — B and C repeated for telemetry-only / +self / +social
 *                          feature families
 *
 * Everything is driven off a fixed base seed, so `npm run evaluate` twice
 * yields byte-identical output. Results land in whitepaper/data/ as CSV,
 * pgfplots .dat, \input-able .tex fragments, and a results.json.
 *
 *   npm run evaluate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnalytics, tickAnalytics } from '../src/sim/analytics';
import { FEATURE_NAMES } from '../src/sim/features';
import { createSim, setCondition, setWeatherMode, stepSim } from '../src/sim/herd';
import { setModel } from '../src/sim/model';
import { setSeed } from '../src/sim/rng';
import type { WeatherMode } from '../src/sim/types';
import {
  CLASSES,
  confusionMatrix,
  fit,
  harvestEpisode,
  type Row,
  type TrainedModel,
} from '../src/sim/trainer';

// --- configuration ------------------------------------------------------
const R = Number(process.env.REPLICATES ?? 30);
const BASE_SEED = 20260713;
const TRAIN_EPISODES = 6;
const TEST_EPISODES = 2;
const STEP_MIN = 0.5;

/** Feature-family ablation levels: number of leading features kept. */
const LEVELS = [
  { name: 'telemetry', k: 5 }, // herd-relative only
  { name: 'self', k: 8 }, // + self-baseline deltas
  { name: 'social', k: 10 }, // + social (full model)
] as const;

const REGIMES: WeatherMode[] = ['auto', 'heatwave', 'snow', 'rain'];
const CONDITIONS = ['ill', 'lame', 'oestrus'] as const;

// --- helpers ------------------------------------------------------------
const nF = FEATURE_NAMES.length;

/** Copy rows with all feature columns >= k zeroed (feature-family mask). */
function maskRows(rows: Row[], k: number): Row[] {
  return rows.map((r) => ({
    y: r.y,
    x: r.x.map((v, i) => (i < k ? v : 0)),
  }));
}

function trainMasked(trainRows: Row[], k: number): TrainedModel {
  const { weights, bias } = fit(maskRows(trainRows, k));
  return {
    classes: CLASSES,
    features: [...FEATURE_NAMES],
    weights,
    bias,
    trainedAt: new Date(0).toISOString(),
    trainRows: trainRows.length,
    testRows: 0,
    recall: [],
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 95% CI half-width (normal approximation). */
function ci95(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const varr = xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
  return 1.96 * Math.sqrt(varr / xs.length);
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// --- Experiment A: classification --------------------------------------
interface ClassStat {
  precision: number[];
  recall: number[];
}

function experimentA(models: TrainedModel[], testRowsPerRep: Row[][]): ClassStat {
  const nC = CLASSES.length;
  const precision: number[][] = Array.from({ length: nC }, () => []);
  const recall: number[][] = Array.from({ length: nC }, () => []);

  models.forEach((model, r) => {
    const conf = confusionMatrix(maskRows(testRowsPerRep[r], nF), model.weights, model.bias);
    for (let c = 0; c < nC; c++) {
      const tp = conf[c][c];
      const rowSum = conf[c].reduce((a, b) => a + b, 0); // actual c
      const colSum = conf.reduce((a, row) => a + row[c], 0); // predicted c
      recall[c].push(rowSum ? tp / rowSum : 1);
      precision[c].push(colSum ? tp / colSum : 1);
    }
  });

  return {
    precision: precision.map(mean),
    recall: recall.map(mean),
  };
}

// --- Experiment B: false-positive rate on healthy herds ----------------
/** Alerts raised on a HEALTHY herd over `hours`, per cow-day. */
function healthyAlertRate(seed: number, regime: WeatherMode, hours: number): number {
  setSeed(seed);
  const sim = createSim(60);
  if (regime !== 'auto') setWeatherMode(sim, regime);
  const an = createAnalytics();
  const steps = (hours * 60) / STEP_MIN;
  for (let i = 0; i < steps; i++) {
    stepSim(sim, STEP_MIN);
    if (regime !== 'auto') setWeatherMode(sim, regime); // hold the forced front
    tickAnalytics(an, sim);
  }
  const raised = an.alerts.filter((a) => a.raisedAt >= sim.timeMin - hours * 60).length;
  return raised / (sim.cows.length * (hours / 24));
}

// --- Experiment C: detection latency -----------------------------------
/** Minutes from injection to first alert on the affected cow; NaN if never. */
function detectionLatency(
  seed: number,
  condition: (typeof CONDITIONS)[number],
  warmupH: number,
  postH: number,
): number {
  setSeed(seed);
  const sim = createSim(60);
  const an = createAnalytics();
  const warmSteps = (warmupH * 60) / STEP_MIN;
  for (let i = 0; i < warmSteps; i++) {
    stepSim(sim, STEP_MIN);
    tickAnalytics(an, sim);
  }
  // Pick a currently well-connected, healthy cow to afflict
  const target = sim.cows[Math.floor(sim.cows.length / 2)];
  setCondition(target, condition, sim.timeMin);
  const injectAt = sim.timeMin;

  const postSteps = (postH * 60) / STEP_MIN;
  for (let i = 0; i < postSteps; i++) {
    stepSim(sim, STEP_MIN);
    tickAnalytics(an, sim);
    const hit = an.alerts.find((a) => a.cowId === target.id && a.raisedAt >= injectAt);
    if (hit) return hit.raisedAt - injectAt;
  }
  return NaN;
}

// --- run ----------------------------------------------------------------
console.log(`Evaluation: ${R} replicates, base seed ${BASE_SEED}`);
console.time('total');

// Train one model per ablation level per replicate, off shared episode data.
const models: Record<string, TrainedModel[]> = { telemetry: [], self: [], social: [] };
const testRowsPerRep: Row[][] = [];

for (let r = 0; r < R; r++) {
  const trainRows: Row[] = [];
  for (let e = 0; e < TRAIN_EPISODES; e++) trainRows.push(...harvestEpisode(BASE_SEED + r * 100 + e));
  const testRows: Row[] = [];
  for (let e = 0; e < TEST_EPISODES; e++) testRows.push(...harvestEpisode(BASE_SEED + r * 100 + 50 + e));
  testRowsPerRep.push(testRows);
  for (const lvl of LEVELS) models[lvl.name].push(trainMasked(trainRows, lvl.k));
  process.stdout.write(`\r  trained replicate ${r + 1}/${R}`);
}
console.log();

// Experiment A (full model)
const clsStat = experimentA(models.social, testRowsPerRep);

// Experiments B & C across ablation levels
interface FpCell { mean: number; ci: number }
interface LatCell { median: number; iqrLo: number; iqrHi: number; detRate: number }
const fp: Record<string, Record<string, FpCell>> = {};
const lat: Record<string, Record<string, LatCell>> = {};

for (const lvl of LEVELS) {
  fp[lvl.name] = {};
  lat[lvl.name] = {};

  for (const regime of REGIMES) {
    const rates: number[] = [];
    for (let r = 0; r < R; r++) {
      setModel(models[lvl.name][r]);
      rates.push(healthyAlertRate(BASE_SEED + 900000 + r * 100, regime, 24));
    }
    fp[lvl.name][regime] = { mean: mean(rates), ci: ci95(rates) };
  }

  for (const cond of CONDITIONS) {
    const lats: number[] = [];
    let detected = 0;
    for (let r = 0; r < R; r++) {
      setModel(models[lvl.name][r]);
      const l = detectionLatency(BASE_SEED + 1900000 + r * 100, cond, 14, 12);
      if (!Number.isNaN(l)) {
        lats.push(l);
        detected++;
      }
    }
    lat[lvl.name][cond] = {
      median: quantile(lats, 0.5),
      iqrLo: quantile(lats, 0.25),
      iqrHi: quantile(lats, 0.75),
      detRate: detected / R,
    };
  }
  process.stdout.write(`\r  evaluated level ${lvl.name}   `);
}
console.log();
console.timeEnd('total');

// --- write outputs ------------------------------------------------------
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../whitepaper/data');
mkdirSync(outDir, { recursive: true });
const w = (name: string, content: string) => writeFileSync(join(outDir, name), content);

const results = {
  config: { replicates: R, baseSeed: BASE_SEED, trainEpisodes: TRAIN_EPISODES, testEpisodes: TEST_EPISODES },
  classification: { classes: CLASSES, precision: clsStat.precision, recall: clsStat.recall },
  falsePositives: fp,
  latency: lat,
};
w('results.json', JSON.stringify(results, null, 2));

// Experiment A: complete LaTeX table (self-contained so \input sits outside
// any alignment — inputting bare rows adjacent to a booktabs rule breaks).
{
  let rows = '';
  CLASSES.forEach((c, i) => {
    rows += `${c} & ${(clsStat.precision[i] * 100).toFixed(1)} & ${(clsStat.recall[i] * 100).toFixed(1)} \\\\\n`;
  });
  w(
    'expA_classification.tex',
    '\\begin{tabular}{lrr}\n\\toprule\nClass & Precision & Recall \\\\\n\\midrule\n' +
      rows +
      '\\bottomrule\n\\end{tabular}\n',
  );
}

// Experiment B: CSV + pgfplots .dat + LaTeX
{
  let csv = 'level,regime,fp_per_cowday,ci\n';
  for (const lvl of LEVELS) {
    for (const regime of REGIMES) {
      const cell = fp[lvl.name][regime];
      csv += `${lvl.name},${regime},${cell.mean.toFixed(4)},${cell.ci.toFixed(4)}\n`;
    }
  }
  w('expB_fp.csv', csv);

  // pgfplots grouped bars: rows = weather regime (x axis), cols = feature family
  let dat = 'regime ' + LEVELS.map((l) => l.name).join(' ') + '\n';
  for (const regime of REGIMES) {
    dat += regime;
    for (const lvl of LEVELS) dat += ` ${fp[lvl.name][regime].mean.toFixed(4)}`;
    dat += '\n';
  }
  w('expB_fp.dat', dat);

  let t = '';
  for (const regime of REGIMES) {
    const row = LEVELS.map((l) => {
      const c = fp[l.name][regime];
      return `${c.mean.toFixed(2)}\\,$\\pm$\\,${c.ci.toFixed(2)}`;
    });
    t += `${regime} & ${row.join(' & ')} \\\\\n`;
  }
  w(
    'expB_fp.tex',
    '\\begin{tabular}{lrrr}\n\\toprule\nRegime & Telemetry & +Self & +Social \\\\\n\\midrule\n' +
      t +
      '\\bottomrule\n\\end{tabular}\n',
  );
}

// Experiment C: CSV + pgfplots .dat + LaTeX
{
  let csv = 'level,condition,median_min,iqr_lo,iqr_hi,detection_rate\n';
  for (const lvl of LEVELS) {
    for (const cond of CONDITIONS) {
      const c = lat[lvl.name][cond];
      csv += `${lvl.name},${cond},${c.median.toFixed(1)},${c.iqrLo.toFixed(1)},${c.iqrHi.toFixed(1)},${c.detRate.toFixed(3)}\n`;
    }
  }
  w('expC_latency.csv', csv);

  // pgfplots grouped bar data: rows = condition, cols = level medians (hours)
  let dat = 'condition ' + LEVELS.map((l) => l.name).join(' ') + '\n';
  for (const cond of CONDITIONS) {
    dat += cond;
    for (const lvl of LEVELS) dat += ` ${(lat[lvl.name][cond].median / 60).toFixed(2)}`;
    dat += '\n';
  }
  w('expC_latency.dat', dat);

  let t = '';
  for (const cond of CONDITIONS) {
    const cells = LEVELS.map((l) => {
      const c = lat[l.name][cond];
      const med = Number.isNaN(c.median) ? '--' : (c.median / 60).toFixed(1);
      return `${med} & ${(c.detRate * 100).toFixed(0)}`;
    });
    t += `${cond} & ${cells.join(' & ')} \\\\\n`;
  }
  w(
    'expC_latency.tex',
    '\\begin{tabular}{lrrrrrr}\n\\toprule\n' +
      '& \\multicolumn{2}{c}{Telemetry} & \\multicolumn{2}{c}{+Self} & \\multicolumn{2}{c}{+Social} \\\\\n' +
      '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}\n' +
      'Condition & h & \\% & h & \\% & h & \\% \\\\\n\\midrule\n' +
      t +
      '\\bottomrule\n\\end{tabular}\n',
  );
}

// A machine-readable config + headline-number macro block for the paper,
// so prose cites exact figures without transcription.
const worstFp = Math.max(...LEVELS.flatMap((l) => REGIMES.map((rg) => fp[l.name][rg].mean)));
const socialWorstFp = Math.max(...REGIMES.map((rg) => fp.social[rg].mean));
const fmtH = (m: number) => (Number.isNaN(m) ? 'n/a' : (m / 60).toFixed(1));
const latImprove = (cond: (typeof CONDITIONS)[number]) =>
  ((lat.telemetry[cond].median - lat.social[cond].median) / 60).toFixed(1);
w(
  'config.tex',
  `\\newcommand{\\numreplicates}{${R}}\n` +
    `\\newcommand{\\baseseed}{${BASE_SEED}}\n` +
    `\\newcommand{\\numfeatures}{${nF}}\n` +
    `\\newcommand{\\trainepisodes}{${TRAIN_EPISODES}}\n` +
    `\\newcommand{\\healthyrecall}{${(clsStat.recall[0] * 100).toFixed(1)}}\n` +
    `\\newcommand{\\illrecall}{${(clsStat.recall[1] * 100).toFixed(1)}}\n` +
    `\\newcommand{\\worstfp}{${worstFp.toFixed(2)}}\n` +
    `\\newcommand{\\socialworstfp}{${socialWorstFp.toFixed(2)}}\n` +
    `\\newcommand{\\illlatsocial}{${fmtH(lat.social.ill.median)}}\n` +
    `\\newcommand{\\illlattelemetry}{${fmtH(lat.telemetry.ill.median)}}\n` +
    `\\newcommand{\\illlatgain}{${latImprove('ill')}}\n`,
);

console.log(`\nWrote ${outDir}`);
console.log('Classification recall:', CLASSES.map((c, i) => `${c} ${(clsStat.recall[i] * 100).toFixed(1)}%`).join('  '));
console.log('FP (social, per cow-day):', REGIMES.map((rg) => `${rg} ${fp.social[rg].mean.toFixed(2)}`).join('  '));
console.log('Latency medians (social, h):', CONDITIONS.map((c) => `${c} ${(lat.social[c].median / 60).toFixed(1)}`).join('  '));
