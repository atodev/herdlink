import { FEATURE_NAMES } from './features';
import bundled from './model.json';
import type { TrainedModel } from './trainer';

/**
 * Live inference for the trained detection model. The bundled model.json
 * (fitted by `npm run train`) is the default; the UI's "Retrain model"
 * button can replace it at runtime with one trained in a Web Worker, which
 * is then persisted to localStorage — so the demo stays fully static-hostable.
 */

const STORAGE_KEY = 'herdlink-model';

function isValid(m: unknown): m is TrainedModel {
  const c = m as TrainedModel;
  return (
    !!c &&
    Array.isArray(c.weights) &&
    Array.isArray(c.bias) &&
    Array.isArray(c.classes) &&
    c.weights.length === c.classes.length &&
    c.bias.length === c.classes.length &&
    c.weights.every((w) => Array.isArray(w) && w.length === FEATURE_NAMES.length)
  );
}

function loadStored(): TrainedModel | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let current: TrainedModel = loadStored() ?? (bundled as TrainedModel);

export const MODEL_CLASSES: string[] = current.classes;

export function currentModel(): TrainedModel {
  return current;
}

/** Swap the live model (e.g. freshly trained in the browser) and persist it. */
export function setModel(model: TrainedModel): void {
  if (!isValid(model)) throw new Error('model shape does not match feature set');
  current = model;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    // storage full/unavailable — model still active for this session
  }
}

/** Revert to the bundled model and clear the stored one. */
export function resetModel(): void {
  current = bundled as TrainedModel;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function predictProbs(z: number[]): number[] {
  const { weights, bias } = current;
  const logits = weights.map((w, c) => w.reduce((s, wi, i) => s + wi * z[i], bias[c]));
  const m = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}
