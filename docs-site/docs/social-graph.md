---
sidebar_position: 7
title: Social graph
---

# Social graph

Source: `src/sim/analytics.ts` (association tracking), `src/ui/NetworkView.tsx`
(rendering). Toggle to it with **Social graph** in the top bar.

## What it is

Cattle herds have real, stable social structure — grazing partners, companion pairs,
consistent neighbours. Because every collar reports position, that structure falls out of
the data for free: no extra sensor, just proximity over time.

- Every 5 sim-minutes, each pair of cows within **15 m** accumulates association weight.
- Weights decay with a **~4-hour half-life**, so the graph reflects *recent* social
  structure and adapts as the herd re-organises.
- The weight is normalised to "fraction of recent time spent together"; edges above 25%
  are drawn, with thickness and opacity tracking strength.

The force-directed layout then makes cliques visible as spatial clusters. Node colour is
the cow's [detection](./detection) status: green healthy, amber watch, red alert.

## Why it earns its place in the demo

Social withdrawal is one of the earliest, most reliable sickness behaviours in cattle —
often visible before fever peaks or rumination fully collapses. In the demo:

1. Inject **Random ill** and stay on the social graph view.
2. The cow's edges thin and vanish over the next few sim-hours as she stops keeping
   company.
3. She physically drifts out of her cluster, usually around the time the amber watch
   ring appears — the graph shows *why* the isolation signal fired.

It's also the feature that most clearly goes beyond what incumbent collars surface:
per-cow activity alerts are table stakes; a live herd sociogram that explains an alert
("Bella left her usual companions six hours ago") is a differentiated UX built from the
same data.

## Hover and selection

Hovering a node shows the cow's anomaly score and its contributing signals; clicking
selects the cow across both views and populates the sidebar card with vitals, sparklines,
and injection controls.
