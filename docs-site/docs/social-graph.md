---
sidebar_position: 7
title: Social graph
---

# Social graph

Source: `src/sim/analytics.ts` (association tracking), `src/sim/social.ts` (network
metrics), `src/ui/NetworkView.tsx` (rendering). Toggle to it with **Social graph** in the
top bar.

## What it is

Cattle herds have real, stable social structure — grazing partners, companion pairs,
consistent neighbours. Because every collar reports position, that structure falls out of
the data for free: no extra sensor, just proximity over time.

## Building the network

**Association estimation.** Every 5 sim-minutes, each pair of cows within **15 m**
accumulates association weight through an exponentially-decaying accumulator
(half-life ≈ 4 h), so the network reflects *recent* social structure. Because an EWMA
systematically underestimates tie strength while it warms up, weights are
**bias-corrected** by 1 − λ^t (the same correction Adam applies to its moment
estimates) — the corrected weight is an unbiased estimate of *fraction of recent time
spent together* from the first minutes of data.

**Backbone extraction.** Proximity networks are dense and noisy, so the displayed and
analysed graph is a backbone: every tie above 0.15, **union each node's top-3 strongest
ties** (floor 0.05). The top-k rule keeps the graph readable and connected without a
single global threshold deciding everything — peripheral animals keep their few
meaningful ties instead of vanishing.

## Network metrics

Recomputed every tick and surfaced throughout the UI:

| Metric | Where shown | Meaning |
| --- | --- | --- |
| **Strength** (weighted degree) | node size, hover, sidebar, 24 h sparkline | Total association time — the cow's overall social embeddedness |
| **Degree** | hover, sidebar | Backbone ties |
| **Local clustering coefficient** | hover, sidebar | Do her companions also associate with each other? High = tight clique, low = bridging position |
| **Community** (label propagation) | node colour | Her grazing clique. Weighted label propagation, seeded from the previous tick's labels so assignments and colours stay stable frame to frame |
| **Community size** | hover, sidebar | Members in her clique |
| **Herd panel** (top-left) | graph view | Backbone tie count, density, community count, mean strength |

Selecting a cow isolates her **ego network** — her ties brighten, the rest of the graph
dims — which is the fastest way to see who a flagged cow *used to* keep company with.

## Why it earns its place in the demo

Social withdrawal is one of the earliest, most reliable sickness behaviours in cattle —
often visible before fever peaks or rumination fully collapses. In the demo:

1. Inject **Random ill** and stay on the social graph view.
2. Her node visibly shrinks as strength drains (typical: from around herd-mean to near
   zero within a few sim-hours) and her remaining ties thin out.
3. She physically drifts out of her community cluster, usually around the time the amber
   watch ring appears — the graph shows *why* the isolation signal fired, and the
   sidebar's social-strength sparkline shows *when* it started.

It's also the feature that most clearly goes beyond what incumbent collars surface:
per-cow activity alerts are table stakes; a live herd sociogram with community structure
and per-animal centrality — built from data the collar already collects — is a
differentiated product surface. Natural extensions from here: feeding social-strength
deltas into the [detection model](./detection) as a learned feature, oestrus detection
via directed approach patterns, and dominance-hierarchy inference from displacement
events at water/shade.
