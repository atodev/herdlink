---
sidebar_position: 2
title: What makes it different
---

# What makes it different

Every virtual-fencing collar on the market sells health alerts. HerdLink's claim isn't a
new sensor or a new radio — it's what you do with the data the collar already collects.
The difference is entirely in the analytics layer, and it comes down to three ideas.

## 1. Score against the herd, not a fixed threshold

The incumbent approach watches each cow against her own fixed baseline and alarms on
deviation. The problem is that behaviour is driven by things that move the *whole herd*
at once — weather, feed, time of day. A heatwave lifts every temperature on the farm; a
storm halves everyone's grazing. Fixed thresholds either fire on all of it (and the
farmer stops trusting the app) or get detuned until they miss real cases.

HerdLink scores every feature **relative to the current herd distribution**. When the
whole herd shifts together, the distribution moves with it and nobody stands out — the
sick individual only surfaces when she deviates *from her peers*. See
[the detection layer](./detection) for the method and
[weather](./weather) for the demonstration: force a heatwave or a snowstorm and watch the
false-alarm rate stay at zero.

## 2. Read the herd's social network

A collar network is also a **social network observatory**: every position report is a
proximity observation, and proximity over time reveals the herd's social structure — who
grazes with whom, which animals cluster, who sits central and who peripheral.

This matters because **social withdrawal is one of the earliest, most reliable sickness
signals in cattle**, often visible before fever peaks or rumination collapses. It needs
no extra hardware — it is latent in data every collar already produces. HerdLink turns it
into live network metrics and, crucially, into a
[learned detection feature](./social-graph#from-graph-to-learned-feature). No incumbent
surfaces a live herd sociogram; it is a genuinely differentiated product surface.

## 3. The change is the signal, not the state

The unifying idea behind both: HerdLink pairs every herd-relative feature with a
**self-relative** one. It doesn't just ask "is she slow / peripheral / quiet?" — some
healthy cows simply are. It asks "is she *becoming* slow / peripheral / quiet, relative
to her own recent baseline?" A naturally aloof cow matches her own history and stays
quiet; a cow whose ties are dissolving lights up. That distinction is what lets the
system be sensitive without being noisy.

## Verified, not asserted

The demo is built to be falsifiable. Inject a hidden condition into a random cow — nothing
marks her on screen — and watch whether the detector finds it. On herds the model never
trained on: **zero false alerts** across 24 h of healthy grazing plus forced heatwave and
snow, and every injected condition (illness, lameness, oestrus) caught with the correct
suspected cause within two to four sim-hours. The [detection page](./detection) has the
numbers.
