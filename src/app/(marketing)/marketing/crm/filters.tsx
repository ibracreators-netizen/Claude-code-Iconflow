"use client";
import * as React from "react";
import { NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import type { Member, Stage } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

export type Period = "" | "jour" | "7" | "30" | "90" | "dates";
export interface Filters { q: string; mine: boolean; stage: string; setter: string; closer: string; source: string; withTask: boolean; period: Period; from: string; to: string }
export const NO_FILTERS: Filters = { q: "", mine: false, stage: "", setter: "", closer: "", source: "", withTask: false, period: "", from: "", to: "" };
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "", label: "Toutes les dates" }, { value: "jour", label: "Aujourd'hui" }, { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" }, { value: "90", label: "90 derniers jours" }, { value: "dates", label: "Entre deux dates" },
];

/** Nombre de filtres posés (la recherche et l'onglet « Mes prospects » se voient déjà ailleurs, sauf `withMine`). */
export const activeFilters = (f: Filters, opts: { stage: boolean; withMine?: boolean }) =>
  [opts.stage && f.stage, f.setter, f.closer, f.source, f.withTask, f.period && (f.period !== "dates" || f.from || f.to), opts.withMine && f.mine].filter(Boolean).length;

const minusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Applique les filtres. `dayOf` donne le jour local (fuseau des réglages) d'un horodatage ; `today` est le jour local. */
export function matcher(f: Filters, ctx: { me: string; stage: boolean; today: string; dayOf: (iso: string) => string; text: (p: ProspectRow) => Array<string | null | undefined> }) {
  const t = f.q.trim().toLowerCase();
  const since = f.period === "jour" ? ctx.today : f.period === "7" ? minusDays(ctx.today, 6) : f.period === "30" ? minusDays(ctx.today, 29) : f.period === "90" ? minusDays(ctx.today, 89) : f.period === "dates" ? f.from : "";
  const until = f.period === "dates" ? f.to : "";
  return (r: ProspectRow) => {
    if (ctx.stage && f.stage && r.stage_id !== f.stage) return false;
    if (f.setter && (f.setter === "aucun" ? r.setter_id : r.setter_id !== f.setter)) return false;
    if (f.closer && (f.closer === "aucun" ? r.closer_id : r.closer_id !== f.closer)) return false;
    if (f.source && (f.source === "aucune" ? r.source : r.source !== f.source)) return false;
    if (f.withTask && !r.openTasks) return false;
    if (f.mine && r.setter_id !== ctx.me && r.closer_id !== ctx.me) return false;
    if (since || until) { const d = ctx.dayOf(r.created_at); if ((since && d < since) || (until && d > until)) return false; }
    if (t && !ctx.text(r).some((v) => (v ?? "").toLowerCase().includes(t))) return false;
    return true;
  };
}

/** Les champs de filtre, partagés par le volet de droite (ordinateur) et la feuille du bas (téléphone). */
export function FilterFields({ f, set, members, sources, stages, showStage, showMine, big }: {
  f: Filters; set: (patch: Partial<Filters>) => void; members: Member[]; sources: string[]; stages: Stage[]; showStage: boolean; showMine: boolean; big?: boolean;
}) {
  const id = React.useId();
  const select = cn("w-full rounded-[8px] border-mk-input bg-surface text-mk-strong", big ? "h-12 rounded-[10px] text-[16px]" : "h-10 text-[14px]");
  const label = cn("mb-1.5 block font-medium text-mk-text", big ? "text-[15px]" : "text-[14px]");
  const row = cn("flex items-center justify-between gap-4 font-medium text-mk-text", big ? "min-h-12 text-[16px]" : "min-h-10 text-[14px]");
  const people = members.filter((m) => m.marketing_role !== "media_buyer");
  return (
    <div className="space-y-4">
      {showMine ? <label className={row}><span>Seulement mes prospects</span><Switch checked={f.mine} onCheckedChange={(v) => set({ mine: v })} /></label> : null}
      {showStage ? (
        <div><label htmlFor={`${id}-etape`} className={label}>Étape</label>
          <NativeSelect id={`${id}-etape`} value={f.stage} onChange={(e) => set({ stage: e.target.value })} className={select}><option value="">Toutes les étapes</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        </div>
      ) : null}
      <div><label htmlFor={`${id}-setter`} className={label}>Setter</label>
        <NativeSelect id={`${id}-setter`} value={f.setter} onChange={(e) => set({ setter: e.target.value })} className={select}><option value="">Tous les setters</option><option value="aucun">Sans setter</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
      </div>
      <div><label htmlFor={`${id}-closer`} className={label}>Closer</label>
        <NativeSelect id={`${id}-closer`} value={f.closer} onChange={(e) => set({ closer: e.target.value })} className={select}><option value="">Tous les closers</option><option value="aucun">Sans closer</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
      </div>
      <div><label htmlFor={`${id}-source`} className={label}>Source</label>
        <NativeSelect id={`${id}-source`} value={f.source} onChange={(e) => set({ source: e.target.value })} className={select}><option value="">Toutes les sources</option><option value="aucune">Sans source</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</NativeSelect>
      </div>
      <label className={row}><span>Avec une tâche à faire</span><Switch checked={f.withTask} onCheckedChange={(v) => set({ withTask: v })} /></label>
      <div><label htmlFor={`${id}-periode`} className={label}>Date d&apos;ajout</label>
        <NativeSelect id={`${id}-periode`} value={f.period} onChange={(e) => set({ period: e.target.value as Period })} className={select}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect>
      </div>
      {f.period === "dates" ? (
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor={`${id}-du`} className={label}>Du</label><input id={`${id}-du`} type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} className={cn(select, "border px-3")} /></div>
          <div><label htmlFor={`${id}-au`} className={label}>Au</label><input id={`${id}-au`} type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} className={cn(select, "border px-3")} /></div>
        </div>
      ) : null}
    </div>
  );
}
