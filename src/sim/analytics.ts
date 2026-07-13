import { computeFeatureVectors } from './features';
import { MODEL_CLASSES, predictProbs } from './model';
import { ASSOC_DECAY, computeSocial, pairKey, updateAssociation } from './social';
import type { SocialMetrics } from './social';

export { pairKey };
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

let nextAlertId = 1;

/** Run detection + association updates. Call every sim step; ticks itself every TICK_MIN. */
export function tickAnalytics(an: Analytics, sim: SimState): void {
  if (sim.timeMin < an.nextTickAt) return;
  an.nextTickAt = sim.timeMin + TICK_MIN;

  const cows = sim.cows;

  // --- Association graph: accumulate proximity, decay everything else ---
  updateAssociation(an.association, cows);

  // --- Social network metrics (bias-corrected association weights) ---
  an.tickCount++;
  const correction = 1 - Math.pow(ASSOC_DECAY, an.tickCount);
  an.social = computeSocial(cows, an.association, correction, an.social?.community ?? new Map());
  for (const cow of cows) {
    let h = an.strengthHistory.get(cow.id);
    if (!h) {
      h = [];
      an.strengthHistory.set(cow.id, h);
    }
    h.push(an.social.strength.get(cow.id) ?? 0);
    if (h.length > (24 * 60) / TICK_MIN) h.shift();
  }

  // --- Features and herd baselines (telemetry + social) ---
  const { byId, herd } = computeFeatureVectors(sim, {
    strength: an.social.strength,
    strengthHistory: an.strengthHistory,
  });

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
    const [speedZ, walkZ, rumZ, tempZ, distZ, , , , , dStrengthZ] = fs.z;

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
    if (dStrengthZ < -1.5) signals.push('social withdrawal — association strength falling vs her own baseline');

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

/**
 * Dismiss a cow's monitoring state: resolve its active alerts and reset its
 * anomaly score. Called when the user manually cures a cow (an operator
 * acknowledging the animal is well) so the alert and ring clear at once
 * instead of lingering while vitals settle.
 */
export function clearCow(an: Analytics, cowId: number, timeMin: number): void {
  for (const a of an.alerts) {
    if (a.cowId === cowId && a.resolvedAt === null) a.resolvedAt = timeMin;
  }
  an.assessments.delete(cowId);
}

/** Colour for a score, shared by paddock and network views. */
export function scoreColour(score: number): string | null {
  if (score > ALERT_AT) return '#e85a5a';
  if (score > WATCH_AT) return '#e8a15a';
  return null;
}
