---
sidebar_position: 5
title: Health conditions
---

# Health conditions (ground truth)

Source: `src/sim/herd.ts` (`CONDITION_EFFECTS`, `setCondition`). The sidebar's *Inject
anomaly* controls apply a hidden condition to a cow — the ground truth the
[detection layer](./detection) has to find. Injected cows are deliberately **not marked**
on the paddock; the only place ground truth appears is the sidebar's *Ground truth* list.

Each condition reshapes pace, behaviour-state weights, body temperature, and the cow's
position within the herd:

## Lame

Painful to walk. Modelled as:

- pace drops to **35%** of normal — she lags visibly when the herd moves,
- walking bouts become rare, lying/resting bouts nearly double,
- slight temperature rise (+0.2 °C), mild drift towards the herd edge.

**Detectable signature:** sustained low speed relative to the herd, especially during
herd moves.

## Ill

A general sickness/fever profile (think early mastitis or metabolic disease):

- **fever**: +1.4 °C target offset, developing over ~1.5 h,
- **rumination collapses**: rumination and grazing weights drop to a third or less,
- **social withdrawal**: her home offset from the herd centre is scaled ×2.6 — she
  settles at the edge of the herd and her [social graph](./social-graph) edges decay.

**Detectable signature:** high temperature + low rumination + distance from herd centre.
The combination matters — heat stress alone raises everyone's temperature, and a
naturally aloof cow is far from centre but ruminating normally.

## Oestrus

Not an illness — but commercially critical to catch (missed heats cost real money):

- **restlessness**: walking weight ×3.5, resting weight down to a third,
- pace up ~35%, rumination mildly suppressed,
- moves *towards* the herd rather than away (isolation ×0.8).

**Detectable signature:** walking fraction and speed well above herd norms without the
illness markers.

## Recovery

*Cure* returns the cow to `healthy`. Effects unwind at their natural time constants —
temperature relaxes over a couple of hours, rumination rebuilds, and the detector's
score decays below the resolve threshold, closing the alert automatically.
