import { FUNNEL_RULES, type Funnel, type FunnelRow } from "@/lib/marketing/funnel";
import { euro } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { PanelEmpty, Rules, ScrollHint, TABLE, TD, TH, THEAD, TR } from "./dash-ui";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const money = (v: number | null) => (v === null ? "—" : euro.format(v));

/** Entonnoir en tableau (style LeadConnector) : une ligne par page d'entrée ou par campagne, total en bas, règles de calcul dessous. */
export function FunnelTable({ funnel, first, byPage }: { funnel: Funnel; first: string; byPage?: boolean }) {
  const { rows, total, hasSpend } = funnel;
  const max = Math.max(1, ...rows.map((r) => r.leads));
  const num = (n: number, rate?: string) => <>{n}{rate !== undefined ? <span className="ml-1.5 text-[12.5px] font-normal text-mk-sub">{rate}</span> : null}</>;
  const line = (r: FunnelRow, strong = false) => (
    <tr key={strong ? "__total" : r.key} className={strong ? "h-14 bg-surface-2/60 font-semibold text-mk-strong" : TR}>
      <th scope="row" className={cn(TD, "max-w-[320px] text-left", strong ? "font-semibold text-mk-strong" : "font-medium text-mk-strong")}>
        <span className="block truncate" title={r.label}>{r.label}</span>
        {!strong ? <span className="mt-1.5 block h-1 max-w-[220px] overflow-hidden rounded-full bg-mk-chip" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, Math.round((r.leads / max) * 100))}%` }} /></span> : null}
      </th>
      <td className={cn(TD, "text-right", strong && "text-mk-strong")}>{r.leads}</td>
      <td className={cn(TD, "whitespace-nowrap text-right", strong && "text-mk-strong")}>{num(r.booked, pct(r.booked, r.leads))}</td>
      <td className={cn(TD, "whitespace-nowrap text-right", strong && "text-mk-strong")}>{num(r.showed, pct(r.showed, r.booked))}</td>
      <td className={cn(TD, "whitespace-nowrap text-right", strong && "text-mk-strong")}>{num(r.signed, pct(r.signed, r.showed))}</td>
      <td className={cn(TD, "whitespace-nowrap text-right font-medium text-mk-strong")}>{r.amount ? euro.format(r.amount) : "—"}</td>
      {hasSpend ? <>
        <td className={cn(TD, "whitespace-nowrap text-right")}>{money(r.spend)}</td>
        <td className={cn(TD, "whitespace-nowrap text-right")}>{money(r.costPerLead)}</td>
        <td className={cn(TD, "whitespace-nowrap text-right")}>{money(r.costPerBooking)}</td>
      </> : null}
    </tr>
  );
  if (!rows.length) return <PanelEmpty className="border-t border-mk-line">Aucun lead sur cette période.</PanelEmpty>;
  return (
    <>
      <ScrollHint />
      <div className="overflow-x-auto">
        <table className={cn(TABLE, "min-w-[820px]")}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={TH}>{first}</th>
              <th scope="col" className={cn(TH, "text-right")}>Leads</th>
              <th scope="col" className={cn(TH, "text-right")}>RDV pris</th>
              <th scope="col" className={cn(TH, "text-right")}>Présents</th>
              <th scope="col" className={cn(TH, "text-right")}>Signés</th>
              <th scope="col" className={cn(TH, "text-right")}>Montant HT</th>
              {hasSpend ? <><th scope="col" className={cn(TH, "text-right")}>Dépense</th><th scope="col" className={cn(TH, "text-right")}>Coût / lead</th><th scope="col" className={cn(TH, "text-right")}>Coût / RDV</th></> : null}
            </tr>
          </thead>
          <tbody>{rows.map((r) => line(r))}{line(total, true)}</tbody>
        </table>
      </div>
      <Rules>
        <li><b className="font-medium text-mk-text">Leads</b> : {FUNNEL_RULES.leads}</li>
        <li><b className="font-medium text-mk-text">RDV pris</b> : {FUNNEL_RULES.booked} Le pourcentage est rapporté aux leads.</li>
        <li><b className="font-medium text-mk-text">Présents</b> : {FUNNEL_RULES.showed} Le pourcentage est rapporté aux RDV pris.</li>
        <li><b className="font-medium text-mk-text">Signés</b> : {FUNNEL_RULES.signed} Le pourcentage est rapporté aux présents.</li>
        <li><b className="font-medium text-mk-text">Montant HT</b> : {FUNNEL_RULES.amount}</li>
        {hasSpend ? <><li><b className="font-medium text-mk-text">Dépense</b> : {FUNNEL_RULES.spend} {byPage ? FUNNEL_RULES.byPage : ""}</li><li><b className="font-medium text-mk-text">Coût / lead, coût / RDV</b> : {FUNNEL_RULES.costPerLead} {FUNNEL_RULES.costPerBooking}</li></> : null}
        {byPage && funnel.unattributedSpend > 0 ? <li>{euro.format(funnel.unattributedSpend)} de dépense viennent de campagnes sans aucun lead sur la période : ils sont dans le total, pas dans les lignes.</li> : null}
      </Rules>
    </>
  );
}
