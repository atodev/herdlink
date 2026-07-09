import type { Cow, SimState } from './types';

/**
 * The detection layer. It sees ONLY collar telemetry (position, speed,
 * behaviour, temperature, rumination) — never the injected ground-truth
 * condition — and scores each cow against the rest of the herd.
 */

export type Suspected = 'illness' | 'lameness' | 'oestrus';

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
}

export interface Analytics {
  assessments: Map<number, Assessment>;
  /** pair association weights, key = loId * 100000 + hiId, normalised 0–1 */
  association: Map<number, number>;
  alerts: Alert[];
  /** herd-mean baselines over time, for the comparison sparklines */
  herdHistory: HerdSample[];
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
/** history window for behaviour aggregates: 2 h of 5-min samples */
const WINDOW_SAMPLES = 24;

export function createAnalytics(): Analytics {
  return { assessments: new Map(), association: new Map(), alerts: [], herdHistory: [], nextTickAt: 0 };
}

export function pairKey(a: number, b: number): number {
  return a < b ? a * 100000 + b : b * 100000 + a;
}

interface CowFeatures {
  meanSpeed: number;
  walkFrac: number;
  rumination: number;
  temperature: number;
  centroidDist: number;
}

function features(cow: Cow, cx: number, cy: number): CowFeatures {
  const win = cow.history.slice(-WINDOW_SAMPLES);
  let meanSpeed = cow.avgSpeed;
  let walkFrac = 0;
  if (win.length > 0) {
    meanSpeed = win.reduce((s, h) => s + h.speed, 0) / win.length;
    walkFrac = win.filter((h) => h.behaviour === 'walking').length / win.length;
  }
  return {
    meanSpeed,
    walkFrac,
    rumination: cow.ruminationRate,
    temperature: cow.temperature,
    centroidDist: Math.hypot(cow.x - cx, cow.y - cy),
  };
}

function meanStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
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

  // --- Herd baselines ---
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

  an.herdHistory.push({
    t: sim.timeMin,
    speed: speedStats.mean,
    rumination: rumStats.mean,
    temperature: tempStats.mean,
  });
  if (an.herdHistory.length > (24 * 60) / TICK_MIN) an.herdHistory.shift();

  // Floors keep z-scores sane when the herd is perfectly synchronised
  const z = (v: number, s: { mean: number; std: number }, minStd: number) =>
    (v - s.mean) / Math.max(s.std, minStd);

  for (let i = 0; i < n; i++) {
    const cow = cows[i];
    const f = feats[i];

    const speedZ = z(f.meanSpeed, speedStats, 0.03);
    const walkZ = z(f.walkFrac, walkStats, 0.04);
    const rumZ = z(f.rumination, rumStats, 0.05);
    const tempZ = z(f.temperature, tempStats, 0.12);
    const distZ = z(f.centroidDist, distStats, 12);

    // Cause-specific scores, all scaled so ~2 means "clearly abnormal"
    const illness = 0.55 * Math.max(0, tempZ) + 0.45 * Math.max(0, -rumZ) + 0.35 * Math.max(0, distZ);
    const lameness = 0.9 * Math.max(0, -speedZ) + 0.35 * Math.max(0, distZ) - 0.6 * Math.max(0, tempZ);
    const oestrus = 0.9 * Math.max(0, walkZ) + 0.5 * Math.max(0, speedZ) - 0.5 * Math.max(0, -rumZ);

    const causes: [Suspected, number][] = [
      ['illness', illness],
      ['lameness', lameness],
      ['oestrus', oestrus],
    ];
    causes.sort((a, b) => b[1] - a[1]);
    const [topCause, raw] = causes[0];

    const prev = an.assessments.get(cow.id);
    // EWMA over ~45 sim-min so alerts need a sustained signal, not one bad sample
    const score = (prev?.score ?? 0) * 0.89 + Math.max(0, raw) * 0.11;

    const signals: string[] = [];
    if (tempZ > 1.2) signals.push(`temp ${f.temperature.toFixed(1)} °C (herd ${tempStats.mean.toFixed(1)})`);
    if (rumZ < -1.2) signals.push(`rumination ${Math.round(f.rumination * 60)} min/h vs herd ${Math.round(rumStats.mean * 60)}`);
    if (speedZ < -1.2) signals.push(`moving ${Math.round((1 - f.meanSpeed / Math.max(speedStats.mean, 0.01)) * 100)}% slower than herd`);
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
