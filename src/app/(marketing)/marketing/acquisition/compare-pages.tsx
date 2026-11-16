"use client";
import * as React from "react";
import { NativeSelect } from "@/components/ui/input";
import type { FunnelRow } from "@/lib/marketing/funnel";
import { euro } from "@/lib/marketing/ui";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const money = (v: number | null) => (v === null ? "—" : euro.format(v));

/** Deux pages d'entrée côte à côte : par exemple la page avec optin et la page sans optin. */
export function ComparePages({ rows }: { rows: FunnelRow[] }) {
  const [a, setA] = React.useState(rows[0]?.key ?? "");
  const [b, setB] = React.useState(rows[1]?.key ?? "");
  if (rows.length < 2) return <p className="text-[13px] text-muted">Il faut des leads sur au moins deux pages d&apos;entrée pour les comparer. Dès que ta page avec optin et ta page sans optin auront chacune reçu des leads, elles apparaîtront ici.</p>;
  const ra = rows.find((r) => r.key === a) ?? rows[0], rb = rows.find((r) => r.key === b) ?? rows[1];
  const lines: Array<[string, (r: FunnelRow) => string, string]> = [
    ["Leads", (r) => String(r.leads), "opt-ins de la période"],
    ["RDV pris", (r) => `${r.booked} · ${pct(r.booked, r.leads)}`, "part des leads"],
    ["Présents", (r) => `${r.showed} · ${pct(r.showed, r.booked)}`, "part des RDV pris"],
    ["Signés", (r) => `${r.signed} · ${pct(r.signed, r.showed)}`, "part des présents"],
    ["Montant signé HT", (r) => (r.amount ? euro.format(r.amount) : "—"), "somme des montants signés"],
    ["Coût par lead", (r) => money(r.costPerLead), "dépense ÷ leads"],
    ["Coût par RDV", (r) => money(r.costPerBooking), "dépense ÷ leads avec RDV"],
  ];
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <NativeSelect aria-label={label} value={value} onChange={(e) => set(e.target.value)} className="h-9 w-full">{rows.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</NativeSelect>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13.5px]">
        <thead><tr><th scope="col" className="w-44 pb-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">Indicateur</th><th scope="col" className="pb-3 pr-3 text-left font-normal">{pick(ra.key, setA, "Première page à comparer")}</th><th scope="col" className="pb-3 text-left font-normal">{pick(rb.key, setB, "Seconde page à comparer")}</th></tr></thead>
        <tbody className="divide-y divide-border">
          {lines.map(([name, value, rule]) => (
            <tr key={name}><th scope="row" className="py-2.5 text-left font-medium">{name}<span className="block text-[11.5px] font-normal text-muted">{rule}</span></th><td className="py-2.5 pr-3 tabular">{value(ra)}</td><td className="py-2.5 tabular">{value(rb)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
