---
sidebar_position: 4
title: Herd simulation
---

# Herd simulation

Source: `src/sim/herd.ts`. The simulation drives ~80 cows in a 500 × 350 m paddock and
is the substrate everything else runs on. It aims for *defensible realism*: the numbers
and behaviours are grounded in how cattle actually spend their day.

## Behavioural states

Each cow is always in one of four states, matching what a real collar's activity
classifier would output:

- **Grazing** — slow head-down drift, ~0.12 m/s
- **Walking** — purposeful movement, ~1 m/s
- **Resting** — stationary, lying
- **Ruminating** — stationary, chewing the cud

States run in *bouts* (grazing 25–70 min, rumination 30–60 min, etc.), then re-roll from
a weighted distribution.

## The daily rhythm

Cattle graze in bouts concentrated around **dawn (05:00–10:00) and dusk (15:00–20:00)**,
and rest/ruminate through midday and overnight. The state weights follow that cycle, so
running the sim at 30 min/s shows the herd waking, grazing, drifting to fresh ground,
and going quiet at night. [Weather](./weather) modifies these weights on top.

## Herd behaviour

Three mechanisms make it read as a herd rather than 80 independent dots:

1. **Allelomimicry** — cattle synchronise. Each state re-roll blends the time-of-day
   weights (60%) with what the herd is currently doing (40%), producing the
   characteristic "everyone grazes, then everyone lies down" pattern.
2. **A herd focal point** — the herd drifts towards fresh grazing every 1.5–4 h. Each cow
   holds a persistent personal offset from that point (its *home spot*), which gives the
   herd stable spatial structure — the same neighbours end up near each other, which the
   [social graph](./social-graph) later picks up.
3. **Separation** — cows keep ~3 m of personal space via a simple repulsion pass.

## Movement model

Per tick, a cow blends **goal-seeking** (towards its home spot) with a **wandering
heading** (a random walk in heading space, dominant while grazing), then accelerates
smoothly towards that desired velocity. The paddock's dashed **virtual fence** clamps
positions with a soft bounce — the software analogue of the collar's fence cue.

Each cow also carries a persistent `paceFactor` (0.85–1.15): healthy cows genuinely
differ in pace, which keeps the detection problem honest —
[the detector](./detection) has to distinguish a naturally slow cow from a lame one.

## Day/night

`daylight()` computes a 0–1 factor with smooth ramps at dawn (~06:00–07:30) and dusk
(~19:00–20:30). It darkens the paddock rendering at night (cow markers stay bright — it's
a monitoring UI, not a nature documentary) and drives the moon icon in the weather chip.
