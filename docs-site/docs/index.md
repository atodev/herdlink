---
sidebar_position: 1
slug: /
title: Overview
---

# HerdLink — the demo, explained

HerdLink is a demonstration of a next-generation analytics layer for virtual-fencing
cattle collars: **herd-relative behavioural analytics and social-network analysis** that
flag unwell animals from the telemetry collars already collect — earlier, and with far
fewer false alarms, than the per-cow threshold alerts the category ships today.

There is no hardware here. The demo is a fully client-side web app
([http://localhost:5173](http://localhost:5173)) that simulates a realistic herd, streams
synthetic collar telemetry from it, and runs a real detection layer on top. The point it
makes: the defensible value in this product category is the **ML and UX layer**, and that
layer can be demonstrated end-to-end in software.

## What you're looking at

| Piece | What it does |
| --- | --- |
| [Visual overview](./overview) | A slide-by-slide walkthrough of the whole idea — start here for the picture |
| [Herd simulation](./herd-simulation) | 80 cows with realistic daily behaviour rhythms, herd movement, and social structure |
| [Collar telemetry](./telemetry) | Synthetic GPS, speed, behaviour, temperature, and rumination streams per cow |
| [Health conditions](./health-conditions) | Injectable ground truth — lameness, illness, oestrus — with realistic behavioural signatures |
| [Detection layer](./detection) | Herd-relative anomaly scoring that sees only telemetry, never the ground truth |
| [Social graph](./social-graph) | Proximity-derived herd social network — sick cows visibly detach from their cluster |
| [Weather & environment](./weather) | Rain, wind, heat, and day/night, all coupled into behaviour |
| [UI guide](./ui-guide) | What every control, colour, and panel means |
| [What makes it different](./comparison) | The three analytics ideas that set HerdLink apart |

## The claim

**Smarter software, from the same data.** Scoring every cow against the herd — and against
her own history — rather than against fixed thresholds makes detection robust to weather,
season, and feed changes: the whole herd shifts together, the sick individual still stands
out. Reading the herd's **social network** on top of that surfaces withdrawal, one of the
earliest sickness signals, with no extra sensor. The [detection page](./detection)
explains the method and [what makes it different](./comparison) frames the case; the demo
lets you verify it against injected ground truth.

## Quick demo script

1. Open the app, set sim speed to **10 min/s**.
2. Click **Random ill** in the sidebar. Note the cow is *not* visually marked — the
   ground truth is hidden from the detector.
3. Within a sim-hour the cow picks up an amber *watch* ring; shortly after, a red
   pulsing *alert* ring and a plain-language alert in the feed.
4. Switch to the **Social graph** view: the sick cow's edges thin out as it detaches
   from its grazing cluster.
5. Hit **Heatwave**: the herd migrates to the shade trees, everyone's temperature rises —
   and no false alerts fire, because detection is herd-relative.
