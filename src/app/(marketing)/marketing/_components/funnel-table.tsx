import { FUNNEL_RULES, type Funnel, type FunnelRow } from "@/lib/marketing/funnel";
import { euro } from "@/lib/marketing/ui";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const money = (v: number | null) => (v === null ? "—" : euro.format(v));

/** Entonnoir en tableau : une ligne par page d'entrée ou par campagne, avec les règles de calcul dessous. */
export function FunnelTable({ funnel, first, byPage }: { funnel: Funnel; first: string; byPage?: boolean }) {
  const { rows, total, hasSpend } = funnel;
  const max = Math.max(1, ...rows.map((r) => r.leads));
  const line = (r: FunnelRow, strong = false) => (
    <tr key={r.key} className={strong ? "border-t-2 border-border font-semibold" : ""}>
      <th scope="row" className="max-w-[280px] px-3 py-2.5 pl-4 text-left font-medium"><span className="block truncate" title={r.label}>{r.label}</span>
        {!strong ? <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((r.leads / max) * 100)}%` }} /></span> : null}</th>
      <td className="px-3 py-2.5 text-right tabular">{r.leads}</td>
      <td className="px-3 py-2.5 text-right tabular">{r.booked}<span className="ml-1.5 text-[11.5px] font-normal text-muted">{pct(r.booked, r.leads)}</span></td>
      <td className="px-3 py-2.5 text-right tabular">{r.showed}<span className="ml-1.5 text-[11.5px] font-normal text-muted">{pct(r.showed, r.booked)}</span></td>
      <td className="px-3 py-2.5 text-right tabular">{r.signed}<span className="ml-1.5 text-[11.5px] font-normal text-muted">{pct(r.signed, r.showed)}</span></td>
      <td className="px-3 py-2.5 text-right tabular">{r.amount ? euro.format(r.amount) : "—"}</td>
      {hasSpend ? <><td className="px-3 py-2.5 text-right tabular">{money(r.spend)}</td><td className="px-3 py-2.5 text-right tabular">{money(r.costPerLead)}</td><td className="px-3 py-2.5 pr-4 text-right tabular">{money(r.costPerBooking)}</td></> : null}
    </tr>
  );
  if (!rows.length) return <p className="px-5 pb-5 text-[13px] text-muted">Aucun lead sur cette période.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="px-3 py-2.5 pl-4 text-left font-medium">{first}</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Leads</th><th scope="col" className="px-3 py-2.5 text-right font-medium">RDV pris</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Présents</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Signés</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Montant HT</th>
              {hasSpend ? <><th scope="col" className="px-3 py-2.5 text-right font-medium">Dépense</th><th scope="col" className="px-3 py-2.5 text-right font-medium">Coût / lead</th><th scope="col" className="px-3 py-2.5 pr-4 text-right font-medium">Coût / RDV</th></> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{rows.map((r) => line(r))}{line(total, true)}</tbody>
        </table>
      </div>
      <details className="border-t border-border px-5 py-3 text-[12.5px] text-muted">
        <summary className="cursor-pointer text-fg-2">Règles de calcul</summary>
        <ul className="mt-2 space-y-1">
          <li><b className="font-medium text-fg-2">Leads</b> : {FUNNEL_RULES.leads}</li>
          <li><b className="font-medium text-fg-2">RDV pris</b> : {FUNNEL_RULES.booked} Le pourcentage est rapporté aux leads.</li>
          <li><b className="font-medium text-fg-2">Présents</b> : {FUNNEL_RULES.showed} Le pourcentage est rapporté aux RDV pris.</li>
          <li><b className="font-medium text-fg-2">Signés</b> : {FUNNEL_RULES.signed} Le pourcentage est rapporté aux présents.</li>
          <li><b className="font-medium text-fg-2">Montant HT</b> : {FUNNEL_RULES.amount}</li>
          {hasSpend ? <><li><b className="font-medium text-fg-2">Dépense</b> : {FUNNEL_RULES.spend} {byPage ? FUNNEL_RULES.byPage : ""}</li><li><b className="font-medium text-fg-2">Coût / lead, coût / RDV</b> : {FUNNEL_RULES.costPerLead} {FUNNEL_RULES.costPerBooking}</li></> : null}
          {byPage && funnel.unattributedSpend > 0 ? <li>{euro.format(funnel.unattributedSpend)} de dépense viennent de campagnes sans aucun lead sur la période : ils sont dans le total, pas dans les lignes.</li> : null}
        </ul>
      </details>
    </>
  );
}
