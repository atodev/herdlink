import { useEffect, useRef, useState } from 'react';
import type { Analytics } from '../sim/analytics';
import { pairKey, scoreColour } from '../sim/analytics';
import type { Cow, SimState } from '../sim/types';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Props {
  sim: SimState;
  analytics: Analytics;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

/** Edges worth drawing: cows together at least this fraction of recent time */
const EDGE_MIN = 0.25;

/**
 * Force-directed view of the herd's social structure, built purely from
 * collar proximity data. Sick cows lose their edges and drift out of their
 * cluster — often before any vital sign is conclusive on its own.
 */
export default function NetworkView({ sim, analytics, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<number, Node>>(new Map());
  const [hoverId, setHoverId] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hoverId;
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selectedId;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const step = () => {
      const wrap = canvas.parentElement!;
      const dpr = window.devicePixelRatio || 1;
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cows = sim.cows;
      const nodes = nodesRef.current;
      // Seed new nodes from paddock positions so clusters start roughly right
      for (const cow of cows) {
        if (!nodes.has(cow.id)) {
          nodes.set(cow.id, {
            x: (cow.x / sim.paddock.width) * cw * 0.8 + cw * 0.1,
            y: (cow.y / sim.paddock.height) * ch * 0.8 + ch * 0.1,
            vx: 0,
            vy: 0,
          });
        }
      }

      // Collect display edges
      const edges: { a: Cow; b: Cow; w: number }[] = [];
      for (let i = 0; i < cows.length; i++) {
        for (let j = i + 1; j < cows.length; j++) {
          const w = analytics.association.get(pairKey(cows[i].id, cows[j].id)) ?? 0;
          if (w > EDGE_MIN) edges.push({ a: cows[i], b: cows[j], w });
        }
      }

      // --- Physics: repulsion + spring edges + centre gravity ---
      const centreX = cw / 2;
      const centreY = ch / 2;
      for (let i = 0; i < cows.length; i++) {
        const ni = nodes.get(cows[i].id)!;
        for (let j = i + 1; j < cows.length; j++) {
          const nj = nodes.get(cows[j].id)!;
          let dx = nj.x - ni.x;
          let dy = nj.y - ni.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const rep = 900 / d2;
          const d = Math.sqrt(d2);
          ni.vx -= (dx / d) * rep;
          ni.vy -= (dy / d) * rep;
          nj.vx += (dx / d) * rep;
          nj.vy += (dy / d) * rep;
        }
        ni.vx += (centreX - ni.x) * 0.002;
        ni.vy += (centreY - ni.y) * 0.002;
      }
      for (const e of edges) {
        const na = nodes.get(e.a.id)!;
        const nb = nodes.get(e.b.id)!;
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const d = Math.hypot(dx, dy) || 1;
        const rest = 40 + (1 - Math.min(1, e.w)) * 60;
        const force = (d - rest) * 0.004 * Math.min(1, e.w * 2);
        na.vx += (dx / d) * force * d * 0.02;
        na.vy += (dy / d) * force * d * 0.02;
        nb.vx -= (dx / d) * force * d * 0.02;
        nb.vy -= (dy / d) * force * d * 0.02;
      }
      for (const node of nodes.values()) {
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += Math.max(-4, Math.min(4, node.vx));
        node.y += Math.max(-4, Math.min(4, node.vy));
        node.x = Math.max(15, Math.min(cw - 15, node.x));
        node.y = Math.max(15, Math.min(ch - 15, node.y));
      }

      // --- Draw ---
      ctx.fillStyle = '#10151a';
      ctx.fillRect(0, 0, cw, ch);

      for (const e of edges) {
        const na = nodes.get(e.a.id)!;
        const nb = nodes.get(e.b.id)!;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.strokeStyle = `rgba(143, 163, 179, ${Math.min(0.55, e.w * 0.7)})`;
        ctx.lineWidth = Math.min(2.5, e.w * 3);
        ctx.stroke();
      }

      const now = performance.now();
      for (const cow of cows) {
        const node = nodes.get(cow.id)!;
        const score = analytics.assessments.get(cow.id)?.score ?? 0;
        const halo = scoreColour(score);

        if (halo) {
          const pulse = halo === '#e85a5a' ? 2 + Math.sin(now / 250) * 1.5 : 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 8 + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = halo;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (cow.id === selectedRef.current || cow.id === hoverRef.current) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 11, 0, Math.PI * 2);
          ctx.strokeStyle = cow.id === selectedRef.current ? '#ffffff' : 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = halo ?? '#4fc38a';
        ctx.fill();
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sim, analytics]);

  const findCow = (clientX: number, clientY: number): Cow | null => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best: Cow | null = null;
    let bestD = 14;
    for (const cow of sim.cows) {
      const node = nodesRef.current.get(cow.id);
      if (!node) continue;
      const d = Math.hypot(node.x - mx, node.y - my);
      if (d < bestD) {
        bestD = d;
        best = cow;
      }
    }
    return best;
  };

  const hoverCow = hoverId != null ? sim.cows.find((c) => c.id === hoverId) : undefined;
  const hoverNode = hoverId != null ? nodesRef.current.get(hoverId) : undefined;

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => setHoverId(findCow(e.clientX, e.clientY)?.id ?? null)}
        onMouseLeave={() => setHoverId(null)}
        onClick={(e) => onSelect(findCow(e.clientX, e.clientY)?.id ?? null)}
      />
      {hoverCow && hoverNode && (
        <div className="tooltip" style={{ left: hoverNode.x, top: hoverNode.y }}>
          <div className="name">{hoverCow.name}</div>
          <div>
            <span className="dim">Anomaly score: </span>
            {(analytics.assessments.get(hoverCow.id)?.score ?? 0).toFixed(1)}
          </div>
          {(analytics.assessments.get(hoverCow.id)?.signals ?? []).map((s) => (
            <div key={s} className="dim">
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
