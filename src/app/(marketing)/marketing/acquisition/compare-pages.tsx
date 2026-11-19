"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { FunnelRow } from "@/lib/marketing/funnel";
import { euro } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { ScrollHint, TABLE, TD, TH, THEAD, TR } from "../_components/dash-ui";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const money = (v: number | null) => (v === null ? "—" : euro.format(v));

/** Deux pages d'entrée côte à côte : par exemple la page avec optin et la page sans optin. */
export function ComparePages({ rows }: { rows: FunnelRow[] }) {
  const [a, setA] = React.useState(rows[0]?.key ?? "");
  const [b, setB] = React.useState(rows[1]?.key ?? "");
  if (rows.length < 2) return <p className="border-t border-mk-line px-4 py-5 text-[14px] text-mk-sub lg:px-5">Il faut des leads sur au moins deux pages d&apos;entrée pour les comparer. Dès que ta page avec optin et ta page sans optin auront chacune reçu des leads, elles apparaîtront ici.</p>;
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
  // Police de 16 px sur téléphone : iOS ne zoome pas sur le menu.
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <span className="relative block">
      <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}
        className="h-10 w-full appearance-none truncate rounded-[8px] border border-mk-input bg-surface pl-3 pr-9 text-[16px] font-medium text-mk-strong outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 lg:text-[14px]">
        {rows.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden />
    </span>
  );
  return (
    <>
      <ScrollHint />
      <div className="overflow-x-auto">
        <table className={cn(TABLE, "min-w-[560px] table-fixed")}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={cn(TH, "h-14 w-[34%]")}>Indicateur</th>
              <th scope="col" className={cn(TH, "font-normal")}>{pick(ra.key, setA, "Première page à comparer")}</th>
              <th scope="col" className={cn(TH, "font-normal")}>{pick(rb.key, setB, "Seconde page à comparer")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([name, value, rule]) => (
              <tr key={name} className={TR}>
                <th scope="row" className={cn(TD, "text-left font-medium text-mk-strong")}>{name}<span className="block text-[12.5px] font-normal text-mk-sub">{rule}</span></th>
                <td className={TD}>{value(ra)}</td>
                <td className={TD}>{value(rb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
