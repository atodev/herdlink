import { computeFeatureVectors } from './features';
import { MODEL_CLASSES, predictProbs } from './model';
import { computeSocial } from './social';
import type { SocialMetrics } from './social';
import type { SimState } from './types';

/**
 * The detection layer. It sees ONLY collar telemetry (position, speed,
 * behaviour, temperature, rumination) — never the injected ground-truth
 * condition. Herd-relative z-features (src/sim/features.ts) feed a trained
 * multinomial logistic regression (src/sim/model.json, fitted offline by
 * scripts/train.ts); the z-scores double as human-readable alert signals.
 */

export type Suspected = 'illness' | 'lameness' | 'oestrus';

/** model classes are ground-truth condition names; alerts speak farmer */
const SUSPECTED_BY_CLASS: Record<string, Suspected> = {
  ill: 'illness',
  lame: 'lameness',
  oestrus: 'oestrus',
};

export interface Assessment {
  cowId: number;
  /** smoothed anomaly score; >WATCH_AT amber, >ALERT_AT red */
  score: number;
  suspected: Suspected | null;
  /** human-readable contributing signals */
  signals: string[];
}

export interface Alert {
  id: number;
  cowId: number;
  cowName: string;
  raisedAt: number;
  resolvedAt: number | null;
  suspected: Suspected;
  message: string;
}

export interface HerdSample {
  t: number;
  speed: number;
  rumination: number;
  temperature: number;
  /** herd-mean social strength (weighted degree) */
  socialStrength: number;
}

export interface Analytics {
  assessments: Map<number, Assessment>;
  /** pair association weights, key = loId * 100000 + hiId, normalised 0–1 */
  association: Map<number, number>;
  alerts: Alert[];
  /** herd-mean baselines over time, for the comparison sparklines */
  herdHistory: HerdSample[];
  /** social network metrics, refreshed every tick */
  social: SocialMetrics | null;
  /** per-cow social strength over time (24 h ring, one point per tick) */
  strengthHistory: Map<number, number[]>;
  /** ticks elapsed, for bias-correcting the association EWMA */
  tickCount: number;
  nextTickAt: number;
}

export const WATCH_AT = 1.2;
export const ALERT_AT = 2.0;
const RESOLVE_AT = 1.0;

const TICK_MIN = 5;
/** association decay per tick — half-life ≈ 4 h */
const DECAY = 0.985;
/** cows within this range are "associating" */
const PROXIMITY_M = 15;

export function createAnalytics(): Analytics {
  return {
    assessments: new Map(),
    association: new Map(),
    alerts: [],
    herdHistory: [],
    social: null,
    strengthHistory: new Map(),
    tickCount: 0,
    nextTickAt: 0,
  };
}

export function pairKey(a: number, b: number): number {
  return a < b ? a * 100000 + b : b * 100000 + a;
}

let nextAlertId = 1;

/** Run detection + association updates. Call every sim step; ticks itself every TICK_MIN. */
export function tickAnalytics(an: Analytics, sim: SimState): void {
  if (sim.timeMin < an.nextTickAt) return;
  an.nextTickAt = sim.timeMin + TICK_MIN;

  const cows = sim.cows;
  const n = cows.length;

  // --- Association graph: accumulate proximity, decay everything else ---
  for (const [k, w] of an.association) {
    const dw = w * DECAY;
    if (dw < 0.01) an.association.delete(k);
    else an.association.set(k, dw);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(cows[i].x - cows[j].x, cows[i].y - cows[j].y);
      if (d < PROXIMITY_M) {
        const k = pairKey(cows[i].id, cows[j].id);
        // (1 - DECAY) increment → weight settles at "fraction of time together"
        an.association.set(k, (an.association.get(k) ?? 0) + (1 - DECAY));
      }
    }
  }

  // --- Social network metrics (bias-corrected association weights) ---
  an.tickCount++;
  const correction = 1 - Math.pow(DECAY, an.tickCount);
  an.social = computeSocial(cows, an.association, pairKey, correction, an.social?.community ?? new Map());
  for (const cow of cows) {
    let h = an.strengthHistory.get(cow.id);
    if (!h) {
      h = [];
      an.strengthHistory.set(cow.id, h);
    }
    h.push(an.social.strength.get(cow.id) ?? 0);
    if (h.length > (24 * 60) / TICK_MIN) h.shift();
  }

  // --- Features and herd baselines ---
  const { byId, herd } = computeFeatureVectors(sim);

  an.herdHistory.push({
    t: sim.timeMin,
    speed: herd.speed,
    rumination: herd.rumination,
    temperature: herd.temperature,
    socialStrength: an.social.meanStrength,
  });
  if (an.herdHistory.length > (24 * 60) / TICK_MIN) an.herdHistory.shift();

  for (const cow of cows) {
    const fs = byId.get(cow.id)!;
    const [speedZ, walkZ, rumZ, tempZ, distZ] = fs.z;

    // --- Trained model inference ---
    const probs = predictProbs(fs.z);
    const pHealthy = probs[0];
    let top = 1;
    for (let c = 2; c < probs.length; c++) if (probs[c] > probs[top]) top = c;
    const topCause = SUSPECTED_BY_CLASS[MODEL_CLASSES[top]];
    // score scaled so ALERT_AT (2.0) needs P(healthy) ≈ 0.1 sustained — the
    // model must be confidently, persistently wrong about "healthy" to page
    const raw = 2.2 * (1 - pHealthy);

    const prev = an.assessments.get(cow.id);
    // EWMA over ~1 sim-hour so alerts need a sustained signal, not one bad sample
    const score = (prev?.score ?? 0) * 0.92 + raw * 0.08;

    const f = fs.raw;
    const signals: string[] = [];
    if (tempZ > 1.2) signals.push(`temp ${f.temperature.toFixed(1)} °C (herd ${herd.temperature.toFixed(1)})`);
    if (rumZ < -1.2) signals.push(`rumination ${Math.round(f.rumination * 60)} min/h vs herd ${Math.round(herd.rumination * 60)}`);
    if (speedZ < -1.2) signals.push(`moving ${Math.round((1 - f.meanSpeed / Math.max(herd.speed, 0.01)) * 100)}% slower than herd`);
    if (walkZ > 1.5) signals.push('restless — walking far more than herd');
    if (distZ > 1.5) signals.push(`${Math.round(f.centroidDist)} m from herd centre`);

    an.assessments.set(cow.id, {
      cowId: cow.id,
      score,
      suspected: score > WATCH_AT ? topCause : null,
      signals,
    });

    // --- Alert lifecycle ---
    const active = an.alerts.find((a) => a.cowId === cow.id && a.resolvedAt === null);
    if (!active && score > ALERT_AT) {
      const lead = signals[0] ?? 'sustained abnormal behaviour';
      an.alerts.unshift({
        id: nextAlertId++,
        cowId: cow.id,
        cowName: cow.name,
        raisedAt: sim.timeMin,
        resolvedAt: null,
        suspected: topCause,
        message: `${lead}${signals[1] ? `; ${signals[1]}` : ''} — possible ${topCause}`,
      });
      if (an.alerts.length > 40) an.alerts.pop();
    } else if (active && score < RESOLVE_AT) {
      active.resolvedAt = sim.timeMin;
    }
  }
}

/** Colour for a score, shared by paddock and network views. */
export function scoreColour(score: number): string | null {
  if (score > ALERT_AT) return '#e85a5a';
  if (score > WATCH_AT) return '#e8a15a';
  return null;
}
