---
sidebar_position: 2
title: Why direct-to-cell
---

# Why direct-to-cell — HerdLink vs. tower-based collars

Concept comparison against a typical tower-based virtual-fencing collar (Halter's current
architecture is the reference point). Figures are illustrative — the argument is
architectural: **removing per-farm infrastructure removes the biggest cost and install
barrier in the category.**

| | Tower-based collar | HerdLink concept |
| --- | --- | --- |
| **Connectivity** | Proprietary LoRa mesh — collar → farm base station → backhaul | Direct-to-cell satellite (Starlink NTN) — collar talks straight to orbit |
| **On-farm infrastructure** | Solar/powered base station per farm, sited for line-of-sight coverage | None — zero towers, zero trenching, zero site surveys |
| **Install** | Scheduled install crew; tower commissioned before the first collar goes live | Collars ship by courier; farmer bolts them on, herd is live the same day |
| **Coverage** | Limited by tower line-of-sight — gullies and back blocks can be dead zones | Satellite footprint — every paddock, including remote lease blocks |
| **Cost structure** | Collar hardware + tower capex + install labour, recovered through subscription | Collar BOM + satellite data only — no capex to amortise, lower subscription |
| **Health analytics** | Per-cow activity and rumination alerts | Herd-relative detection plus social-graph isolation signals — sick cows flagged before vitals alone are conclusive |
| **Weather robustness** | Fixed behavioural baselines can drift in storms and heat | Herd-relative scoring is weather-invariant — the whole herd shifts together, individuals still stand out |

## The connectivity bet

Starlink's direct-to-cell service (and the broader 3GPP NTN standard) lets an ordinary
cellular modem chip talk to satellites — no dish, no gateway. For a collar this changes
the unit economics twice over:

- **Capex disappears.** No base station means no site survey, no install crew, no tower
  maintenance visits, and no coverage engineering per farm. The marginal cost of adding
  a farm is the collars themselves.
- **The addressable market widens.** Tower economics only work above a certain herd
  density. Satellite collars work identically for a 40-cow lease block in the back
  country and a 1,000-cow dairy platform.

Telemetry volumes are tiny — the demo's collar sends a sample every 5 minutes (position,
speed, behaviour class, temperature, rumination), well within NTN message budgets. Virtual
fencing control loops run on-collar; the uplink only carries telemetry and alerts, so
satellite latency is not on the critical path.

## The software bet

The rest of this documentation covers the software claim: that
[herd-relative detection](./detection) plus the [social graph](./social-graph) surfaces
health events earlier and more robustly than per-cow thresholds — and the demo lets you
verify that claim live against injected ground truth.
