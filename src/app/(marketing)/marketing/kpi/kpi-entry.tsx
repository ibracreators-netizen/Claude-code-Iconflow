"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { saveKpiEntryAction } from "@/lib/actions/marketing-crm";
import { KPI_FIELDS } from "@/lib/marketing/types";

interface Row { profile_id: string; day: string; metrics: Record<string, number>; note: string | null }
type Who = { id: string; name: string; role: "setter" | "closer" };

/** Suivi quotidien : ce que le CRM ne peut pas savoir tout seul (appels passés, messages…). Déclaratif. */
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
  const save = () => exec(() => saveKpiEntryAction({ day, profileId: who, note: draft.note, metrics: Object.fromEntries(fields.map((f) => [f.key, Number(draft.values[f.key] || 0)])) }), { success: "Suivi enregistré." });
  const mine = entries.filter((e) => e.profile_id === who).slice(0, 21);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="card space-y-3 p-5">
        <div><h3 className="text-[15px] font-semibold">Saisie du jour</h3><p className="text-[12.5px] text-muted">Ce que le CRM ne peut pas compter tout seul. Les rendez-vous, présences et signatures viennent déjà du CRM : inutile de les ressaisir.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {canPickMember ? <Field label="Membre"><NativeSelect value={who} onChange={(e) => setWho(e.target.value)}>{choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field> : null}
          <Field label="Jour"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => <Field key={f.key} label={f.label} hint={f.hint}><Input type="number" inputMode="numeric" min={0} max={5000} value={draft.values[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, values: { ...d.values, [f.key]: e.target.value } }))} placeholder="0" /></Field>)}
        </div>
        <Field label="Remarque" hint="Facultatif"><Input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={1000} placeholder="Ex. matinée sans réponse, à rappeler demain" /></Field>
        <div className="flex items-center justify-between gap-3"><span className="text-[12px] text-muted">{existing ? "Déjà saisi : tu peux corriger." : "Pas encore saisi pour ce jour."}</span><Button loading={pending} onClick={save}>Enregistrer</Button></div>
      </section>
      <section className="card p-5">
        <h3 className="text-[15px] font-semibold">Derniers jours saisis{canPickMember ? ` · ${target.name}` : ""}</h3>
        <p className="mb-3 text-[12.5px] text-muted">Clique sur un jour pour le corriger.</p>
        {mine.length === 0 ? <p className="text-[13px] text-muted">Aucun jour saisi sur la période.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-[13px]">
              <thead><tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted"><th className="py-2 pr-3 font-medium">Jour</th>{fields.map((f) => <th key={f.key} className="px-3 py-2 text-right font-medium">{f.label}</th>)}<th className="py-2 pl-3 font-medium">Remarque</th></tr></thead>
              <tbody className="divide-y divide-border">
                {mine.map((e) => (
                  <tr key={e.day} className={e.day === day ? "bg-accent-soft/40" : undefined}>
                    <td className="py-2 pr-3"><button type="button" className="font-medium hover:underline" onClick={() => setDay(e.day)}>{fmt.format(new Date(`${e.day}T00:00:00Z`))}</button></td>
                    {fields.map((f) => <td key={f.key} className="px-3 py-2 text-right tabular">{e.metrics[f.key] ?? "—"}</td>)}
                    <td className="max-w-[220px] truncate py-2 pl-3 text-fg-2">{e.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
