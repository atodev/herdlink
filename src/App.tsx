import { useEffect, useRef, useState } from 'react';
import { createAnalytics, tickAnalytics } from './sim/analytics';
import { createSim, daylight, formatSimClock, setWeatherMode, stepSim } from './sim/herd';
import type { Behaviour, WeatherMode } from './sim/types';
import NetworkView from './ui/NetworkView';
import PaddockCanvas from './ui/PaddockCanvas';
import Sidebar from './ui/Sidebar';

/** sim-minutes per real second at each speed setting */
const SPEEDS = [
  { label: '1×', minPerSec: 1 / 60 },
  { label: '1 min/s', minPerSec: 1 },
  { label: '10 min/s', minPerSec: 10 },
  { label: '30 min/s', minPerSec: 30 },
];

const WEATHER_MODES: { value: WeatherMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'sunny', label: 'Sunny' },
  { value: 'heatwave', label: 'Heatwave' },
  { value: 'rain', label: 'Rain' },
  { value: 'windy', label: 'Windy' },
];

const BEHAVIOURS: Behaviour[] = ['grazing', 'walking', 'resting', 'ruminating'];

/** Docusaurus site (docs-site/), `npm start` serves it on :3000 */
const DOCS_URL = 'http://localhost:3000';

function weatherIcon(rain: number, cloud: number, wind: number, temp: number, dl: number): string {
  if (rain > 0.3) return '🌧';
  if (wind > 8) return '💨';
  if (dl < 0.25) return '🌙';
  if (temp > 26 && cloud < 0.3) return '☀️';
  if (cloud > 0.6) return '☁️';
  return '🌤';
}

export default function App() {
  const simRef = useRef(createSim(80));
  const analyticsRef = useRef(createAnalytics());
  const [speedIdx, setSpeedIdx] = useState(1);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<'paddock' | 'network'>('paddock');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [, setRevision] = useState(0);
  const [clock, setClock] = useState(() => formatSimClock(simRef.current.timeMin));
  const [counts, setCounts] = useState<Record<Behaviour, number>>({
    grazing: 0, walking: 0, resting: 0, ruminating: 0,
  });

  const speedRef = useRef(speedIdx);
  speedRef.current = speedIdx;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const sim = simRef.current;
    const analytics = analyticsRef.current;
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;

    const tick = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (!pausedRef.current) {
        let dtMin = dtReal * SPEEDS[speedRef.current].minPerSec;
        // Sub-step so behaviour transitions and fences stay stable at high speed
        while (dtMin > 0) {
          const step = Math.min(dtMin, 0.5);
          stepSim(sim, step);
          tickAnalytics(analytics, sim);
          dtMin -= step;
        }
      }

      if (now >= hudAt) {
        hudAt = now + 200;
        setClock(formatSimClock(sim.timeMin));
        const c: Record<Behaviour, number> = { grazing: 0, walking: 0, resting: 0, ruminating: 0 };
        for (const cow of sim.cows) c[cow.behaviour]++;
        setCounts(c);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sim = simRef.current;
  const w = sim.weather;
  const activeAlerts = analyticsRef.current.alerts.filter((a) => a.resolvedAt === null).length;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Herd<span>Link</span> — live herd monitor
        </h1>
        <div className="clock">{clock}</div>
        <div className="weather-chip" title={`wind ${w.windSpeed.toFixed(0)} m/s · rain ${Math.round(w.rain * 100)}% · cloud ${Math.round(w.cloud * 100)}%`}>
          {weatherIcon(w.rain, w.cloud, w.windSpeed, w.ambientTemp, daylight(sim.timeMin))} {w.ambientTemp.toFixed(0)}°C
          <span className="dim"> · {w.windSpeed.toFixed(0)} m/s</span>
        </div>
        <button className="why-button" onClick={() => window.open(DOCS_URL, '_blank')}>
          Docs ↗
        </button>
        <div className="controls">
          <span className="label">View</span>
          <button className={view === 'paddock' ? 'active' : ''} onClick={() => setView('paddock')}>
            Paddock
          </button>
          <button className={view === 'network' ? 'active' : ''} onClick={() => setView('network')}>
            Social graph
          </button>
          <span className="label">Weather</span>
          {WEATHER_MODES.map((m) => (
            <button
              key={m.value}
              className={w.mode === m.value ? 'active' : ''}
              onClick={() => {
                setWeatherMode(sim, m.value);
                setRevision((r) => r + 1);
              }}
            >
              {m.label}
            </button>
          ))}
          <span className="label">Speed</span>
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              className={i === speedIdx && !paused ? 'active' : ''}
              onClick={() => {
                setSpeedIdx(i);
                setPaused(false);
              }}
            >
              {s.label}
            </button>
          ))}
          <button className={paused ? 'active' : ''} onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>
      <div className="main-row">
        {view === 'paddock' ? (
          <PaddockCanvas
            sim={sim}
            analytics={analyticsRef.current}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <NetworkView
            sim={sim}
            analytics={analyticsRef.current}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        <Sidebar
          sim={sim}
          analytics={analyticsRef.current}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChanged={() => setRevision((r) => r + 1)}
        />
      </div>
      <footer className="statusbar">
        <span>{sim.cows.length} collars online</span>
        {BEHAVIOURS.map((b) => (
          <span key={b}>
            {b}: {counts[b]}
          </span>
        ))}
        <span className={activeAlerts > 0 ? 'bad' : ''}>active alerts: {activeAlerts}</span>
      </footer>
    </div>
  );
}
