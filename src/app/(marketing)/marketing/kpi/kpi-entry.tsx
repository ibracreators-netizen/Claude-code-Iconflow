"use client";
import * as React from "react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { useAction } from "@/lib/hooks/use-action";
import { saveKpiEntryAction } from "@/lib/actions/marketing-crm";
import { CLOSER_FIELD, CLOSER_KEY_COLUMNS, closerSummary, closerWarnings, formatField, groupFields } from "@/lib/marketing/closer-report";
import { KPI_FIELDS, kpiMax, kpiValueError, type KpiField } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, INPUT } from "../paiements/parts";

interface Row { profile_id: string; day: string; metrics: Record<string, number>; note: string | null }
type Who = { id: string; name: string; role: "setter" | "closer" };

const LABEL = "mb-1.5 block text-[15px] font-medium text-mk-text lg:text-[14px]";
const CARD = "lg:rounded-[12px] lg:border lg:border-mk-line lg:bg-surface lg:p-6 lg:shadow-soft";
const SUB = {
  setter: "Tes appels et tes messages du jour. Ils arrivent dans Suivi du jour et dans le Tableau de bord.",
  closer: "Tes rendez-vous du jour, leur résultat et l'argent encaissé. Ils arrivent dans KPI › Closers et dans le Tableau de bord.",
} as const;

/** Une case de saisie : un nombre, ou un montant en euros entiers (« € » affiché dans le champ). */
function FieldInput({ field, value, error, onChange }: { field: KpiField; value: string; error: string | null; onChange: (v: string) => void }) {
  const euro = field.unit === "euro";
  return (
    <div className="min-w-0">
      <label htmlFor={`kpi-${field.key}`} className={LABEL}>{field.label}</label>
      <span className="relative block">
        <input id={`kpi-${field.key}`} type="number" inputMode="numeric" min={0} max={kpiMax(field)} step={1} value={value} placeholder="0"
          aria-invalid={error ? true : undefined} aria-describedby={`kpi-${field.key}-hint`}
          onChange={(e) => onChange(e.target.value)} className={cn(INPUT, "tabular", euro && "pr-9 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none", error && "border-mk-danger focus:border-mk-danger focus:ring-mk-danger/20")} />
        {euro ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] font-medium text-mk-sub lg:text-[14px]" aria-hidden>€</span> : null}
      </span>
      <p id={`kpi-${field.key}-hint`} className={cn("mt-1 text-[12.5px] leading-snug", error ? "font-medium text-mk-danger" : "text-mk-sub")}>{error ?? field.hint}</p>
    </div>
  );
}

/**
 * Saisie des KPI du jour (setters, closers) : déclaratif. Un closer note ses rendez-vous (prévus, show-up, no-show,
 * annulés), leur résultat (non qualifiés, pitchs, closes, en réflexion), l'argent (cash, CA signé) et son suivi.
 * Utilisée par la page KPI (onglet « Saisie des KPI »), au style LeadConnector, pleine largeur sur téléphone.
 */
export function DailyEntry({ today, me, canPickMember, defaultRole, members, entries }: { today: string; me: string; canPickMember: boolean; defaultRole: "setter" | "closer"; members: Who[]; entries: Row[] }) {
  const { exec, pending } = useAction();
  const self: Who = members.find((m) => m.id === me) ?? { id: me, name: "Moi", role: defaultRole };
  const choices = canPickMember ? (members.some((m) => m.id === me) ? members : [self, ...members]) : [self];
  const [who, setWho] = React.useState(self.id);
  const [day, setDay] = React.useState(today);
  const target = choices.find((m) => m.id === who) ?? self;
  const fields = KPI_FIELDS[target.role];
  const closer = target.role === "closer";
  const existing = entries.find((e) => e.profile_id === who && e.day === day);
  const key = `${who}|${day}`;
  const [draft, setDraft] = React.useState<{ key: string; values: Record<string, string>; note: string }>({ key: "", values: {}, note: "" });
  if (draft.key !== key) setDraft({ key, values: Object.fromEntries(fields.map((f) => [f.key, existing?.metrics[f.key] ? String(existing.metrics[f.key]) : ""])), note: existing?.note ?? "" });
  const numbers = Object.fromEntries(fields.map((f) => [f.key, Number(draft.values[f.key] || 0)]));
  // Une valeur hors limite est signalée sous sa case et bloque l'envoi (le serveur la refuse aussi) ; les avertissements, non.
  const errors = Object.fromEntries(fields.map((f) => [f.key, draft.values[f.key] ? kpiValueError(f, numbers[f.key]) : null]));
  const firstError = fields.map((f) => errors[f.key]).find(Boolean) ?? null;
  const warnings = closer ? closerWarnings(numbers) : [];
  const save = () => exec(() => saveKpiEntryAction({ day, profileId: who, note: draft.note, metrics: numbers }), { success: "Chiffres du jour enregistrés." });
  const setValue = (k: string, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [k]: v } }));
  const mine = entries.filter((e) => e.profile_id === who).slice(0, 21);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dayLabel = (d: string) => { const t = fmt.format(new Date(`${d}T00:00:00Z`)); return t.charAt(0).toUpperCase() + t.slice(1); };
  const summary = (e: Row) => (closer ? closerSummary(e.metrics) : fields.filter((f) => e.metrics[f.key]).map((f) => `${e.metrics[f.key]} ${f.label.toLowerCase()}`).join(" · ")) || "Aucun chiffre";
  // Ordinateur, derniers jours : pour un closer, les colonnes clés seulement (pas les douze).
  const columns = closer ? CLOSER_KEY_COLUMNS.map((k) => CLOSER_FIELD[k]) : fields;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <section className={CARD}>
        <h2 className="text-[17px] font-semibold text-mk-strong lg:text-[16px]">Saisie du jour</h2>
        <p className="mt-0.5 text-[14px] text-mk-sub">{SUB[target.role]}</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!pending && !firstError) save(); }}>
          <div className={cn("grid gap-4", canPickMember && "sm:grid-cols-2")}>
            {canPickMember ? (
              <div>
                <label htmlFor="kpi-who" className={LABEL}>Membre</label>
                <span className="relative block">
                  <select id="kpi-who" value={who} onChange={(e) => setWho(e.target.value)} className={cn(INPUT, "appearance-none pr-10")}>{choices.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me && m.name !== "Moi" ? " (moi)" : ""}</option>)}</select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden />
                </span>
              </div>
            ) : null}
            <div>
              <label htmlFor="kpi-day" className={LABEL}>Jour</label>
              <input id="kpi-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} className={INPUT} />
            </div>
          </div>
          {groupFields(fields).map(([group, list]) => (
            <fieldset key={group ?? "champs"} className={cn("min-w-0", group && "border-t border-mk-line pt-4")}>
              {group ? <legend className="float-left mb-3 w-full text-[13px] font-semibold uppercase tracking-[0.04em] text-mk-sub">{group}</legend> : null}
              <div className="clear-left grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
                {list.map((f) => <FieldInput key={f.key} field={f} value={draft.values[f.key] ?? ""} error={errors[f.key]} onChange={(v) => setValue(f.key, v)} />)}
              </div>
            </fieldset>
          ))}
          {warnings.length ? (
            <div role="status" className="rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-3.5 py-3 text-[13.5px] leading-snug text-mk-warn">
              <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4 shrink-0" strokeWidth={2} aria-hidden />À vérifier</p>
              <ul className="mt-1 space-y-0.5 pl-6">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="mt-1.5 pl-6 text-[12.5px]">Tu peux enregistrer quand même.</p>
            </div>
          ) : null}
          <div className={cn(closer && "border-t border-mk-line pt-4")}>
            <label htmlFor="kpi-note" className={LABEL}>Remarque</label>
            <input id="kpi-note" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={1000} placeholder={closer ? "Ex. deux prospects à relancer jeudi" : "Ex. matinée sans réponse, à rappeler demain"} className={INPUT} />
            <p className="mt-1 text-[12.5px] text-mk-sub">Facultatif</p>
          </div>
          {firstError ? <p role="alert" className="text-[13.5px] font-medium text-mk-danger">{firstError}</p> : null}
          <div className="flex flex-col-reverse gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-[13px] text-mk-sub">{existing ? "Déjà saisi pour ce jour : tu peux corriger." : "Pas encore saisi pour ce jour."}</span>
            <button type="submit" disabled={pending || !!firstError} className={cn(BTN_PRIMARY, "h-12 w-full text-[16px] font-semibold lg:h-10 lg:w-auto lg:text-[14px] lg:font-medium")}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </form>
      </section>

      <section className={cn(CARD, "border-t border-mk-line pt-6 lg:pt-6")}>
        <h2 className="text-[17px] font-semibold text-mk-strong lg:text-[16px]">Derniers jours saisis{canPickMember ? ` · ${target.name}` : ""}</h2>
        <p className="mt-0.5 text-[14px] text-mk-sub">Touche un jour pour le corriger.</p>
        {mine.length === 0 ? <p className="mt-4 rounded-r-[12px] border-l-4 border-accent bg-mk-agenda px-4 py-4 text-[15px] font-medium text-mk-sub">Aucun jour saisi ces 60 derniers jours.</p> : (
          <>
            {/* Téléphone : une ligne par jour */}
            <ul className="mt-3 lg:hidden">
              {mine.map((e) => (
                <li key={e.day}>
                  <button type="button" onClick={() => { setDay(e.day); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={cn("flex w-full items-center gap-3 border-b border-mk-line py-3.5 text-left", e.day === day && "bg-mk-chip/60")}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold text-mk-strong">{dayLabel(e.day)}</span>
                      <span className="block truncate text-[14px] text-mk-sub">{summary(e)}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-mk-icon" />
                  </button>
                </li>
              ))}
            </ul>
            {/* Ordinateur : tableau */}
            <div className="mt-4 hidden overflow-x-auto rounded-[8px] border border-mk-line lg:block">
              <table className={cn("w-full text-left text-[14px]", closer ? "min-w-[640px]" : "min-w-[460px]")}>
                <thead className="border-b border-mk-line bg-bg"><tr className="whitespace-nowrap text-[12px] font-medium text-mk-sub"><th className="h-10 px-4 font-medium">Jour</th>{columns.map((f) => <th key={f.key} className="h-10 px-3 text-right font-medium" title={f.label}>{closer ? f.short ?? f.label : f.label}</th>)}<th className="h-10 px-4 font-medium">Remarque</th></tr></thead>
                <tbody>
                  {mine.map((e) => (
                    <tr key={e.day} className={cn("h-12 border-b border-mk-line last:border-b-0", e.day === day ? "bg-accent-soft/60" : "hover:bg-mk-chip/50")}>
                      <td className="whitespace-nowrap px-4"><button type="button" className="font-medium text-mk-strong hover:text-accent-2 hover:underline" onClick={() => setDay(e.day)}>{dayLabel(e.day)}</button></td>
                      {columns.map((f) => <td key={f.key} className="whitespace-nowrap px-3 text-right text-mk-text tabular">{e.metrics[f.key] ? formatField(f, e.metrics[f.key]) : "—"}</td>)}
                      <td className="max-w-[200px] truncate px-4 text-mk-sub">{e.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
