import type { Analytics } from '../sim/analytics';
import { ALERT_AT, WATCH_AT } from '../sim/analytics';
import type { Condition, Cow, SimState } from '../sim/types';
import { formatSimClock, setCondition } from '../sim/herd';
import Sparkline from './Sparkline';

const CONDITIONS: { value: Condition; label: string; blurb: string }[] = [
  { value: 'lame', label: 'Lame', blurb: 'slow, lags the herd, lies down more' },
  { value: 'ill', label: 'Ill', blurb: 'fever, rumination drops, withdraws from herd' },
  { value: 'oestrus', label: 'Oestrus', blurb: 'restless, high activity' },
];

interface Props {
  sim: SimState;
  analytics: Analytics;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** bump to force a re-render after mutating the sim */
  onChanged: () => void;
}

export default function Sidebar({ sim, analytics, selectedId, onSelect, onChanged }: Props) {
  const selected = selectedId != null ? sim.cows.find((c) => c.id === selectedId) : undefined;
  const affected = sim.cows.filter((c) => c.condition !== 'healthy');
  const assessment = selected ? analytics.assessments.get(selected.id) : undefined;

  const inject = (cow: Cow, condition: Condition) => {
    setCondition(cow, condition, sim.timeMin);
    onChanged();
  };

  const randomHealthy = () => {
    const healthy = sim.cows.filter((c) => c.condition === 'healthy');
    return healthy.length ? healthy[Math.floor(Math.random() * healthy.length)] : null;
  };

  return (
    <aside className="sidebar">
      <section>
        <h2>Alerts</h2>
        {analytics.alerts.length === 0 ? (
          <p className="hint">No alerts. Inject an anomaly and let the detector find it.</p>
        ) : (
          <ul className="alert-list">
            {analytics.alerts.slice(0, 8).map((a) => (
              <li key={a.id} className={a.resolvedAt === null ? 'alert-active' : 'alert-resolved'}>
                <button className="link" onClick={() => onSelect(a.cowId)}>
                  {a.cowName}
                </button>
                <span className="dim"> {formatSimClock(a.raisedAt)}</span>
                <div className="alert-msg">
                  {a.message}
                  {a.resolvedAt !== null && <span className="dim"> (resolved)</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Selected cow</h2>
        {selected ? (
          <div className="cow-card">
            <div className="cow-name">{selected.name}</div>
            <dl>
              <dt>Behaviour</dt>
              <dd>{selected.behaviour}</dd>
              <dt>Speed (5-min)</dt>
              <dd>{selected.avgSpeed.toFixed(2)} m/s</dd>
              <dt>Temperature</dt>
              <dd>{selected.temperature.toFixed(1)} °C</dd>
              <dt>Rumination</dt>
              <dd>{Math.round(selected.ruminationRate * 60)} min/h</dd>
              <dt>Anomaly score</dt>
              <dd className={assessment && assessment.score > ALERT_AT ? 'bad' : assessment && assessment.score > WATCH_AT ? 'warn' : ''}>
                {(assessment?.score ?? 0).toFixed(1)}
                {assessment?.suspected ? ` — ${assessment.suspected}?` : ''}
              </dd>
              <dt>Condition</dt>
              <dd className={selected.condition !== 'healthy' ? 'bad' : ''}>
                {selected.condition}
                {selected.conditionSince != null && (
                  <span className="dim"> since {formatSimClock(selected.conditionSince)}</span>
                )}
              </dd>
            </dl>
            {assessment && assessment.signals.length > 0 && (
              <ul className="signal-list">
                {assessment.signals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            <Sparkline
              label="Speed, 24 h (herd dashed)"
              series={selected.history.map((h) => h.speed)}
              compare={analytics.herdHistory.map((h) => h.speed)}
              value={`${selected.avgSpeed.toFixed(2)} m/s`}
            />
            <Sparkline
              label="Rumination, 24 h"
              series={selected.history.map((h) => h.rumination * 60)}
              compare={analytics.herdHistory.map((h) => h.rumination * 60)}
              value={`${Math.round(selected.ruminationRate * 60)} min/h`}
              colour="#5aa7e8"
            />
            <Sparkline
              label="Temperature, 24 h"
              series={selected.history.map((h) => h.temperature)}
              compare={analytics.herdHistory.map((h) => h.temperature)}
              value={`${selected.temperature.toFixed(1)} °C`}
              colour="#e8a15a"
            />
            <div className="inject-buttons">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  title={c.blurb}
                  disabled={selected.condition === c.value}
                  onClick={() => inject(selected, c.value)}
                >
                  Make {c.label.toLowerCase()}
                </button>
              ))}
              <button
                disabled={selected.condition === 'healthy'}
                onClick={() => inject(selected, 'healthy')}
              >
                Cure
              </button>
            </div>
          </div>
        ) : (
          <p className="hint">Click a cow on the paddock to select it.</p>
        )}
      </section>

      <section>
        <h2>Inject anomaly</h2>
        <p className="hint">
          Apply a hidden condition to a random cow — ground truth the analytics layer
          (phase 3) will have to detect.
        </p>
        <div className="inject-buttons">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              title={c.blurb}
              onClick={() => {
                const cow = randomHealthy();
                if (cow) {
                  inject(cow, c.value);
                  onSelect(cow.id);
                }
              }}
            >
              Random {c.label.toLowerCase()}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Ground truth ({affected.length})</h2>
        {affected.length === 0 ? (
          <p className="hint">All cows healthy.</p>
        ) : (
          <ul className="affected-list">
            {affected.map((c) => (
              <li key={c.id}>
                <button className="link" onClick={() => onSelect(c.id)}>
                  {c.name}
                </button>
                <span className="bad"> {c.condition}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
