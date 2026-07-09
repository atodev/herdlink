---
sidebar_position: 6
title: Detection layer
---

# Detection layer

Source: `src/sim/features.ts` (features), `scripts/train.ts` (offline training),
`src/sim/model.json` (shipped weights), `src/sim/analytics.ts` (live inference and
alerting). This is the ML story of the demo. Every 5 sim-minutes each cow is scored using
only [collar telemetry](./telemetry) — the detector has no access to the injected
[ground truth](./health-conditions).

## Features

Eight features per cow, in two families:

**Herd-relative** — how does she compare to everyone else *right now*? Z-scores against
the current herd distribution for: mean speed (2 h window), walking fraction, rumination
rate, body temperature, and distance from the herd centroid.

**Self-relative** — how does she compare to *her own* recent baseline? Deltas between the
last 2 hours and her 2–24 h-ago history, for speed, walking fraction, and rumination
(themselves z-scored across the herd).

Both families matter, and the demo's development history proves it: with herd-relative
features alone, the model persistently flagged naturally slow cows as lame and naturally
active ones as in oestrus. The self-relative deltas fix exactly that — a naturally slow
cow matches her own baseline; a newly lame cow deviates from it.

> **Baselines are the herd and the self, never a fixed threshold.** In a heatwave
> everyone's temperature rises; in a storm everyone stops grazing. Herd-relative features
> cancel weather and season out — force a **Heatwave** or **Snow** in the demo and watch
> zero false alerts fire while the whole herd's telemetry visibly shifts.

## The trained model

The scorer is a **multinomial logistic regression** over the eight features, with four
output classes: `healthy`, `ill`, `lame`, `oestrus`. It is trained offline by
`npm run train`:

1. **Data generation** — 12 randomised simulation episodes (60 cows, 36 sim-hours each,
   weather fronts rolling through). After a 12 h telemetry warm-up, two cows per
   condition are injected at the 18 h mark. Feature vectors are harvested every 15
   sim-minutes; condition samples only count as positives once the condition has been
   active 2.5 h (early onset looks healthy and would poison the labels). ~10,000
   labelled rows.
2. **Training** — full-batch gradient descent with L2 regularisation, **healthy samples
   weighted 3×**. That weighting is a product decision as much as a modelling one: on a
   farm, false alarms destroy trust in the system faster than a slow detection, and
   conditions are sustained anyway — the smoothing layer will still catch them.
3. **Shipping** — weights land in `src/sim/model.json` (a few hundred bytes) and are
   bundled into the browser app. Inference is a handful of multiplies per cow — no
   runtime dependency. Typical held-out recall: healthy ~99%, ill 100%, lame ~80–90%,
   oestrus ~93%.

### Retraining in the browser

The app is static-hostable (e.g. Vercel), so the same pipeline also runs entirely
in the browser: the **Retrain model** button in the top bar executes the full
simulate → fit → evaluate loop in a **Web Worker** (off the main thread — the demo keeps
running), hot-swaps the live model when it finishes, and persists it to localStorage for
future visits. `npm run train` and the button share the exact same code
(`src/sim/trainer.ts`); the node script's only extra job is baking the default
`model.json` into the bundle.

The interpretation layer stays transparent: every alert lists the exact telemetry
signals behind it ("rumination 8 min/h vs herd 22; 96 m from herd centre"), computed
from the same z-scores the model consumes.

## Smoothing and alert lifecycle

The model's P(healthy) converts to an anomaly score — scaled so an alert requires the
model to be *confidently and persistently* rejecting "healthy" — then smoothed with an
EWMA over roughly a sim-hour. One odd sample never pages the farmer.

| Threshold | Effect |
| --- | --- |
| score above 1.2 | **Watch** — amber ring on the paddock and network views |
| score above 2.0 | **Alert** — red pulsing ring + plain-language entry in the feed |
| score back below 1.0 | Active alert auto-resolves |

The *suspected cause* shown with a watch/alert is the model's highest-probability
condition class.

## Verified behaviour

The headless verification harness (same sim + detector, no UI) confirms, on a herd the
model never trained on:

- **24 h healthy herd → 0 alerts**
- **6 h forced heatwave → 0 alerts**, **6 h forced snow → 0 alerts** (herd-relative
  features doing their job)
- Injecting one ill, one lame, one oestrus cow → **all three detected with the correct
  suspected cause** (lameness in ~2 h, illness in ~2.5 h, oestrus in ~3.5 h), no false
  positives alongside.

## Scaling the model up

Logistic regression is the right size for five-figure sample counts and eight features,
and it keeps the demo inspectable. The seam for growth is clean: the feature pipeline and
alerting stay, and the scorer swaps for a gradient-boosted tree or small sequence model
trained on the same generator (or, in the real product, labelled farm telemetry) —
shipped via ONNX Runtime Web once the model outgrows hand-rolled inference.
