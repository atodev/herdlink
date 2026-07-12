/**
 * Seedable pseudo-random number generator, shared by the whole simulation
 * path so that evaluation runs are reproducible (see scripts/evaluate.ts).
 *
 * The live app never seeds it, so it defaults to an entropy-based seed and
 * stays visually varied. Deterministic runs call setSeed() first.
 */

let state = (Date.now() ^ 0x9e3779b9) >>> 0;

/** mulberry32 — small, fast, good enough for a behavioural simulation. */
function mulberry32(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Seed the generator for a reproducible run. */
export function setSeed(seed: number): void {
  state = (seed >>> 0) || 1;
}

/** Uniform in [0, 1). Drop-in replacement for Math.random(). */
export function random(): number {
  return mulberry32();
}

/** Standard normal via Box–Muller (one sample). */
export function randn(): number {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
