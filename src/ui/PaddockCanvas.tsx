import { useEffect, useRef, useState } from 'react';
import type { Analytics } from '../sim/analytics';
import { scoreColour } from '../sim/analytics';
import { daylight } from '../sim/herd';
import type { Behaviour, Cow, SimState } from '../sim/types';

const BEHAVIOUR_COLOUR: Record<Behaviour, string> = {
  grazing: '#4fc38a',
  walking: '#e8c15a',
  resting: '#7a8fa3',
  ruminating: '#5aa7e8',
};

interface HoverInfo {
  cow: Cow;
  clientX: number;
  clientY: number;
}

interface Props {
  sim: SimState;
  analytics: Analytics;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

/**
 * Imperative canvas renderer: React owns the layout and tooltip, the sim is
 * drawn every animation frame straight from the mutable sim state.
 */
export default function PaddockCanvas({ sim, analytics, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverIdRef = useRef<number | null>(null);
  hoverIdRef.current = hover?.cow.id ?? null;
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    // Rain particles in canvas space, recycled as they fall
    const drops: { x: number; y: number; len: number; speed: number }[] = [];

    const draw = () => {
      const wrap = canvas.parentElement!;
      const dpr = window.devicePixelRatio || 1;
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { width: pw, height: ph, fenceMargin, shadeX, shadeY, shadeRadius } = sim.paddock;
      const weather = sim.weather;
      const scale = Math.min(cw / pw, ch / ph) * 0.94;
      const ox = (cw - pw * scale) / 2;
      const oy = (ch - ph * scale) / 2;
      const px = (x: number) => ox + x * scale;
      const py = (y: number) => oy + y * scale;

      // Paddock, tinted by weather: bright in sun, grey-blue under rain cloud
      ctx.fillStyle = '#10151a';
      ctx.fillRect(0, 0, cw, ch);
      const gloom = Math.max(weather.cloud * 0.5, weather.rain * 0.7);
      const sun = (1 - weather.cloud) * Math.max(0, Math.min(1, (weather.ambientTemp - 18) / 12));
      const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
      let g0 = [28, 46, 34];
      let g1 = [22, 38, 28];
      g0 = g0.map((v, i) => mix(v, [24, 34, 40][i], gloom));
      g1 = g1.map((v, i) => mix(v, [18, 27, 33][i], gloom));
      g0 = g0.map((v, i) => mix(v, [44, 62, 36][i], sun));
      g1 = g1.map((v, i) => mix(v, [36, 54, 30][i], sun));
      const grad = ctx.createLinearGradient(px(0), py(0), px(pw), py(ph));
      grad.addColorStop(0, `rgb(${g0.join(',')})`);
      grad.addColorStop(1, `rgb(${g1.join(',')})`);
      ctx.fillStyle = grad;
      ctx.fillRect(px(0), py(0), pw * scale, ph * scale);

      // Shade trees
      ctx.beginPath();
      ctx.arc(px(shadeX), py(shadeY), shadeRadius * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 24, 14, 0.55)';
      ctx.fill();
      for (const [tx, ty] of [[-0.5, -0.3], [0.3, -0.55], [0.55, 0.35], [-0.25, 0.5], [0, 0]]) {
        ctx.beginPath();
        ctx.arc(px(shadeX + tx * shadeRadius), py(shadeY + ty * shadeRadius), 6 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#22452c';
        ctx.fill();
      }

      // Night: the field darkens, cow markers stay bright (it's a monitoring UI)
      const nightAlpha = (1 - daylight(sim.timeMin)) * 0.52;
      if (nightAlpha > 0.01) {
        ctx.fillStyle = `rgba(6, 10, 28, ${nightAlpha})`;
        ctx.fillRect(px(0), py(0), pw * scale, ph * scale);
      }

      // Virtual fence
      ctx.strokeStyle = '#e8c15a';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        px(fenceMargin),
        py(fenceMargin),
        (pw - 2 * fenceMargin) * scale,
        (ph - 2 * fenceMargin) * scale,
      );
      ctx.setLineDash([]);

      // Cows
      const now = performance.now();
      for (const cow of sim.cows) {
        const cx = px(cow.x);
        const cy = py(cow.y);
        const r = Math.max(3, 2.2 * scale);

        const score = analytics.assessments.get(cow.id)?.score ?? 0;
        const halo = scoreColour(score);
        if (halo) {
          const pulse = halo === '#e85a5a' ? 1.5 + Math.sin(now / 250) * 1.5 : 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 3 + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = halo;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (cow.id === selectedIdRef.current) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (cow.id === hoverIdRef.current) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = BEHAVIOUR_COLOUR[cow.behaviour];
        ctx.fill();

        // Heading tick while moving
        if (Math.hypot(cow.vx, cow.vy) > 0.05) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(cow.heading) * (r + 4), cy + Math.sin(cow.heading) * (r + 4));
          ctx.strokeStyle = BEHAVIOUR_COLOUR[cow.behaviour];
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Rain
      const wantDrops = Math.round(weather.rain * 180);
      while (drops.length < wantDrops) {
        drops.push({ x: Math.random() * cw, y: Math.random() * ch, len: 6 + Math.random() * 8, speed: 6 + Math.random() * 5 });
      }
      drops.length = Math.min(drops.length, wantDrops);
      if (drops.length > 0) {
        const slant = weather.windSpeed * 0.25;
        ctx.strokeStyle = 'rgba(160, 190, 215, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + slant, d.y + d.len);
          d.y += d.speed;
          d.x += slant * 0.6;
          if (d.y > ch) {
            d.y = -10;
            d.x = Math.random() * cw;
          }
        }
        ctx.stroke();
      }

      // Wind arrow (bottom-right of paddock)
      if (weather.windSpeed > 3) {
        const ax = px(pw) - 30;
        const ay = py(ph) - 26;
        const len = 8 + weather.windSpeed * 1.6;
        const dx = Math.cos(weather.windDir);
        const dy = Math.sin(weather.windDir);
        ctx.strokeStyle = 'rgba(220, 230, 238, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax - dx * len, ay - dy * len);
        ctx.lineTo(ax + dx * len, ay + dy * len);
        ctx.moveTo(ax + dx * len, ay + dy * len);
        ctx.lineTo(ax + dx * len - (dx * 6 - dy * 4), ay + dy * len - (dy * 6 + dx * 4));
        ctx.moveTo(ax + dx * len, ay + dy * len);
        ctx.lineTo(ax + dx * len - (dx * 6 + dy * 4), ay + dy * len - (dy * 6 - dx * 4));
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sim, analytics]);

  const findCow = (clientX: number, clientY: number): Cow | null => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const { width: pw, height: ph } = sim.paddock;
    const scale = Math.min(cw / pw, ch / ph) * 0.94;
    const ox = (cw - pw * scale) / 2;
    const oy = (ch - ph * scale) / 2;
    const mx = (clientX - rect.left - ox) / scale;
    const my = (clientY - rect.top - oy) / scale;

    let best: Cow | null = null;
    let bestD = 10 / scale + 3; // ~10px pick radius in paddock metres
    for (const cow of sim.cows) {
      const d = Math.hypot(cow.x - mx, cow.y - my);
      if (d < bestD) {
        bestD = d;
        best = cow;
      }
    }
    return best;
  };

  const hoverAssessment = hover ? analytics.assessments.get(hover.cow.id) : undefined;

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const cow = findCow(e.clientX, e.clientY);
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(cow ? { cow, clientX: e.clientX - rect.left, clientY: e.clientY - rect.top } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const cow = findCow(e.clientX, e.clientY);
          onSelect(cow ? cow.id : null);
        }}
      />
      <div className="legend">
        <div className="legend-group">
          {(Object.keys(BEHAVIOUR_COLOUR) as Behaviour[]).map((b) => (
            <span key={b} className="legend-item">
              <span className="legend-dot" style={{ background: BEHAVIOUR_COLOUR[b] }} />
              {b}
            </span>
          ))}
        </div>
        <div className="legend-group">
          <span className="legend-item">
            <span className="legend-ring" style={{ borderColor: '#e8a15a' }} />
            watch
          </span>
          <span className="legend-item">
            <span className="legend-ring" style={{ borderColor: '#e85a5a' }} />
            alert
          </span>
          <span className="legend-item">
            <span className="legend-ring" style={{ borderColor: '#ffffff' }} />
            selected
          </span>
          <span className="legend-item">
            <span className="legend-line" />
            virtual fence
          </span>
        </div>
      </div>
      {hover && (
        <div className="tooltip" style={{ left: hover.clientX, top: hover.clientY }}>
          <div className="name">{hover.cow.name}</div>
          <div>
            <span className="dim">Behaviour: </span>
            {hover.cow.behaviour}
          </div>
          <div>
            <span className="dim">Speed (5-min avg): </span>
            {hover.cow.avgSpeed.toFixed(2)} m/s
          </div>
          <div>
            <span className="dim">Temp: </span>
            {hover.cow.temperature.toFixed(1)} °C
            <span className="dim"> · Rumination: </span>
            {Math.round(hover.cow.ruminationRate * 60)} min/h
          </div>
          {hoverAssessment && hoverAssessment.score > 1.2 && (
            <div className="bad">
              anomaly {hoverAssessment.score.toFixed(1)}
              {hoverAssessment.suspected ? ` — possible ${hoverAssessment.suspected}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
