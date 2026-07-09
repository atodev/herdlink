import trained from './model.json';

/**
 * Live inference for the trained detection model (see scripts/train.ts).
 * Multinomial logistic regression over herd-relative z-features — small
 * enough to ship as JSON and evaluate in a few multiplies per cow.
 */

export const MODEL_CLASSES: string[] = trained.classes;

export function predictProbs(z: number[]): number[] {
  const logits = trained.weights.map(
    (w: number[], c: number) => w.reduce((s: number, wi: number, i: number) => s + wi * z[i], trained.bias[c]),
  );
  const m = Math.max(...logits);
  const exps = logits.map((l: number) => Math.exp(l - m));
  const sum = exps.reduce((a: number, b: number) => a + b, 0);
  return exps.map((e: number) => e / sum);
}
