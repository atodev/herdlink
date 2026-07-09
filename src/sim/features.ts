import type { Cow, SimState } from './types';

/**
 * Feature extraction shared by the live detector and the offline trainer.
 * Everything here is computed from collar telemetry only.
 */

/** history window for behaviour aggregates: 2 h of 5-min samples */
const WINDOW_SAMPLES = 24;

export const FEATURE_NAMES = [
  // herd-relative: how does she compare to everyone else right now
  'speedZ', 'walkZ', 'rumZ', 'tempZ', 'distZ',
  // self-relative: how does she compare to her own recent baseline —
  // separates "naturally slow cow" from "cow that just went slow"
  'dSpeedZ', 'dWalkZ', 'dRumZ',
] as const;

export interface CowFeatures {
  meanSpeed: number;
  walkFrac: number;
  rumination: number;
  temperature: number;
  centroidDist: number;
  /** recent 2 h minus own older baseline (2–24 h ago); 0 until history builds */
  dSpeed: number;
  dWalk: number;
  dRum: number;
}

export interface FeatureSet {
  /** herd-relative z-scores, ordered as FEATURE_NAMES */
  z: number[];
  raw: CowFeatures;
}

export interface HerdBaseline {
  speed: number;
  walkFrac: number;
  rumination: number;
  temperature: number;
}

function features(cow: Cow, cx: number, cy: number): CowFeatures {
  const win = cow.history.slice(-WINDOW_SAMPLES);
  let meanSpeed = cow.avgSpeed;
  let walkFrac = 0;
  if (win.length > 0) {
    meanSpeed = win.reduce((s, h) => s + h.speed, 0) / win.length;
    walkFrac = win.filter((h) => h.behaviour === 'walking').length / win.length;
  }

  // Own baseline: everything older than the 2 h window (up to 22 h of samples)
  const base = cow.history.slice(0, -WINDOW_SAMPLES);
  let dSpeed = 0;
  let dWalk = 0;
  let dRum = 0;
  if (base.length >= WINDOW_SAMPLES) {
    const baseSpeed = base.reduce((s, h) => s + h.speed, 0) / base.length;
    const baseWalk = base.filter((h) => h.behaviour === 'walking').length / base.length;
    const baseRum = base.reduce((s, h) => s + h.rumination, 0) / base.length;
    dSpeed = meanSpeed - baseSpeed;
    dWalk = walkFrac - baseWalk;
    dRum = cow.ruminationRate - baseRum;
  }

  return {
    meanSpeed,
    walkFrac,
    rumination: cow.ruminationRate,
    temperature: cow.temperature,
    centroidDist: Math.hypot(cow.x - cx, cow.y - cy),
    dSpeed,
    dWalk,
    dRum,
  };
}

function meanStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Herd-relative z-score vectors for every cow. Floors on the standard
 * deviations keep the scores sane when the herd is perfectly synchronised.
 */
export function computeFeatureVectors(sim: SimState): {
  byId: Map<number, FeatureSet>;
  herd: HerdBaseline;
} {
  const cows = sim.cows;
  const n = cows.length;

  let cx = 0;
  let cy = 0;
  for (const c of cows) {
    cx += c.x;
    cy += c.y;
  }
  cx /= n;
  cy /= n;

  const feats = cows.map((c) => features(c, cx, cy));
  const speedStats = meanStd(feats.map((f) => f.meanSpeed));
  const walkStats = meanStd(feats.map((f) => f.walkFrac));
  const rumStats = meanStd(feats.map((f) => f.rumination));
  const tempStats = meanStd(feats.map((f) => f.temperature));
  const distStats = meanStd(feats.map((f) => f.centroidDist));
  const dSpeedStats = meanStd(feats.map((f) => f.dSpeed));
  const dWalkStats = meanStd(feats.map((f) => f.dWalk));
  const dRumStats = meanStd(feats.map((f) => f.dRum));

  const z = (v: number, s: { mean: number; std: number }, minStd: number) =>
    (v - s.mean) / Math.max(s.std, minStd);

  const byId = new Map<number, FeatureSet>();
  for (let i = 0; i < n; i++) {
    const f = feats[i];
    byId.set(cows[i].id, {
      z: [
        z(f.meanSpeed, speedStats, 0.03),
        z(f.walkFrac, walkStats, 0.04),
        z(f.rumination, rumStats, 0.05),
        z(f.temperature, tempStats, 0.12),
        z(f.centroidDist, distStats, 12),
        z(f.dSpeed, dSpeedStats, 0.03),
        z(f.dWalk, dWalkStats, 0.04),
        z(f.dRum, dRumStats, 0.04),
      ],
      raw: f,
    });
  }

  return {
    byId,
    herd: {
      speed: speedStats.mean,
      walkFrac: walkStats.mean,
      rumination: rumStats.mean,
      temperature: tempStats.mean,
    },
  };
}
