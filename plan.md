# Smart Collar Demo — Plan

## Goal
Build a compelling demo of a next-gen cattle collar concept (DTC / Starlink connectivity, lower cost than Halter's current product) centred on a live herd-monitoring UI: a map/graph of a simulated herd where hovering a cow reveals its behavioural profile and health signals (e.g. "moving slower than the herd — possibly unwell").

This is a portfolio/demonstration piece — no real hardware. The value shown is the **ML + UX layer**: simulated telemetry in, insight out.

## Narrative the demo tells
1. **Cheaper hardware story** — a static "product" panel comparing architectures: Halter's solar collar + LoRa base-station-per-farm vs. our concept: DTC (direct-to-cell via Starlink/satellite NTN) collar, no farm base station, lower BOM and no install cost. This is copy + a diagram, not code-heavy.
2. **Smarter software story** — the live demo: herd behavioural analytics that Halter doesn't surface (or that we surface better).

## Demo architecture (all local, no backend required)
- **Single-page web app** — Vite + React + TypeScript.
- **Simulation engine** (pure TS module, runs in the browser):
  - ~50–150 cows with positions on a paddock map, driven by a herd-movement model (boids-style flocking + grazing/resting/walking behavioural states + day/night cycle).
  - Each cow emits synthetic telemetry: GPS position, speed, heading, activity classification (grazing / ruminating / walking / resting), rumination minutes, temperature.
  - Injectable anomalies: lameness (slow, lagging position), illness (low rumination, isolation from herd), oestrus (elevated activity), escaped/boundary breach.
- **Analytics layer** (the ML showcase):
  - Per-cow rolling baselines (speed, activity mix, rumination) vs. herd-level baselines.
  - Anomaly scoring: deviation of individual vs. herd + vs. own history (z-scores / EWMA to start; optional isolation forest or simple LSTM later if we want real ML weight).
  - **Social network graph**: proximity-based interaction edges over time — which cows graze together; a sick cow visibly detaches from its cluster. This is the "network graph" from the brief and it's a genuinely differentiating visual.
- **UI**:
  - Main canvas: paddock view with cow dots, colour-coded by health/alert state, virtual fence boundary drawn.
  - Toggle: paddock view ↔ social-network graph view (force-directed).
  - Mouseover/click a cow → card with sparklines (speed vs. herd, rumination, activity mix) and plain-language insight: "Bella has moved 40% slower than the herd for 3h and left her usual social cluster — check for lameness."
  - Alert feed sidebar; a time-acceleration control so anomalies develop in seconds.

## Build phases
1. **Scaffold + sim core** — Vite app, herd movement simulation rendering on canvas at 60fps, time acceleration.
2. **Telemetry + behavioural states** — per-cow state machines, synthetic sensor streams, anomaly injection controls.
3. **Analytics** — baselines, anomaly scores, social-graph computation from proximity history.
4. **UI polish** — hover cards with sparklines, network graph view, alert feed, product-comparison panel.
5. **Stretch** — swap heuristic scoring for a trained model (e.g. train a classifier on the simulated telemetry offline, ship weights to the browser via ONNX Runtime Web) so the "ML role" story has real teeth.

## Key decisions (defaults chosen, easy to revisit)
- **No backend / no real Starlink integration** — the connectivity story is told in copy and architecture diagrams; the demo is fully client-side so it can be hosted anywhere (GitHub Pages, Vercel) and shared as a link.
- **Canvas (or SVG+D3 for the graph) over a heavy mapping library** — a stylised paddock reads better in a demo than real satellite tiles, but we can drop in MapLibre later.
- **Heuristic analytics first, real model as stretch** — the demo lands on the UX either way; phase 5 adds credibility.

## Risks / open questions
- How much "real ML" is needed for the story vs. convincing simulation + statistics? (Phase 5 answers this.)
- Cow-behaviour realism: worth ~an hour reading up on grazing/rumination time budgets so the simulation numbers are defensible to a domain expert.
