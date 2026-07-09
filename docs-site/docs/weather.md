---
sidebar_position: 8
title: Weather & environment
---

# Weather & environment

Source: `src/sim/herd.ts` (`updateWeather`, `heatStress`, `behaviourWeights`). The sim
carries live **ambient temperature, wind, rain, and cloud cover**, plus a
[day/night cycle](./herd-simulation#daynight), all coupled into cattle behaviour.

## Weather generation

In **Auto** mode a new front rolls through every 3–8 sim-hours: mostly fair spells, with
occasional wet fronts, blustery days, the odd heatwave, and the occasional cold snap with
snow. Current conditions relax towards the front's targets over about an hour, and a
diurnal swing (±4 °C, peaking mid-afternoon) rides on top. The **weather dropdown** in
the top bar (Sunny / Heatwave / Rain / Windy / Snow) forces a preset immediately —
useful for demoing a specific effect.

Precipitation falls as **snow** whenever the air temperature is near freezing (below
~2 °C) — so the forced Snow preset and a cold Auto front render identically.

## Behavioural effects

All grounded in documented cattle behaviour:

| Conditions | Effect on the herd |
| --- | --- |
| **Heavy rain** | Grazing drops, lying nearly stops (cows stand and wait it out, ruminating), the herd **bunches** |
| **Strong wind** (above 7 m/s) | Grazing suppressed, more standing rumination, herd bunches |
| **Heat** (hot + bright + midday) | Grazing collapses, the herd walks to the **shade trees** and packs in tight; body temperature rises herd-wide |
| **Cold** (below 8 °C, daytime) | Grazing increases — energy demand |
| **Snow** (precipitation near freezing) | Pasture is buried: grazing collapses, cows stand ruminating in a tight bunch rather than lie in snow; the field whitens and flakes drift with the wind |
| **Night** | The normal overnight rest/rumination pattern; paddock rendering darkens |

Rendering follows suit: rain streaks slant with the wind, a wind arrow appears in the
paddock corner, the field brightens in sun and greys under cloud, and the weather chip in
the top bar shows conditions at a glance.

## Why weather matters to the detection story

Weather is the classic source of false alarms in behavioural monitoring: a storm halves
the herd's grazing time, a heatwave raises every body temperature. Because the
[detection layer](./detection) scores each cow *against the current herd distribution*,
these herd-wide shifts cancel out. Forcing a heatwave mid-demo and watching zero false
alerts fire — while a genuinely ill cow still gets caught — is the single best
illustration of why herd-relative baselines are the right design.
