---
sidebar_position: 4
title: Collar telemetry
---

# Collar telemetry

Source: `src/sim/herd.ts` (generation), `src/sim/types.ts` (schema). Every cow emits the
data stream a real DTC collar would uplink — and the [detection layer](./detection) is
only allowed to see this stream, never the simulation's internal state.

## The sample

Every **5 sim-minutes** each collar records:

| Field | What it is |
| --- | --- |
| `t` | Timestamp (sim-minute) |
| `x`, `y` | GPS position, paddock metres |
| `speed` | 5-minute average speed, m/s |
| `behaviour` | Activity classification: grazing / walking / resting / ruminating |
| `temperature` | Body temperature, °C |
| `rumination` | Fraction of recent time spent ruminating |

Each cow keeps a **24-hour ring buffer** (288 samples). That buffer feeds the detector's
2-hour feature windows and the 24-hour sparklines in the sidebar. A sample every 5
minutes is also a realistic satellite-NTN message budget — see
[the comparison](./comparison).

## Temperature model

Body temperature relaxes towards a target of **38.6 °C baseline** plus:

- a small **diurnal cycle** (±0.25 °C, peaking late afternoon),
- a **condition offset** — illness adds +1.4 °C ([health conditions](./health-conditions)),
- a **heat-stress term** shared by the whole herd in hot weather ([weather](./weather)).

The relaxation time constant (~1.5 h) means fevers develop gradually, as they do in
practice.

## Rumination model

A healthy cow ruminates roughly a third of her time. The collar reports an exponentially
weighted moving average (≈2 h window) of time-in-rumination, expressed in the UI as
**min/h**. Illness collapses the underlying behaviour weights, so the reported rate
decays over an hour or two — a leading indicator, and exactly the signal real rumination
collars are sold on.

## Why synthetic telemetry is the right demo choice

The generator and the detector are **strictly separated**: conditions are injected into
the behaviour model, and the detector must recover them from the telemetry alone. That
makes the demo falsifiable — inject a condition, watch whether and how fast the detector
finds it — which is a far stronger portfolio claim than a dashboard drawn over canned data.
