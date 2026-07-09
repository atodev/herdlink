/**
 * Offline trainer for the detection model.
 *
 * Runs randomised herd-simulation episodes, injects ground-truth conditions,
 * harvests herd-relative feature vectors labelled by condition, and fits a
 * multinomial logistic regression. Weights land in src/sim/model.json and are
 * bundled into the browser app for live inference.
 *
 *   npm run train
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFeatureVectors, FEATURE_NAMES } from '../src/sim/features';
import { createSim, setCondition, stepSim } from '../src/sim/herd';
import type { Condition } from '../src/sim/types';

const CLASSES: Condition[] = ['healthy', 'ill', 'lame', 'oestrus'];

const EPISODES = 12;
const HERD_SIZE = 60;
const STEP_MIN = 0.5;
/** condition must have been active this long before samples count as positive */
const ONSET_MIN = 150;

interface Row {
  x: number[];
  y: number; // class index
}

function runEpisode(rows: Row[]): void {
  const sim = createSim(HERD_SIZE);
  const startMin = sim.timeMin;
  const injectAt = startMin + 18 * 60;
  const endAt = startMin + 36 * 60;

  // Two cows per condition, chosen up front
  const shuffled = [...sim.cows].sort(() => Math.random() - 0.5);
  const plan: { cowId: number; condition: Condition }[] = [
    ...shuffled.slice(0, 2).map((c) => ({ cowId: c.id, condition: 'ill' as Condition })),
    ...shuffled.slice(2, 4).map((c) => ({ cowId: c.id, condition: 'lame' as Condition })),
    ...shuffled.slice(4, 6).map((c) => ({ cowId: c.id, condition: 'oestrus' as Condition })),
  ];
  let injected = false;

  let nextSampleAt = startMin + 12 * 60; // let telemetry buffers warm up first

  for (let t = sim.timeMin; t < endAt; t = sim.timeMin) {
    stepSim(sim, STEP_MIN);

    if (!injected && sim.timeMin >= injectAt) {
      for (const p of plan) {
        const cow = sim.cows.find((c) => c.id === p.cowId)!;
        setCondition(cow, p.condition, sim.timeMin);
      }
      injected = true;
    }

    if (sim.timeMin >= nextSampleAt) {
      nextSampleAt = sim.timeMin + 15;
      const { byId } = computeFeatureVectors(sim);

      const conditioned = sim.cows.filter(
        (c) =>
          c.condition !== 'healthy' &&
          c.conditionSince !== null &&
          sim.timeMin - c.conditionSince >= ONSET_MIN,
      );
      for (const cow of conditioned) {
        rows.push({ x: byId.get(cow.id)!.z, y: CLASSES.indexOf(cow.condition) });
      }

      // Match with random healthy cows to keep classes roughly balanced
      const healthy = sim.cows.filter((c) => c.condition === 'healthy');
      const take = injected ? conditioned.length || 2 : 3;
      for (let i = 0; i < take; i++) {
        const cow = healthy[Math.floor(Math.random() * healthy.length)];
        rows.push({ x: byId.get(cow.id)!.z, y: 0 });
      }
    }
  }
}

function softmax(logits: number[]): number[] {
  const m = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - m));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / s);
}

function train(rows: Row[]): { weights: number[][]; bias: number[] } {
  const nF = FEATURE_NAMES.length;
  const nC = CLASSES.length;
  const weights = Array.from({ length: nC }, () => new Array(nF).fill(0));
  const bias = new Array(nC).fill(0);
  const lr = 0.3;
  const l2 = 1e-4;
  const epochs = 400;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = Array.from({ length: nC }, () => new Array(nF).fill(0));
    const gradB = new Array(nC).fill(0);
    let loss = 0;

    for (const row of rows) {
      // Healthy errors weighted heavily: on-farm, false alarms cost trust.
      // Precision on healthy > recall on conditions (which are sustained
      // anyway, so smoothing still catches them).
      const rowW = row.y === 0 ? 3 : 1;
      const logits = weights.map((w, c) => w.reduce((s, wi, i) => s + wi * row.x[i], bias[c]));
      const probs = softmax(logits);
      loss -= rowW * Math.log(Math.max(probs[row.y], 1e-12));
      for (let c = 0; c < nC; c++) {
        const err = rowW * (probs[c] - (c === row.y ? 1 : 0));
        gradB[c] += err;
        for (let i = 0; i < nF; i++) gradW[c][i] += err * row.x[i];
      }
    }

    const n = rows.length;
    for (let c = 0; c < nC; c++) {
      bias[c] -= (lr * gradB[c]) / n;
      for (let i = 0; i < nF; i++) {
        weights[c][i] -= lr * (gradW[c][i] / n + l2 * weights[c][i]);
      }
    }

    if (epoch % 100 === 0) console.log(`epoch ${epoch}  loss ${(loss / n).toFixed(4)}`);
  }
  return { weights, bias };
}

function evaluate(rows: Row[], weights: number[][], bias: number[]): void {
  const nC = CLASSES.length;
  const confusion = Array.from({ length: nC }, () => new Array(nC).fill(0));
  for (const row of rows) {
    const logits = weights.map((w, c) => w.reduce((s, wi, i) => s + wi * row.x[i], bias[c]));
    const probs = softmax(logits);
    const pred = probs.indexOf(Math.max(...probs));
    confusion[row.y][pred]++;
  }
  console.log('\nconfusion (rows = truth):');
  console.log(['', ...CLASSES].map((c) => c.padStart(9)).join(''));
  confusion.forEach((r, i) => {
    const total = r.reduce((a, b) => a + b, 0);
    console.log(
      CLASSES[i].padStart(9) +
        r.map((v) => String(v).padStart(9)).join('') +
        `   recall ${((r[i] / Math.max(1, total)) * 100).toFixed(1)}%`,
    );
  });
}

// --- main ---
const rows: Row[] = [];
for (let e = 0; e < EPISODES; e++) {
  runEpisode(rows);
  console.log(`episode ${e + 1}/${EPISODES} — ${rows.length} rows`);
}

// Shuffle, hold out 20% for evaluation
rows.sort(() => Math.random() - 0.5);
const split = Math.floor(rows.length * 0.8);
const trainRows = rows.slice(0, split);
const testRows = rows.slice(split);

const { weights, bias } = train(trainRows);
evaluate(testRows, weights, bias);

const out = {
  classes: CLASSES,
  features: FEATURE_NAMES,
  weights,
  bias,
  trainedAt: new Date().toISOString(),
  trainRows: trainRows.length,
  testRows: testRows.length,
};
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/sim/model.json');
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`\nwrote ${dest}`);
