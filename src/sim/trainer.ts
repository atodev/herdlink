import { computeFeatureVectors, FEATURE_NAMES } from './features';
import { createSim, setCondition, stepSim } from './herd';
import type { Condition } from './types';

/**
 * Training pipeline for the detection model. Pure TypeScript, no node or DOM
 * dependencies — runs in a node script (scripts/train.ts), in a Web Worker
 * behind the UI's "Retrain model" button, and anywhere else.
 */

export const CLASSES: Condition[] = ['healthy', 'ill', 'lame', 'oestrus'];

export interface TrainedModel {
  classes: string[];
  features: string[];
  weights: number[][];
  bias: number[];
  trainedAt: string;
  trainRows: number;
  testRows: number;
  /** held-out recall per class, same order as classes */
  recall: number[];
}

export interface Row {
  x: number[];
  y: number; // class index
}

export type TrainProgress =
  | { phase: 'simulate'; episode: number; episodes: number; rows: number }
  | { phase: 'fit'; epoch: number; epochs: number; loss: number };

const EPISODES = 12;
const HERD_SIZE = 60;
const STEP_MIN = 0.5;
/** condition must have been active this long before samples count as positive */
const ONSET_MIN = 150;
const EPOCHS = 400;

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

  while (sim.timeMin < endAt) {
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

function fit(
  rows: Row[],
  onProgress?: (p: TrainProgress) => void,
): { weights: number[][]; bias: number[] } {
  const nF = FEATURE_NAMES.length;
  const nC = CLASSES.length;
  const weights = Array.from({ length: nC }, () => new Array(nF).fill(0));
  const bias = new Array(nC).fill(0);
  const lr = 0.3;
  const l2 = 1e-4;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
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

    if (epoch % 50 === 0) onProgress?.({ phase: 'fit', epoch, epochs: EPOCHS, loss: loss / n });
  }
  return { weights, bias };
}

export function confusionMatrix(rows: Row[], weights: number[][], bias: number[]): number[][] {
  const nC = CLASSES.length;
  const confusion = Array.from({ length: nC }, () => new Array(nC).fill(0));
  for (const row of rows) {
    const logits = weights.map((w, c) => w.reduce((s, wi, i) => s + wi * row.x[i], bias[c]));
    const probs = softmax(logits);
    confusion[row.y][probs.indexOf(Math.max(...probs))]++;
  }
  return confusion;
}

/** Full pipeline: simulate episodes, fit, evaluate on a held-out split. */
export function trainModel(onProgress?: (p: TrainProgress) => void): TrainedModel {
  const rows: Row[] = [];
  for (let e = 0; e < EPISODES; e++) {
    runEpisode(rows);
    onProgress?.({ phase: 'simulate', episode: e + 1, episodes: EPISODES, rows: rows.length });
  }

  // Shuffle, hold out 20% for evaluation
  rows.sort(() => Math.random() - 0.5);
  const split = Math.floor(rows.length * 0.8);
  const trainRows = rows.slice(0, split);
  const testRows = rows.slice(split);

  const { weights, bias } = fit(trainRows, onProgress);
  const confusion = confusionMatrix(testRows, weights, bias);
  const recall = confusion.map((r, i) => r[i] / Math.max(1, r.reduce((a, b) => a + b, 0)));

  return {
    classes: CLASSES,
    features: [...FEATURE_NAMES],
    weights,
    bias,
    trainedAt: new Date().toISOString(),
    trainRows: trainRows.length,
    testRows: testRows.length,
    recall,
  };
}
