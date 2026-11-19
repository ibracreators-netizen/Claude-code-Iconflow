"use client";
import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAction } from "@/lib/hooks/use-action";
import { saveKpiEntryAction } from "@/lib/actions/marketing-crm";
import { KPI_FIELDS } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, INPUT } from "../paiements/parts";

interface Row { profile_id: string; day: string; metrics: Record<string, number>; note: string | null }
type Who = { id: string; name: string; role: "setter" | "closer" };

const LABEL = "mb-1.5 block text-[15px] font-medium text-mk-text lg:text-[14px]";
const CARD = "lg:rounded-[12px] lg:border lg:border-mk-line lg:bg-surface lg:p-6 lg:shadow-soft";

/**
 * Saisie des KPI du jour (setters, closers) : ce que le CRM ne peut pas savoir tout seul (appels passés, messages…). Déclaratif.
 * Utilisée par la page Paiements (onglet « Saisie des KPI »), au style LeadConnector, pleine largeur sur téléphone.
 */
export function DailyEntry({ today, me, canPickMember, defaultRole, members, entries }: { today: string; me: string; canPickMember: boolean; defaultRole: "setter" | "closer"; members: Who[]; entries: Row[] }) {
  const { exec, pending } = useAction();
  const self: Who = members.find((m) => m.id === me) ?? { id: me, name: "Moi", role: defaultRole };
  const choices = canPickMember ? (members.some((m) => m.id === me) ? members : [self, ...members]) : [self];
  const [who, setWho] = React.useState(self.id);
  const [day, setDay] = React.useState(today);
  const target = choices.find((m) => m.id === who) ?? self;
  const fields = KPI_FIELDS[target.role];
  const existing = entries.find((e) => e.profile_id === who && e.day === day);
  const key = `${who}|${day}`;
  const [draft, setDraft] = React.useState<{ key: string; values: Record<string, string>; note: string }>({ key: "", values: {}, note: "" });
  if (draft.key !== key) setDraft({ key, values: Object.fromEntries(fields.map((f) => [f.key, existing?.metrics[f.key] ? String(existing.metrics[f.key]) : ""])), note: existing?.note ?? "" });
  const save = () => exec(() => saveKpiEntryAction({ day, profileId: who, note: draft.note, metrics: Object.fromEntries(fields.map((f) => [f.key, Number(draft.values[f.key] || 0)])) }), { success: "Chiffres du jour enregistrés." });
  const mine = entries.filter((e) => e.profile_id === who).slice(0, 21);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dayLabel = (d: string) => { const t = fmt.format(new Date(`${d}T00:00:00Z`)); return t.charAt(0).toUpperCase() + t.slice(1); };
  const summary = (e: Row) => fields.filter((f) => e.metrics[f.key]).map((f) => `${e.metrics[f.key]} ${f.label.toLowerCase()}`).join(" · ") || "Aucun chiffre";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <section className={CARD}>
        <h2 className="text-[17px] font-semibold text-mk-strong lg:text-[16px]">Saisie du jour</h2>
        <p className="mt-0.5 text-[14px] text-mk-sub">Ce que le CRM ne compte pas tout seul. Les rendez-vous, présences et signatures viennent déjà du CRM : inutile de les ressaisir.</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!pending) save(); }}>
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
          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`kpi-${f.key}`} className={LABEL}>{f.label}</label>
                <input id={`kpi-${f.key}`} type="number" inputMode="numeric" min={0} max={5000} value={draft.values[f.key] ?? ""} placeholder="0"
                  onChange={(e) => setDraft((d) => ({ ...d, values: { ...d.values, [f.key]: e.target.value } }))} className={cn(INPUT, "tabular")} />
                <p className="mt-1 text-[12.5px] leading-snug text-mk-sub">{f.hint}</p>
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="kpi-note" className={LABEL}>Remarque</label>
            <input id="kpi-note" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={1000} placeholder="Ex. matinée sans réponse, à rappeler demain" className={INPUT} />
            <p className="mt-1 text-[12.5px] text-mk-sub">Facultatif</p>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-[13px] text-mk-sub">{existing ? "Déjà saisi pour ce jour : tu peux corriger." : "Pas encore saisi pour ce jour."}</span>
            <button type="submit" disabled={pending} className={cn(BTN_PRIMARY, "h-12 w-full text-[16px] font-semibold lg:h-10 lg:w-auto lg:text-[14px] lg:font-medium")}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
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
              <table className="w-full min-w-[460px] text-left text-[14px]">
                <thead className="border-b border-mk-line bg-bg"><tr className="whitespace-nowrap text-[12px] font-medium text-mk-sub"><th className="h-10 px-4 font-medium">Jour</th>{fields.map((f) => <th key={f.key} className="h-10 px-3 text-right font-medium">{f.label}</th>)}<th className="h-10 px-4 font-medium">Remarque</th></tr></thead>
                <tbody>
                  {mine.map((e) => (
                    <tr key={e.day} className={cn("h-12 border-b border-mk-line last:border-b-0", e.day === day ? "bg-accent-soft/60" : "hover:bg-mk-chip/50")}>
                      <td className="whitespace-nowrap px-4"><button type="button" className="font-medium text-mk-strong hover:text-accent-2 hover:underline" onClick={() => setDay(e.day)}>{dayLabel(e.day)}</button></td>
                      {fields.map((f) => <td key={f.key} className="px-3 text-right text-mk-text tabular">{e.metrics[f.key] ?? "—"}</td>)}
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
