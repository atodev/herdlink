---
sidebar_position: 9
title: UI guide
---

# UI guide

The app ([http://localhost:5173](http://localhost:5173)) is a single screen: top bar,
main view (paddock or social graph), sidebar, status bar.

## Top bar

- **Clock** — sim time, `Day N HH:MM`. The sim starts at 07:00 on day 1.
- **Weather chip** — icon (sun/cloud/rain/wind/snow/moon), ambient temperature, wind
  speed. Hover for rain and cloud percentages.
- **Docs ↗** — opens this documentation.
- **Retrain model** — re-runs the full [training pipeline](./detection#the-trained-model)
  in a Web Worker (simulated episodes → logistic regression) and hot-swaps the live
  detection model; the result persists in localStorage.
- **View** — switches between the paddock map and the [social graph](./social-graph).
- **Weather dropdown** — Auto lets fronts roll through on their own; Sunny, Heatwave,
  Rain, Windy, and Snow force conditions immediately ([weather](./weather)).
- **Speed** — from real time (1×) to 30 sim-minutes per second. 10 min/s is the sweet
  spot for watching a health event develop; 30 min/s shows the full daily rhythm in
  under a minute.

## Paddock view

- **Dot colour = behaviour** (see the legend, bottom-left): green grazing, yellow
  walking, grey resting, blue ruminating. The tick shows heading while moving.
- **Rings**: amber = the detector is watching this cow (score > 1.2); pulsing red =
  active alert (score > 2.0); white = your selection.
- **Dashed yellow rectangle** — the virtual fence. **Dark green circle** — shade trees.
- The field darkens at night and dims under cloud; rain and wind render live.
- **Hover** any cow for name, behaviour, speed, temperature, rumination, and — if
  elevated — its anomaly score. **Click** to select.

## Sidebar

- **Alerts** — the feed a farmer would see: plain-language, signal-first messages
  ("moving 62% slower than herd; 96 m from herd centre — possible lameness"). Click a
  name to jump to the cow. Resolved alerts dim.
- **Selected cow** — live vitals, the detector's current score and suspected cause, the
  exact signals driving it, and **24-hour sparklines** of speed, rumination, and
  temperature with the herd mean dashed behind — the cow-vs-herd comparison at a glance.
- **Inject anomaly** — the demo's control surface: give a random (or the selected) cow a
  hidden [condition](./health-conditions), then watch the detector find it.
- **Ground truth** — the only place injected conditions are visible. The gap between
  this list and the alert feed *is* the detector's performance, live.

## Status bar

Collar count, the herd's current behaviour mix, and the active alert count.
