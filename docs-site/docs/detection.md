---
sidebar_position: 6
title: Detection layer
---

# Detection layer

Source: `src/sim/analytics.ts`. This is the ML story of the demo. Every 5 sim-minutes it
scores each cow **against the herd**, using only [collar telemetry](./telemetry) — it has
no access to the injected [ground truth](./health-conditions).

## Features

Per cow, over a 2-hour telemetry window plus the live sample:

- mean **speed**
- **walking fraction** (share of samples classified as walking)
- **rumination rate**
- body **temperature**
- **distance from the herd centroid**

## Herd-relative z-scores

Each feature is converted to a z-score against the *current herd distribution* (with
floors on the standard deviation so a perfectly synchronised herd doesn't produce
explosive scores). This is the key design decision:

> **Baselines are the herd, not a fixed threshold.** In a heatwave everyone's temperature
> rises; in a storm everyone stops grazing; on lush pasture everyone ruminates more. A
> per-cow-vs-fixed-baseline system alarms on all of these. A herd-relative system doesn't
> — the sick individual still sticks out of the distribution.

You can verify this in the demo: force a **Heatwave** or **Rain** and watch zero false
alerts fire while the whole herd's telemetry visibly shifts.

## Cause-specific scoring

The z-scores combine into three interpretable cause scores, scaled so ~2 means "clearly
abnormal":

- **illness** = high temp + low rumination + far from centre
- **lameness** = low speed + far from centre − *minus* the fever term (a slow cow *with*
  a fever is ill, not lame)
- **oestrus** = high walking fraction + high speed, discounted if rumination has collapsed

The top cause becomes the *suspected* label shown in the UI. This is deliberately a
transparent, explainable model — every alert lists the exact signals that drove it
("rumination 8 min/h vs herd 22; 96 m from herd centre").

## Smoothing and alert lifecycle

The raw score feeds an EWMA (~45 sim-minutes), so alerts require a **sustained**
deviation — one odd sample never pages the farmer.

| Threshold | Effect |
| --- | --- |
| score above 1.2 | **Watch** — amber ring on the paddock and network views |
| score above 2.0 | **Alert** — red pulsing ring + plain-language entry in the feed |
| score back below 1.0 | Active alert auto-resolves |

## Where a trained model slots in

The current scorer is deliberately statistics-first: transparent and verifiable live. The
architecture leaves a clean seam — the feature extraction and alerting stay, and the
hand-weighted cause scores can be swapped for a classifier trained offline on simulated
(or, in the real product, labelled farm) telemetry, shipped to the browser via ONNX
Runtime Web. That is the planned phase 5 of the build.
