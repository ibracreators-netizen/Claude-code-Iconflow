"use client";
import * as React from "react";
import type { FunnelStage } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const PHASES = ["Attirer", "Engager", "Convertir"];
const HINTS: Record<string, string> = { optin: "formulaire ou réservation", rdv: "au moins un rendez-vous", converti: "statut « converti » horodaté" };

/** Compte de 0 à la valeur à l'arrivée (désactivé si l'utilisateur réduit les animations). */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = React.useState(value);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return;
    let raf = 0; const t0 = performance.now(), dur = 800;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / dur); setShown(Math.round(value * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fr(shown)}</>;
}

/**
 * Entonnoir en flux : une silhouette continue dont l'épaisseur suit le volume de chaque étape
 * (proportionnelle au volume, base = opt-ins de la cohorte ; un trait minimal garde les petites valeurs visibles).
 * Vivant sans tricher : le flux se dessine à l'arrivée, un reflet le parcourt, les chiffres comptent,
 * et le survol d'une étape l'isole et la raconte en une phrase. Une étape non mesurée n'est PAS dessinée.
 */
export function FunnelFlow({ stages, periodDays }: { stages: FunnelStage[]; periodDays: number }) {
  const [active, setActive] = React.useState<number | null>(null);
  const base = stages[0]?.count ?? 0;
  const W = 1000, H = 170, mid = H / 2, minH = 2, maxH = H - 22;
  const n = stages.length, colW = W / n, flat = colW * 0.34;
  const drawn = stages.filter((s) => s.measured);
  const hOf = (s: FunnelStage) => (base > 0 && s.count > 0 ? Math.max(minH, (s.count / base) * maxH) : minH);
  const cx = (i: number) => colW * (i + 0.5);
  const ends = (i: number) => ({ x0: i === 0 ? 12 : cx(i) - flat, x1: i === drawn.length - 1 && i === n - 1 ? W - 12 : cx(i) + flat });

  // Silhouette : plat autour de chaque étape, raccord en courbe entre deux étapes.
  let top = "", bottom = "";
  drawn.forEach((s, i) => {
    const h = hOf(s) / 2, { x0, x1 } = ends(i);
    if (i === 0) top += `M ${x0} ${mid - h} L ${x1} ${mid - h}`;
    else { const px = cx(i - 1) + flat, ph = hOf(drawn[i - 1]) / 2, c = (px + x0) / 2; top += ` C ${c} ${mid - ph}, ${c} ${mid - h}, ${x0} ${mid - h} L ${x1} ${mid - h}`; }
  });
  [...drawn].reverse().forEach((s, ri) => {
    const i = drawn.length - 1 - ri, h = hOf(s) / 2, { x0, x1 } = ends(i);
    if (ri === 0) bottom += ` L ${x1} ${mid + h} L ${x0} ${mid + h}`;
    else { const nx = cx(i + 1) - flat, nh = hOf(drawn[i + 1]) / 2, c = (x1 + nx) / 2; bottom += ` C ${c} ${mid + nh}, ${c} ${mid + h}, ${x1} ${mid + h} L ${x0} ${mid + h}`; }
  });
  const path = drawn.length ? `${top}${bottom} Z` : "";
  const rate = (s: FunnelStage) => (base > 0 ? Math.round((s.count / base) * 100) : 0);
  const story = (i: number): string => {
    const s = stages[i];
    if (!s.measured) return `« ${s.label} » n'est pas encore mesuré : aucun passage horodaté sur la période, donc rien n'est dessiné.`;
    if (i === 0) return `${fr(s.count)} opt-in${s.count > 1 ? "s" : ""} sur ${periodDays} jours : c'est la base de la cohorte.`;
    return `${fr(s.count)} sur ${fr(base)} ${s.key === "rdv" ? (s.count > 1 ? "ont pris un rendez-vous" : "a pris un rendez-vous") : (s.count > 1 ? "sont devenus clients" : "est devenu client")}, soit ${rate(s)} % des opt-ins.`;
  };
  const on = (i: number) => ({ onMouseEnter: () => setActive(i), onMouseLeave: () => setActive((a) => (a === i ? null : a)), onFocus: () => setActive(i), onBlur: () => setActive((a) => (a === i ? null : a)) });

  return (
    <div>
      {/* Phases + valeurs, alignées sur les colonnes du flux */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={s.key} tabIndex={0} {...on(i)} className={cn("rounded-xl px-1 pb-2 outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent/40", active !== null && active !== i && "opacity-45")}>
            <div className="flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-2">
              <span className={cn("size-1.5 rounded-full bg-accent-2 transition-transform duration-200", active === i && "scale-[1.8]")} style={{ opacity: 0.45 + 0.275 * i }} />{String(i + 1).padStart(2, "0")} — {PHASES[i] ?? s.label}
              <span className="ml-1 h-px flex-1 bg-border-strong" />
            </div>
            <div className={cn("mt-5 text-center transition-transform duration-200", active === i && "-translate-y-0.5 scale-[1.06]")}>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">{s.label}</div>
              <div className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular text-fg">{s.measured ? <CountUp value={s.count} /> : "—"}</div>
              <div className="mt-1.5 font-mono text-[10.5px] text-muted">{s.measured ? HINTS[s.key] ?? "" : "non mesuré"}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="motion-safe:animate-funnel-reveal">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-[150px] w-full sm:h-[170px]" preserveAspectRatio="none" role="img"
          aria-label={`Entonnoir de la cohorte des ${periodDays} derniers jours : ${stages.map((s) => `${s.label} ${s.measured ? s.count : "non mesuré"}`).join(", ")}`}>
          <defs>
            <linearGradient id="funnel-flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: "color-mix(in oklab, var(--accent-2) 58%, var(--color-brand))" }} />
              <stop offset="42%" style={{ stopColor: "var(--accent-2)" }} />
              <stop offset="100%" style={{ stopColor: "color-mix(in oklab, var(--accent-2) 72%, black)" }} />
            </linearGradient>
            <linearGradient id="funnel-shine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" /><stop offset="50%" stopColor="#fff" stopOpacity="0.32" /><stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            {path ? <clipPath id="funnel-clip"><path d={path} /></clipPath> : null}
          </defs>
          {/* Ligne de base : le parcours complet, même quand une étape est vide ou non mesurée */}
          <line x1="12" x2={W - 12} y1={mid} y2={mid} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          {path ? <path d={path} fill="url(#funnel-flow)" stroke="url(#funnel-flow)" strokeWidth="10" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
          {/* Reflet qui parcourt le flux, de l'opt-in vers le client */}
          {path ? <g clipPath="url(#funnel-clip)"><rect x="0" y="0" width={W * 0.2} height={H} fill="url(#funnel-shine)" className="[transform-box:fill-box] -translate-x-[120%] motion-safe:animate-funnel-shine" /></g> : null}
          {stages.map((s, i) => (s.measured ? null : <rect key={s.key} x={cx(i) - flat} y={mid - 14} width={flat * 2} height={28} rx={14} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" className="motion-safe:animate-pulse-soft" />))}
          {/* Survol : les autres colonnes s'estompent, l'étape visée ressort */}
          {stages.map((s, i) => <rect key={`dim-${s.key}`} x={colW * i} y="0" width={colW} height={H} fill="var(--surface)" className="pointer-events-none transition-opacity duration-200" style={{ opacity: active !== null && active !== i ? 0.62 : 0 }} />)}
          {stages.map((s, i) => <rect key={`hit-${s.key}`} x={colW * i} y="0" width={colW} height={H} fill="transparent" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive((a) => (a === i ? null : a))} />)}
        </svg>
      </div>

      {/* Part de la cohorte qui atteint chaque étape (jamais un ratio sur les statuts du moment) */}
      <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={s.key} className={cn("text-center transition-opacity duration-200", active !== null && active !== i && "opacity-45")}>
            {i === 0 ? <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">base de la cohorte</div> : (
              <><div className="text-[15px] font-semibold tabular text-fg">{s.measured && base > 0 ? `${rate(s)} %` : "—"}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">des opt-ins → {s.label.toLowerCase()}</div></>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 min-h-[20px] text-center text-[13px] text-fg-2" aria-live="polite">{active === null ? <span className="text-muted">Survole une étape pour la lire en détail.</span> : story(active)}</p>
    </div>
  );
}
