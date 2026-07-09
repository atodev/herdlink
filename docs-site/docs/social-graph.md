---
sidebar_position: 7
title: Social graph
---

# Social graph

Source: `src/sim/social.ts` (association tracking and network metrics),
`src/ui/NetworkView.tsx` (rendering). Toggle to it with **Social graph** in the top bar.

## The terms, in plain language

Social network analysis (SNA) has its own vocabulary. Everything on the graph view maps
to one of these:

| Term | Plain meaning | In this demo |
| --- | --- | --- |
| **Node** | A dot — one individual | One cow |
| **Tie** (edge) | A line between two nodes — a relationship | Two cows that spend time near each other |
| **Tie weight** | How strong the relationship is | Fraction of recent time the pair spent within 15 m (0–1); drawn as line thickness |
| **Degree** | How many ties a node has | How many regular companions a cow has |
| **Strength** (weighted degree) | Degree, but counting tie weights — total relationship "volume" | The cow's overall social embeddedness; drawn as node size |
| **Density** | Of all the ties that *could* exist, how many do | How tightly knit the herd is overall |
| **Clustering coefficient** | Do your friends know each other? 1 = your companions all associate with each other (a clique), 0 = they don't | Whether a cow lives in a tight sub-group or bridges between groups |
| **Community** | A cluster of nodes with many ties inside, few outside | A grazing clique; drawn as node colour |
| **Ego network** | One node plus its direct ties — the network from her point of view | What you see when you click a cow: her ties brighten, everything else dims |
| **Backbone** | The important subset of ties, with noise stripped out | What's actually drawn (see below) |

## What it is

Cattle herds have real, stable social structure — grazing partners, companion pairs,
consistent neighbours. Because every collar reports position, that structure falls out of
the data for free: no extra sensor, just proximity over time.

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
differentiated product surface.

## From graph to learned feature

The network isn't just a visual — it feeds the [detection model](./detection) directly.
Two of the model's ten input features are social:

- **`strengthZ`** — her strength compared to the rest of the herd right now. Low
  strength means she's socially peripheral… but some healthy cows just *are* peripheral,
  which is why this feature alone would false-alarm. So:
- **`dStrengthZ`** — her strength now compared to **her own baseline** (2–24 h ago).
  This is the withdrawal *event*: a naturally aloof cow scores ~0 (she matches her own
  baseline), while a previously well-connected cow whose ties are dissolving scores
  strongly negative.

This herd-relative + self-relative pairing mirrors how the behavioural features work,
and it's the classic SNA insight applied to health monitoring: **the change in an
individual's network position is more informative than the position itself.**

The training pipeline maintains the same association tracker during its simulated
episodes, so the model learns from exactly the signal the live system computes. The
measured effect: illness detection got faster (the strength collapse begins within the
association half-life, often leading the rumination signal), and when social withdrawal
contributes to an alert it appears in the alert's explanation
("social withdrawal — association strength falling vs her own baseline").

Natural extensions from here: oestrus detection via directed approach patterns,
dominance-hierarchy inference from displacement events at water/shade, and community
stability as a herd-level welfare indicator.
