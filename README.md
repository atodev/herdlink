<p align="center">
  <img src="public/favicon.svg" width="72" alt="HerdLink" />
</p>

# HerdLink

**A next-generation analytics layer for cattle collars — herd-relative health analytics plus social-network analysis — demonstrated end-to-end in software.**

🐄 **Live demo:** [herdlink.atodev.xyz](https://herdlink.atodev.xyz/) · 📚 **Docs:** [herdlink.atodev.xyz/docs](https://herdlink.atodev.xyz/docs/) · 📄 **White paper:** [PDF](whitepaper/main.pdf)

---

## What this is

Virtual-fencing collars put a sensor on every animal, around the clock — but nearly all of them ship the same health feature: per-cow activity/rumination alerts against a fixed threshold, which drown in false alarms whenever weather shifts the whole herd at once. HerdLink demonstrates a smarter analytics layer that flags unwell cows from the telemetry collars already collect — scoring every cow **relative to the herd and to her own history**, and reading the herd's **social network** to catch withdrawal, one of the earliest sickness signals.

There is no hardware here — the demo makes the case that the defensible value in this category is the **ML and UX layer**, and proves that layer works:

- A realistic **herd simulation** (80 cows, circadian behaviour rhythms, herd social structure, weather- and daylight-coupled behaviour) emits the telemetry a real collar reports: GPS, speed, activity class, body temperature, rumination — a compact ~20-byte sample every 5 minutes.
- A **trained detection model** (multinomial logistic regression over herd-relative + self-baseline features, fitted on ~10k labelled samples from randomised sim episodes) scores every cow continuously. It sees telemetry only — never the simulation's ground truth.
- You **inject hidden conditions** (lameness, illness, oestrus) and watch the detector find them: plain-language alerts, a live **social graph** where sick cows visibly detach from their grazing cluster, and 24-hour cow-vs-herd sparklines.

The detection layer is deliberately falsifiable: verified behaviour is **zero false alerts** across 24 h healthy + forced heatwave + forced snow, with all injected conditions caught (correct suspected cause) within 2–3.5 sim-hours.

## Try it (60 seconds)

1. Open the [live demo](https://herdlink.atodev.xyz/) and set sim speed to **10 min/s**.
2. Click **Random ill** in the sidebar. The cow is *not* marked on the map — ground truth stays hidden from the detector.
3. Watch the alert feed: an amber *watch* ring appears within a sim-hour, then a red pulsing *alert* with the exact signals that drove it.
4. Switch to the **Social graph** view — the sick cow's edges thin out as she leaves her cluster.
5. Force a **Heatwave** (weather dropdown): the herd packs into the shade, every temperature rises — and no false alerts fire, because scoring is herd-relative.

Bonus: the **Retrain model** button re-runs the entire training pipeline (12 simulated episodes → logistic regression) in a Web Worker, in your browser, and hot-swaps the live model.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Herd simulation | `src/sim/herd.ts` | Behaviour state machine, allelomimicry, herd focal point, weather, day/night |
| Telemetry | `src/sim/types.ts` | 5-min samples, 24 h ring buffer per cow |
| Features | `src/sim/features.ts` | Herd-relative z-scores + self-baseline deltas |
| Training | `src/sim/trainer.ts` | Shared by `npm run train` (node) and the in-browser Web Worker |
| Live detection | `src/sim/analytics.ts` | Model inference, EWMA smoothing, alert lifecycle, social-association graph |
| UI | `src/ui/` | Canvas paddock renderer, force-directed social graph, sidebar |
| Docs | `docs-site/` | Docusaurus, served under `/docs` |

Fully client-side — no backend. See the [docs](https://herdlink.atodev.xyz/docs/) for the reasoning behind each piece, including [what makes it different](https://herdlink.atodev.xyz/docs/comparison) and the [detection method](https://herdlink.atodev.xyz/docs/detection).

## Development

```bash
npm install
npm run dev          # app on :5173
npm run train        # regenerate src/sim/model.json (node)
npm run build        # typecheck + production build

cd docs-site
npm install
npm start            # docs on :3000/docs/
```

Deployment is a single Vercel project: `npm run build:vercel` builds the app and the docs and serves both from one domain (`/` and `/docs`).

## White paper

A peer-review-style write-up of the method and its evaluation lives in [`whitepaper/`](whitepaper/) — read the compiled [PDF](whitepaper/main.pdf) or the [LaTeX source](whitepaper/main.tex). It is an **in-silico study**: every result comes from a seeded, reproducible harness (`npm run evaluate`, 30 replicates) rather than real-herd data, and the paper foregrounds that limitation. Notably, its rigorous ablation reports a *null* result — the social-network features give no detection-latency benefit once spatial withdrawal is captured by herd-centroid distance — while confirming the robust finding: near-zero false alarms under weather shifts.

```bash
npm run evaluate     # regenerate whitepaper/data/ (30 seeded replicates)
cd whitepaper && make # compile main.pdf (needs a TeX distribution)
```

---

*HerdLink is a personal demonstration concept. Not affiliated with Halter. Behavioural parameters are grounded in published cattle-behaviour literature; hardware and cost figures are illustrative.*
