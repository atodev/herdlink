import { useEffect, useRef, useState } from 'react';
import type { Analytics } from '../sim/analytics';
import { scoreColour } from '../sim/analytics';
import { communityColour } from '../sim/social';
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

/**
 * Force-directed view of the herd's social structure, built purely from
 * collar proximity data. Nodes are coloured by community (label propagation)
 * and sized by strength (weighted degree); watch/alert status appears as a
 * halo ring. Selecting a cow highlights her ego network. Sick cows lose
 * their edges and drift out of their cluster — often before any vital sign
 * is conclusive on its own.
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
      const social = analytics.social;
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

      const edges = social?.edges ?? [];
      const selected = selectedRef.current;
      const egoSet = new Set<number>();
      if (selected != null) {
        egoSet.add(selected);
        for (const e of edges) {
          if (e.a === selected) egoSet.add(e.b);
          if (e.b === selected) egoSet.add(e.a);
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
        const na = nodes.get(e.a);
        const nb = nodes.get(e.b);
        if (!na || !nb) continue;
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
        const na = nodes.get(e.a);
        const nb = nodes.get(e.b);
        if (!na || !nb) continue;
        const inEgo = selected != null && (e.a === selected || e.b === selected);
        const dimmed = selected != null && !inEgo;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        const alpha = Math.min(0.7, 0.15 + e.w * 0.7) * (dimmed ? 0.25 : 1);
        ctx.strokeStyle = inEgo ? `rgba(255, 255, 255, ${alpha})` : `rgba(143, 163, 179, ${alpha})`;
        ctx.lineWidth = Math.max(0.6, Math.min(3, e.w * 4)) * (inEgo ? 1.4 : 1);
        ctx.stroke();
      }

      const now = performance.now();
      const meanStrength = social?.meanStrength ?? 1;
      for (const cow of cows) {
        const node = nodes.get(cow.id)!;
        const score = analytics.assessments.get(cow.id)?.score ?? 0;
        const halo = scoreColour(score);
        const dimmed = selected != null && !egoSet.has(cow.id);

        // Radius by strength relative to herd mean
        const s = social?.strength.get(cow.id) ?? 0;
        const r = 4 + 4 * Math.sqrt(Math.min(2.5, s / Math.max(0.1, meanStrength)));

        ctx.globalAlpha = dimmed ? 0.35 : 1;

        if (halo) {
          const pulse = halo === '#e85a5a' ? 2 + Math.sin(now / 250) * 1.5 : 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2 + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = halo;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (cow.id === selected || cow.id === hoverRef.current) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = cow.id === selected ? '#ffffff' : 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        const label = social?.community.get(cow.id);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = label != null ? communityColour(label) : '#4fc38a';
        ctx.fill();
        ctx.globalAlpha = 1;
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
    let bestD = 16;
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

  const social = analytics.social;
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
      {social && (
        <div className="sg-stats">
          <div className="sg-title">Herd network</div>
          <div><span className="dim">ties (backbone)</span> {social.edges.length}</div>
          <div><span className="dim">density</span> {social.density.toFixed(3)}</div>
          <div><span className="dim">communities</span> {[...social.communitySizes.values()].filter((s) => s >= 3).length}</div>
          <div><span className="dim">mean strength</span> {social.meanStrength.toFixed(1)}</div>
          <div className="sg-hint">
            colour = community · size = strength{'\n'}click a cow to isolate her ego network
          </div>
        </div>
      )}
      {hoverCow && hoverNode && social && (
        <div className="tooltip" style={{ left: hoverNode.x, top: hoverNode.y }}>
          <div className="name">{hoverCow.name}</div>
          <div>
            <span className="dim">strength </span>
            {(social.strength.get(hoverCow.id) ?? 0).toFixed(1)}
            <span className="dim"> (herd {social.meanStrength.toFixed(1)})</span>
          </div>
          <div>
            <span className="dim">degree </span>
            {social.degree.get(hoverCow.id) ?? 0}
            <span className="dim"> · clustering </span>
            {(social.clustering.get(hoverCow.id) ?? 0).toFixed(2)}
          </div>
          <div>
            <span className="dim">community size </span>
            {social.communitySizes.get(social.community.get(hoverCow.id) ?? -1) ?? 1}
          </div>
          {(analytics.assessments.get(hoverCow.id)?.score ?? 0) > 1.2 && (
            <div className="bad">
              anomaly {(analytics.assessments.get(hoverCow.id)?.score ?? 0).toFixed(1)}
              {analytics.assessments.get(hoverCow.id)?.suspected
                ? ` — possible ${analytics.assessments.get(hoverCow.id)!.suspected}`
                : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
