"use client";
import * as React from "react";
import { useTheme } from "@/lib/hooks/use-local-pref";

/**
 * Visuel « Brain » : nuage de points sur une sphère reliés par de fins segments,
 * dessiné en Canvas 2D, rotation lente (désactivée si l'utilisateur réduit les animations).
 */
export function BrainVisual({ className, points = 520, density = 1 }: { className?: string; points?: number; density?: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [theme] = useTheme();
  React.useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0; let angle = 0; let alive = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Points déterministes sur une sphère (spirale de Fibonacci) avec une légère déformation organique.
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pts = Array.from({ length: points }, (_, i) => {
      const y = 1 - (i / (points - 1)) * 2; const r = Math.sqrt(1 - y * y); const t = i * 2.399963;
      const wobble = 0.86 + rnd() * 0.22;
      return { x: Math.cos(t) * r * wobble, y: y * 0.82 * wobble, z: Math.sin(t) * r * wobble, s: 0.6 + rnd() * 1.2 };
    });
    const links: Array<[number, number]> = [];
    for (let i = 0; i < pts.length; i++) {
      let best = -1, bd = 9; let second = -1, sd = 9;
      for (let j = 0; j < pts.length; j += 3) { if (j === i) continue; const a = pts[i], b = pts[j]; const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (d < bd) { second = best; sd = bd; best = j; bd = d; } else if (d < sd) { second = j; sd = d; } }
      if (best >= 0 && bd < 0.08 * density) links.push([i, best]); if (second >= 0 && sd < 0.05 * density) links.push([i, second]);
    }
    const dark = theme === "dark";
    const dot = dark ? [120, 236, 150] : [47, 107, 63];
    const line = dark ? "rgba(120,236,150," : "rgba(47,107,63,";
    const draw = () => {
      if (!alive) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.42; const cx = w / 2, cy = h / 2;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const proj = pts.map((p) => { const x = p.x * ca - p.z * sa; const z = p.x * sa + p.z * ca; const depth = (z + 1.2) / 2.4; return { sx: cx + x * R, sy: cy + p.y * R, depth, s: p.s }; });
      ctx.lineWidth = 0.6;
      for (const [a, b] of links) { const A = proj[a], B = proj[b]; const al = 0.06 + ((A.depth + B.depth) / 2) * 0.22; ctx.strokeStyle = `${line}${al.toFixed(3)})`; ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke(); }
      for (const p of proj) { const al = 0.25 + p.depth * 0.7; ctx.fillStyle = `rgba(${dot[0]},${dot[1]},${dot[2]},${al.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, p.s * (0.7 + p.depth * 0.8), 0, Math.PI * 2); ctx.fill(); }
      if (!reduce) { angle += 0.0025; raf = requestAnimationFrame(draw); }
    };
    draw();
    const ro = new ResizeObserver(() => { if (reduce) draw(); });
    ro.observe(canvas);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [theme, points, density]);
  return <canvas ref={ref} className={className} aria-hidden role="presentation" />;
}
