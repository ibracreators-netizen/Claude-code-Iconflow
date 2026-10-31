"use client";
import * as React from "react";
import { useTheme } from "@/lib/hooks/use-local-pref";

/**
 * Visuel « Brain » : un cerveau en trois dimensions fait de particules.
 *  - Points répartis sur une forme de cerveau : deux hémisphères séparés par une fente, lobe frontal plus étroit,
 *    face inférieure plate, cervelet, surface plissée par un bruit trigonométrique (gyri).
 *  - Projection perspective maison vers un Canvas 2D (pas de WebGL) ; profondeur rendue par la taille et l'opacité.
 *  - Rotation lente et continue autour de l'axe vertical, légère inclinaison qui respire ; glisser fait tourner.
 *  - Impulsions lumineuses qui circulent le long de connexions courbes (arcs au-dessus de la surface) avec traînée.
 *  - Couleurs lues dans le thème (vert accent, plus lumineux en sombre), devicePixelRatio géré (plafonné à 2),
 *    pause hors écran, image fixe si l'utilisateur réduit les animations, nettoyage complet au démontage.
 * Même signature qu'avant : className, points (≈ 2 500 par défaut), density (connexions et impulsions).
 */

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
const FOCAL = 3.4;

type Rgb = [number, number, number];
interface PathDef { a: number; b: number; cx: number; cy: number; cz: number; particles: Array<{ t: number; v: number; s: number }> }
interface Scene { count: number; pts: Float32Array; size: Float32Array; lum: Float32Array; links: Uint32Array; paths: PathDef[] }

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Bruit « gyri » : des crêtes serpentines, déterministes (≈ −1,5 … 1,5). */
function gyri(x: number, y: number, z: number) {
  return Math.sin(x * 7.6 + Math.sin(z * 3.7) * 1.9) * Math.cos(y * 6.2 + x * 1.8) + 0.5 * Math.sin((x + z) * 11.3 + y * 2.9);
}

/** Point d'une sphère unité → surface d'un hémisphère cérébral (x gauche-droite, y haut-bas, z avant-arrière) + relief local. */
function brainSurface(x: number, y: number, z: number): [number, number, number, number] {
  const side = x < 0 ? -1 : 1; const ax = Math.abs(x);
  let X = side * (0.11 + ax * 0.89);                                   // fente interhémisphérique
  let Y = y >= 0 ? y : y * 0.7;                                        // face inférieure plus plate
  const Z = z;
  if (ax < 0.26 && Y > 0.1) Y -= 0.14 * (1 - ax / 0.26);               // sillon longitudinal, visible du dessus
  X *= 1 - 0.16 * Math.max(0, Z) ** 2;                                 // lobe frontal plus étroit
  Y += 0.07 * Z * (Y > 0 ? 1 : 0.4);                                   // le dessus descend vers l'arrière
  if (Y < 0 && Y > -0.5) X *= 1 + 0.1 * (1 - Math.abs(Y + 0.25) / 0.25); // lobes temporaux
  Y *= 0.82; const Zs = Z * 1.2;
  const g = gyri(X, Y, Zs);
  const r = 1 + 0.055 * g;
  return [X * r, Y * r, Zs * r, g];
}

function buildScene(points: number, density: number): Scene {
  const count = Math.max(200, Math.min(6000, Math.round(points)));
  const nCer = Math.round(count * 0.09); const nMain = count - nCer;
  const pts = new Float32Array(count * 3); const size = new Float32Array(count); const lum = new Float32Array(count);
  const rnd = rng(7);
  // Les crêtes (gyri) sont plus claires, les sillons plus sombres : le relief se lit même en projection.
  const shade = (g: number, y: number) => Math.min(1, Math.max(0.3, 0.62 + 0.3 * (g / 1.5))) * (y < -0.3 ? 0.85 : 1);
  for (let i = 0; i < nMain; i++) {
    const y = 1 - (i / (nMain - 1)) * 2; const r = Math.sqrt(Math.max(0, 1 - y * y)); const t = i * GOLDEN;
    const [X, Y, Z, g] = brainSurface(Math.cos(t) * r, y, Math.sin(t) * r);
    pts[i * 3] = X; pts[i * 3 + 1] = Y; pts[i * 3 + 2] = Z; size[i] = 0.7 + rnd() * 0.9; lum[i] = shade(g, Y);
  }
  for (let j = 0; j < nCer; j++) {                                      // cervelet : petite masse arrière-basse, plis plus fins
    const i = nMain + j; const y = 1 - (j / Math.max(1, nCer - 1)) * 2; const r = Math.sqrt(Math.max(0, 1 - y * y)); const t = j * GOLDEN;
    const x = Math.cos(t) * r, z = Math.sin(t) * r; const g = gyri(x * 2.2, y * 2.2, z * 2.2); const k = 1 + 0.05 * g;
    pts[i * 3] = x * 0.46 * k; pts[i * 3 + 1] = -0.5 + y * 0.26 * k; pts[i * 3 + 2] = -0.62 + z * 0.36 * k; size[i] = 0.6 + rnd() * 0.7; lum[i] = shade(g, -0.5) * 0.9;
  }
  // Liens courts entre voisins (un point sur deux) via une grille spatiale : texture de maillage, sans O(n²).
  const cell = 0.16; const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < count; i++) { const k = key(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]); const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]); }
  const linkList: number[] = []; const linked = new Set<string>();
  for (let i = 0; i < count; i += 2) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
    let best = -1, bd = 0.028 * density;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`); if (!bucket) continue;
      for (const j of bucket) { if (j === i) continue; const d = (pts[j * 3] - x) ** 2 + (pts[j * 3 + 1] - y) ** 2 + (pts[j * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = j; } }
    }
    if (best >= 0) { const k = i < best ? `${i}-${best}` : `${best}-${i}`; if (!linked.has(k)) { linked.add(k); linkList.push(i, best); } }
  }
  // Trajets : arcs entre deux points éloignés, point de contrôle poussé hors de la surface.
  const paths: PathDef[] = [];
  const nPaths = Math.max(6, Math.min(80, Math.round(26 * density)));
  for (let p = 0; p < nPaths; p++) {
    const a = Math.floor(rnd() * nMain); let b = -1;
    for (let tries = 0; tries < 24 && b < 0; tries++) {
      const c = Math.floor(rnd() * nMain); const d = Math.hypot(pts[c * 3] - pts[a * 3], pts[c * 3 + 1] - pts[a * 3 + 1], pts[c * 3 + 2] - pts[a * 3 + 2]);
      if (d > 0.55 && d < 1.6) b = c;
    }
    if (b < 0) continue;
    const mx = (pts[a * 3] + pts[b * 3]) / 2, my = (pts[a * 3 + 1] + pts[b * 3 + 1]) / 2, mz = (pts[a * 3 + 2] + pts[b * 3 + 2]) / 2;
    const len = Math.hypot(mx, my, mz) || 1; const lift = (len + 0.36) / len;
    const particles = Array.from({ length: 1 + (rnd() < 0.45 ? 1 : 0) }, () => ({ t: rnd(), v: 0.0025 + rnd() * 0.0045, s: 1.3 + rnd() * 1.1 }));
    paths.push({ a, b, cx: mx * lift, cy: my * lift, cz: mz * lift, particles });
  }
  return { count, pts, size, lum, links: Uint32Array.from(linkList), paths };
}

function parseColor(v: string): Rgb | null {
  const s = v.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)?.[1];
  if (hex) { const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

function sprite(size: number, core: Rgb, halo: Rgb, coreAlpha: number) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"); if (!g) return c;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(core, coreAlpha)); grad.addColorStop(0.3, rgba(halo, 0.55)); grad.addColorStop(1, rgba(halo, 0));
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return c;
}

export function BrainVisual({ className, points = 2500, density = 1 }: { className?: string; points?: number; density?: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [theme] = useTheme();

  React.useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = theme === "dark";
    const css = getComputedStyle(document.documentElement);
    const accent = parseColor(css.getPropertyValue("--accent")) ?? (dark ? [91, 230, 131] : [47, 107, 63]);
    const accent2 = parseColor(css.getPropertyValue("--accent-2")) ?? accent;
    const bright: Rgb = dark ? [196, 255, 214] : [91, 230, 131];
    const glowHalo: Rgb = dark ? accent2 : [91, 230, 131];
    const head = sprite(64, dark ? [255, 255, 255] : bright, glowHalo, 1);
    const tail = sprite(48, bright, glowHalo, 0.9);

    const scene = buildScene(points, density);
    const { count, pts, size, lum, links, paths } = scene;
    const px = new Float32Array(count), py = new Float32Array(count), pd = new Float32Array(count);

    let angle = reduce ? 0.7 : 0.4; let vel = 0; let dragging = false; let lastX = 0;
    let raf = 0; let alive = true; let visible = true; let last = performance.now(); let clock = 0;

    const project = (x: number, y: number, z: number, ca: number, sa: number, ct: number, st: number, cx: number, cy: number, R: number) => {
      const x1 = x * ca + z * sa; const z1 = -x * sa + z * ca;
      const y2 = y * ct - z1 * st; const z2 = y * st + z1 * ct;
      const pers = FOCAL / (FOCAL - z2);
      return { sx: cx + x1 * R * pers, sy: cy - y2 * R * pers, depth: Math.min(1, Math.max(0, (z2 + 1.25) / 2.5)), pers };
    };

    const frame = (advance: boolean) => {
      if (!alive) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const now = performance.now(); const dt = advance ? Math.min(3, (now - last) / 16.667) : 0; last = now; clock += dt;
      if (advance && !dragging) { angle += 0.0032 * dt + vel; vel *= 0.94; }
      const tilt = -0.3 + 0.05 * Math.sin(clock * 0.006);
      const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(tilt), st = Math.sin(tilt);
      const R = Math.min(w, h) * 0.38; const cx = w / 2, cy = h / 2 + R * 0.05; const scale = Math.min(1.6, Math.max(0.6, R / 150));

      // Halo de fond
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
      bg.addColorStop(0, rgba(accent, dark ? 0.16 : 0.09)); bg.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < count; i++) { const p = project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], ca, sa, ct, st, cx, cy, R); px[i] = p.sx; py[i] = p.sy; pd[i] = p.depth; }

      // Liens courts, trois niveaux de profondeur
      ctx.lineWidth = 0.6 * scale;
      for (let b = 0; b < 3; b++) {
        ctx.strokeStyle = rgba(accent, (dark ? [0.06, 0.12, 0.2] : [0.07, 0.12, 0.18])[b]);
        ctx.beginPath();
        for (let l = 0; l < links.length; l += 2) { const i = links[l], j = links[l + 1]; const d = (pd[i] + pd[j]) / 2; if (Math.min(2, Math.floor(d * 3)) !== b) continue; ctx.moveTo(px[i], py[i]); ctx.lineTo(px[j], py[j]); }
        ctx.stroke();
      }
      // Points, six niveaux de luminosité (profondeur × relief) : taille et opacité
      for (let b = 0; b < 6; b++) {
        ctx.fillStyle = rgba(accent, (dark ? 0.12 : 0.16) + (b / 5) * (dark ? 0.84 : 0.76));
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (Math.min(5, Math.floor(pd[i] * lum[i] * 6)) !== b) continue;
          const r = size[i] * (0.45 + pd[i] * 0.95) * scale;
          ctx.moveTo(px[i] + r, py[i]); ctx.arc(px[i], py[i], r, 0, TAU);
        }
        ctx.fill();
      }
      // Trajets (arcs discrets)
      ctx.strokeStyle = rgba(accent, dark ? 0.11 : 0.1); ctx.lineWidth = 0.7 * scale;
      ctx.beginPath();
      for (const p of paths) { const c = project(p.cx, p.cy, p.cz, ca, sa, ct, st, cx, cy, R); ctx.moveTo(px[p.a], py[p.a]); ctx.quadraticCurveTo(c.sx, c.sy, px[p.b], py[p.b]); }
      ctx.stroke();
      // Impulsions lumineuses avec traînée
      for (const p of paths) {
        const ax = pts[p.a * 3], ay = pts[p.a * 3 + 1], az = pts[p.a * 3 + 2], bx = pts[p.b * 3], by = pts[p.b * 3 + 1], bz = pts[p.b * 3 + 2];
        for (const q of p.particles) {
          if (advance) { q.t += q.v * dt; if (q.t > 1) q.t -= 1; }
          for (let k = 0; k < 8; k++) {
            const t = q.t - k * 0.022; if (t < 0) break;
            const u = 1 - t; const w0 = u * u, w1 = 2 * u * t, w2 = t * t;
            const pr = project(w0 * ax + w1 * p.cx + w2 * bx, w0 * ay + w1 * p.cy + w2 * by, w0 * az + w1 * p.cz + w2 * bz, ca, sa, ct, st, cx, cy, R);
            const alpha = (0.25 + pr.depth * 0.75) * (1 - k / 8) ** 1.7 * (dark ? 1 : 0.9);
            const sz = q.s * (k === 0 ? 3.4 : 2.3 - k * 0.16) * pr.pers * scale * 2.2;
            ctx.globalAlpha = alpha;
            ctx.drawImage(k === 0 ? head : tail, pr.sx - sz / 2, pr.sy - sz / 2, sz, sz);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => { if (!alive || !visible) return; frame(true); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); if (reduce) frame(false); else { last = performance.now(); raf = requestAnimationFrame(loop); } };

    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) start(); else cancelAnimationFrame(raf); }, { threshold: 0 });
    io.observe(canvas);
    const ro = new ResizeObserver(() => { if (reduce) frame(false); });
    ro.observe(canvas);

    // Glisser pour tourner (défilement vertical préservé sur mobile grâce à touch-action: pan-y).
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; vel = 0; try { canvas.setPointerCapture(e.pointerId); } catch {} };
    const onMove = (e: PointerEvent) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; angle += dx * 0.0085; vel = dx * 0.004; if (reduce) frame(false); };
    const onUp = () => { dragging = false; };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp); canvas.addEventListener("pointerleave", onUp);

    start();
    return () => {
      alive = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp); canvas.removeEventListener("pointerleave", onUp);
    };
  }, [theme, points, density]);

  return <canvas ref={ref} className={className} style={{ touchAction: "pan-y", cursor: "grab" }} aria-hidden role="presentation" />;
}
