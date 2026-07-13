---
sidebar_position: 2
title: Visual overview
---

# Visual overview

A slide-by-slide walkthrough of the HerdLink idea — the problem, the two core
concepts, the method, and the results. For the rigorous numbers and their
caveats, see the [detection method](./detection) and the
[white paper](https://github.com/atodev/herdlink/blob/main/whitepaper/main.pdf);
a few panels below are deliberately schematic (illustrative curves, not plotted
data) and are marked as such.

---

![HerdLink — the next-generation analytics layer for livestock wearables](/img/overview/01-title.jpg)

**The pitch.** Reading the herd's *social network* to catch illness earlier — a
software layer on top of the collars already in the paddock.

![24/7 sensor on every animal, but fixed baselines drown farmers in false alarms](/img/overview/02-status-quo.jpg)

**The status quo.** The hardware already puts a sensor on every animal. The
software flaw is fixed per-animal baselines: they fire on normal environmental
shifts, and the resulting alert fatigue is what kills monitoring products.
*(The trust/alarm curves are illustrative.)*

![A heatwave trips every fixed threshold at once](/img/overview/03-fixed-baselines-fail.jpg)

**Why fixed baselines fail the paddock test.** Weather moves every cow at once.
To a fixed-threshold system a hot afternoon looks like 80 simultaneously sick
cows; to a farmer it looks like a broken app. *(Schematic.)*

![Reading the herd, not the cow](/img/overview/04-paradigm-shift.jpg)

**The paradigm shift.** Stop analysing 80 sensors in isolation. Normalise each
animal against the herd, and read the herd's social structure — that is where
early sickness and withdrawal surface.

![Herd-relative normalization via z-scores against the concurrent herd](/img/overview/05-herd-relative-normalization.jpg)

**Core concept 1 — herd-relative normalization.** Every feature is a z-score
against the *concurrent* herd distribution. When weather shifts the herd, the
curve shifts with it and only true anomalies stand out. The result is
weather-proof alerts.

![From raw GPS pings to a social-withdrawal signal](/img/overview/06-latent-social-signals.jpg)

**Core concept 2 — latent social signals.** Social withdrawal is an early
sickness behaviour, latent in data collars already produce: raw GPS pings → a
15 m proximity filter → an exponential-decay accumulator (fraction of recent
time spent together) → cliques and outcasts in real time.

![The software layer: paddock renderer, social graph, and alerts](/img/overview/07-software-layer.jpg)

**The software layer in action.** A fully client-side browser demo — canvas
paddock renderer, force-directed social graph, and an alerts-and-insights feed.
The hardware gets a sensor on the animal; the software asks more of the data.

![Ten features into a multinomial logistic regression](/img/overview/08-model-architecture.jpg)

**The detection model.** Each cow is continuously scored across 10 features —
herd-relative (5), self-relative (3), and social (2) — by a multinomial logistic
regression, with a 3× cost weight on healthy examples to suppress false alarms.

![An 80-cow falsifiable simulator with hidden injected conditions](/img/overview/09-in-silico-study.jpg)

**The in-silico study.** A generative herd of 80 cows with circadian rhythms and
weather. Hidden conditions (lameness, illness, oestrus) are injected and the
detector must catch them from telemetry alone, never peeking at ground truth.

![Result 1: false-alarm rate stays near zero across weather regimes](/img/overview/10-result-weatherproofing.jpg)

**Result 1 — weather-proofing achieved.** The central evidence for herd-relative
scoring: even under a forced, sustained heatwave or snowstorm the false-alarm
rate stays near 0.01 per cow-day. The covariate shifts cancel out.

![Result 2: every condition detected, illness in 2.4 h](/img/overview/11-result-latency.jpg)

**Result 2 — rapid detection.** Across 30 seeded replicates every injected
condition is flagged with the correct suspected cause: illness in 2.4 h, oestrus
2.8 h, lameness 4.0 h — all at 100% detection, without sacrificing the near-zero
false-alarm rate.

![The ablation: an honest null result on social features](/img/overview/12-ablation.jpg)

**The ablation — an honest look.** A deliberately reported *null* result: adding
social features did not speed up detection in the simulation, because spatial
distance already captures physical withdrawal. Their value here is UX
interpretability, and they are expected to matter for noisy real-world GNSS.

![UX translation: plain-language, explainable alerts](/img/overview/13-ux-explainability.jpg)

**UX translation — trust through explainability.** Data is useless if the farmer
can't read or trust it. Every alert translates the spatial maths into plain
language: "moving 60% slower than herd; left her usual companions."

![Farm-level ROI: earlier treatment, trusted alerts, fewer missed heats](/img/overview/14-farm-roi.jpg)

**The farm-level ROI.** Earlier treatment (hours matter for mastitis and
lameness), trusted alerts (near-zero false alarms protect credibility), and
fewer missed heats (each missed heat costs a three-week cycle).

![The next chapter: from in-silico to a real-world field study](/img/overview/15-next-chapter.jpg)

**The next chapter.** The method works in-silico. The opportunity is a modelling
decision, not a hardware revision — and the essential next step is a real-world
field study pairing collar telemetry with veterinary diagnoses.
