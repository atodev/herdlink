import type { Cow } from './types';

/**
 * Social network analytics over the proximity-association graph.
 *
 * Association weights are EWMA-style accumulators (see analytics.ts), so a
 * young graph systematically underestimates tie strength; callers pass a
 * bias-correction factor (1 - decay^ticks) and we work with corrected weights
 * ≈ "fraction of recent time spent together".
 */

export interface SocialEdge {
  a: number;
  b: number;
  /** bias-corrected weight, 0–1 */
  w: number;
}

export interface SocialMetrics {
  /** display/analysis backbone: top-k ties per node ∪ all strong ties */
  edges: SocialEdge[];
  /** weighted degree: sum of corrected tie weights */
  strength: Map<number, number>;
  /** backbone degree */
  degree: Map<number, number>;
  /** local clustering coefficient on the backbone, 0–1 */
  clustering: Map<number, number>;
  /** community label per cow (label-propagation) */
  community: Map<number, number>;
  /** members per community label */
  communitySizes: Map<number, number>;
  /** backbone density: edges / possible edges */
  density: number;
  meanStrength: number;
}

/** ties above this (corrected) always shown */
const STRONG_TIE = 0.15;
/** each node also keeps its top-K ties, down to this floor */
const TOP_K = 3;
const TIE_FLOOR = 0.05;

export function computeSocial(
  cows: Cow[],
  association: Map<number, number>,
  pairKey: (a: number, b: number) => number,
  correction: number,
  prevCommunity: Map<number, number>,
): SocialMetrics {
  const ids = cows.map((c) => c.id);
  const n = ids.length;

  // Corrected weights for every stored pair, grouped per node
  const neighbours = new Map<number, { id: number; w: number }[]>();
  for (const id of ids) neighbours.set(id, []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const raw = association.get(pairKey(ids[i], ids[j]));
      if (!raw) continue;
      const w = Math.min(1, raw / correction);
      if (w < TIE_FLOOR) continue;
      neighbours.get(ids[i])!.push({ id: ids[j], w });
      neighbours.get(ids[j])!.push({ id: ids[i], w });
    }
  }

  // Backbone: strong ties ∪ per-node top-K
  const keep = new Set<number>();
  for (const id of ids) {
    const nbrs = neighbours.get(id)!;
    nbrs.sort((a, b) => b.w - a.w);
    nbrs.forEach((nb, rank) => {
      if (nb.w > STRONG_TIE || rank < TOP_K) keep.add(pairKey(id, nb.id));
    });
  }

  const edges: SocialEdge[] = [];
  const adj = new Map<number, Set<number>>();
  const strength = new Map<number, number>();
  for (const id of ids) {
    adj.set(id, new Set());
    strength.set(id, neighbours.get(id)!.reduce((s, nb) => s + nb.w, 0));
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const k = pairKey(ids[i], ids[j]);
      if (!keep.has(k)) continue;
      const raw = association.get(k);
      if (!raw) continue;
      edges.push({ a: ids[i], b: ids[j], w: Math.min(1, raw / correction) });
      adj.get(ids[i])!.add(ids[j]);
      adj.get(ids[j])!.add(ids[i]);
    }
  }

  // Local clustering coefficient (binary, on the backbone)
  const clustering = new Map<number, number>();
  const degree = new Map<number, number>();
  for (const id of ids) {
    const nbrs = [...adj.get(id)!];
    degree.set(id, nbrs.length);
    if (nbrs.length < 2) {
      clustering.set(id, 0);
      continue;
    }
    let links = 0;
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        if (adj.get(nbrs[i])!.has(nbrs[j])) links++;
      }
    }
    clustering.set(id, (2 * links) / (nbrs.length * (nbrs.length - 1)));
  }

  // Communities: weighted label propagation, seeded from the previous tick's
  // labels so colours stay stable frame to frame
  const label = new Map<number, number>();
  for (const id of ids) label.set(id, prevCommunity.get(id) ?? id);
  const wOf = new Map<number, number>();
  for (const e of edges) {
    wOf.set(pairKey(e.a, e.b), e.w);
  }
  for (let round = 0; round < 5; round++) {
    let changed = 0;
    for (const id of ids) {
      const votes = new Map<number, number>();
      for (const nb of adj.get(id)!) {
        const lw = wOf.get(pairKey(id, nb)) ?? 0;
        votes.set(label.get(nb)!, (votes.get(label.get(nb)!) ?? 0) + lw);
      }
      if (votes.size === 0) continue;
      let best = label.get(id)!;
      let bestV = votes.get(best) ?? 0;
      for (const [l, v] of votes) {
        if (v > bestV) {
          best = l;
          bestV = v;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed++;
      }
    }
    if (changed === 0) break;
  }

  const communitySizes = new Map<number, number>();
  for (const id of ids) {
    const l = label.get(id)!;
    communitySizes.set(l, (communitySizes.get(l) ?? 0) + 1);
  }

  let strengthSum = 0;
  for (const s of strength.values()) strengthSum += s;

  return {
    edges,
    strength,
    degree,
    clustering,
    community: label,
    communitySizes,
    density: n > 1 ? (2 * edges.length) / (n * (n - 1)) : 0,
    meanStrength: strengthSum / Math.max(1, n),
  };
}

const COMMUNITY_PALETTE = [
  '#4fc38a', '#5aa7e8', '#e8c15a', '#c77dd8',
  '#5ad8c9', '#e88a5a', '#8aa0e8', '#d8cf5a',
];

/** Stable colour for a community label. */
export function communityColour(label: number): string {
  return COMMUNITY_PALETTE[label % COMMUNITY_PALETTE.length];
}
