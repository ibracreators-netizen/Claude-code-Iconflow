import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, facts, members, salesRole } from "@/lib/marketing/crm-server";
import { buildKpi, KPI_RULES, type ClosingKpi } from "@/lib/marketing/kpi";
import { buildLeaderboard, MIN_SAMPLE } from "@/lib/marketing/leaderboard";
import { KPI_FIELDS, type KpiEntry } from "@/lib/marketing/types";
import { euro } from "@/lib/marketing/ui";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TrendChart } from "@/components/shared/charts";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { DailyEntry } from "./kpi-entry";

export const metadata: Metadata = { title: "KPI" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS = [7, 30, 90] as const;
const TABS = [["closing", "Closing"], ["setters", "Setters"], ["closers", "Closers"], ["suivi", "Suivi quotidien"]] as const;
type Tab = (typeof TABS)[number][0];
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
const num = (v: number | undefined) => (v ? String(v) : "—");

const Head = ({ children, rule, right = true, first }: { children: React.ReactNode; rule?: string; right?: boolean; first?: boolean }) => (
  <th scope="col" title={rule} className={cn("px-3 py-2.5 align-bottom font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted", right && "text-right", first && "pl-5")}>{children}</th>
);
function Tile({ label, value, rule, sub, big }: { label: string; value: string; rule?: string; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className={cn("card relative overflow-hidden p-4", big && "border-accent/40")}>
      {big ? <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent/15 blur-2xl" aria-hidden /> : null}
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={cn("mt-1 font-semibold tabular leading-none tracking-[-0.03em]", big ? "text-[40px] text-accent-2" : "text-[26px]")}>{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-fg-2">{sub}</p> : null}
      {rule ? <p className="mt-1.5 text-[11px] leading-snug text-muted-2">{rule}</p> : null}
    </div>
  );
}
const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : Math.round((now - before) * 10) / 10);

export default async function KpiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_classement");
  const days = PERIODS.includes(Number(one(sp.jours)) as (typeof PERIODS)[number]) ? Number(one(sp.jours)) : 30;
  const tab: Tab = (TABS.find(([k]) => k === one(sp.onglet))?.[0] ?? "closing") as Tab;
  const now = new Date(), to = new Date(now.getTime() + 60_000).toISOString(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), before = new Date(now.getTime() - 2 * days * 86_400_000).toISOString();
  const [f, team, entries, settings] = await Promise.all([
    facts(crm, { tasks: true }), members(),
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", from.slice(0, 10)]], order: ["day", "desc"], limit: 2000 }).then((r) => r as KpiEntry[] | null).catch(() => null),
    crm.store.settings(),
  ]);
  const base = { prospects: f.prospects, appointments: f.appointments, tasks: f.tasks, members: team, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id) };
  const kpi = buildKpi({ ...base, entries: entries ?? [], from, to });
  const prev = buildKpi({ ...base, entries: [], from: before, to: from });
  const board = buildLeaderboard({ ...base, from, to });
  const me = crm.session.user.id, role = salesRole(crm.session), seesAll = !role;
  const c = kpi.closing, d = delta(c.closeRate, prev.closing.closeRate);
  const href = (o: { onglet?: string; jours?: number }) => `/marketing/kpi?onglet=${o.onglet ?? tab}&jours=${o.jours ?? days}`;
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: settings.timezone }).format(now);
  const myRole: "setter" | "closer" = role === "closer" ? "closer" : "setter";
  const outcomes: Array<[string, number]> = [["Signé", c.signed], ["En réflexion", c.thinking], ["Non signé", c.notSigned], ["Issue non saisie", Math.max(0, c.held - c.signed - c.thinking - c.notSigned)]];
  const closerRow = (r: ClosingKpi & { id: string; name: string; declared: Record<string, number> }, i: number) => (
    <tr key={r.id} className={r.id === me ? "bg-accent-soft/40" : undefined}>
      <td className="px-3 py-2.5 pl-5 tabular text-muted">{board.closers.ranked ? i + 1 : "—"}</td>
      <th scope="row" className="px-3 py-2.5 text-left font-medium">{seesAll ? <Link href={`/marketing/equipe/${r.id}`} className="hover:underline">{r.name}</Link> : r.name}{r.id === me ? " (toi)" : ""}</th>
      <td className="px-3 py-2.5 text-right tabular">{r.scheduled}</td><td className="px-3 py-2.5 text-right tabular">{r.held}</td><td className="px-3 py-2.5 text-right tabular">{r.noShow}</td><td className="px-3 py-2.5 text-right tabular">{pct(r.showRate)}</td>
      <td className="px-3 py-2.5 text-right tabular">{r.signed}</td><td className="px-3 py-2.5 text-right font-semibold tabular">{pct(r.closeRate)}{r.held > 0 && r.held < MIN_SAMPLE ? <span className="block text-[11px] font-normal text-muted-2">sur {r.held} appel{r.held > 1 ? "s" : ""}</span> : null}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular">{euro.format(r.amount)}</td><td className="px-3 py-2.5 text-right tabular">{r.average === null ? "—" : euro.format(r.average)}</td>
      {seesAll ? KPI_FIELDS.closer.map((fd) => <td key={fd.key} className="px-3 py-2.5 pr-5 text-right tabular text-fg-2">{num(r.declared[fd.key])}</td>) : null}
    </tr>
  );

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="KPI" description="Le suivi de l'équipe commerciale : taux de closing, setters, closers. Chaque chiffre vient du CRM, avec sa règle de calcul." actions={crm.demo ? <DemoBadge /> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Onglets KPI" className="flex flex-wrap gap-2">{TABS.map(([k, label]) => <Link key={k} href={href({ onglet: k })} aria-current={k === tab ? "page" : undefined} className={pill(k === tab)}>{label}</Link>)}</nav>
        <span className="ml-auto flex gap-2">{PERIODS.map((n) => <Link key={n} href={href({ jours: n })} aria-current={n === days ? "true" : undefined} className={pill(n === days)}>{n} jours</Link>)}</span>
      </div>
      {entries === null ? <p className="mb-4 rounded-lg bg-warning/10 px-3.5 py-2.5 text-[13px] text-warning">Le suivi quotidien demande la migration 0026. Les chiffres calculés à partir du CRM restent justes.</p> : null}

      {tab === "closing" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile big label="Taux de closing" value={pct(c.closeRate)} rule={KPI_RULES.closeRate}
              sub={c.held === 0 ? "Aucun appel tenu sur la période." : <>{c.signed} signé{c.signed > 1 ? "s" : ""} sur {c.held} appel{c.held > 1 ? "s" : ""} tenu{c.held > 1 ? "s" : ""}{d !== null ? ` · ${d > 0 ? "+" : ""}${String(d).replace(".", ",")} pt vs les ${days} jours d'avant` : ""}</>} />
            <Tile label="Montant signé HT" value={euro.format(c.amount)} sub={c.average === null ? "Aucune signature." : `Panier moyen : ${euro.format(c.average)}`} rule={KPI_RULES.amount} />
            <Tile label="Appels tenus" value={String(c.held)} sub={`${c.scheduled} rendez-vous prévus · ${c.noShow} absent${c.noShow > 1 ? "s" : ""}`} rule={KPI_RULES.held} />
            <Tile label="Taux de présence" value={pct(c.showRate)} sub={c.pending ? `${c.pending} résultat${c.pending > 1 ? "s" : ""} d'appel à saisir` : "Tous les résultats sont saisis."} rule={KPI_RULES.showRate} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card><CardHeader title="Appels tenus et signatures par semaine" description="Semaine du rendez-vous." /><CardBody>
              {kpi.weekly.some((w) => w.held > 0)
                ? <TrendChart data={kpi.weekly.map((w) => ({ label: w.label, held: w.held, signed: w.signed }))} series={[{ key: "held", label: "Appels tenus" }, { key: "signed", label: "Signés" }]} format="num" kind="bar" height={240} />
                : <p className="py-16 text-center text-[13px] text-muted">Aucun appel tenu sur la période.</p>}
            </CardBody></Card>
            <Card><CardHeader title="Issue des appels tenus" description="Ce que sont devenus les appels de la période." /><CardBody>
              {c.held === 0 ? <p className="py-10 text-center text-[13px] text-muted">Rien à afficher.</p> : (
                <ul className="space-y-3">{outcomes.map(([label, n]) => (
                  <li key={label}><div className="flex items-baseline justify-between text-[13.5px]"><span>{label}</span><span className="tabular text-fg-2">{n} · {pct(Math.round((n / c.held) * 1000) / 10)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(n / c.held) * 100}%` }} /></div></li>
                ))}</ul>
              )}
            </CardBody></Card>
          </div>
          <Card><CardHeader title="Taux de closing par semaine" description="Signés ÷ appels tenus. Une semaine sans appel reste vide." /><CardBody>
            {kpi.weekly.some((w) => w.rate !== null)
              ? <TrendChart data={kpi.weekly.map((w) => ({ label: w.label, rate: w.rate ?? 0 }))} series={[{ key: "rate", label: "Taux de closing" }]} format="pctRaw" kind="line" height={200} />
              : <p className="py-12 text-center text-[13px] text-muted">Pas encore de taux à tracer.</p>}
          </CardBody></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Par closer" />
              {kpi.closers.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Aucun closer dans l&apos;équipe.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-[13.5px]"><thead><tr className="border-b border-border"><Head right={false} first>Closer</Head><Head>Tenus</Head><Head>Signés</Head><Head>Closing</Head><Head>Signé HT</Head></tr></thead>
                  <tbody className="divide-y divide-border">{kpi.closers.map((r) => <tr key={r.id}><th scope="row" className="px-3 py-2.5 pl-5 text-left font-medium">{r.name}</th><td className="px-3 py-2.5 text-right tabular">{r.held}</td><td className="px-3 py-2.5 text-right tabular">{r.signed}</td><td className="px-3 py-2.5 text-right font-semibold tabular">{pct(r.closeRate)}</td><td className="px-3 py-2.5 pr-5 text-right tabular">{euro.format(r.amount)}</td></tr>)}</tbody></table></div>
              )}
            </Card>
            <Card><CardHeader title="Par source" description="D'où viennent les leads qui signent." />
              {kpi.sources.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Aucun appel tenu sur la période.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-[13.5px]"><thead><tr className="border-b border-border"><Head right={false} first>Source</Head><Head>Tenus</Head><Head>Signés</Head><Head>Closing</Head><Head>Signé HT</Head></tr></thead>
                  <tbody className="divide-y divide-border">{kpi.sources.slice(0, 8).map((r) => <tr key={r.label}><th scope="row" className="max-w-[180px] truncate px-3 py-2.5 pl-5 text-left font-medium">{r.label}</th><td className="px-3 py-2.5 text-right tabular">{r.held}</td><td className="px-3 py-2.5 text-right tabular">{r.signed}</td><td className="px-3 py-2.5 text-right font-semibold tabular">{pct(r.rate)}</td><td className="px-3 py-2.5 pr-5 text-right tabular">{euro.format(r.amount)}</td></tr>)}</tbody></table></div>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "setters" ? (
        <Card>
          <CardHeader title="Setters" description={board.setters.ranked ? "Classés par rendez-vous pris. Survole un intitulé pour lire sa règle de calcul." : `${board.setters.reason ?? ""} Les chiffres sont affichés sans rang.`} />
          {kpi.setters.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Aucun setter dans l&apos;équipe. Invite-en un depuis Réglages › Équipe.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-[13.5px]">
                <thead><tr className="border-b border-border"><Head right={false} first>Rang</Head><Head right={false}>Setter</Head><Head rule={KPI_RULES.assigned}>Leads reçus</Head><Head rule={KPI_RULES.handled}>Leads traités</Head><Head rule={KPI_RULES.booked}>RDV pris</Head><Head rule={KPI_RULES.bookingRate}>Taux de RDV</Head><Head rule={KPI_RULES.showRate}>Présence</Head><Head rule="Signatures et montant signé HT sur les leads qu'il a apportés.">Signé grâce à lui</Head>{seesAll ? KPI_FIELDS.setter.map((fd) => <Head key={fd.key} rule={KPI_RULES.declared}>{fd.label}</Head>) : null}</tr></thead>
                <tbody className="divide-y divide-border">
                  {kpi.setters.map((r, i) => (
                    <tr key={r.id} className={r.id === me ? "bg-accent-soft/40" : undefined}>
                      <td className="px-3 py-2.5 pl-5 tabular text-muted">{board.setters.ranked ? i + 1 : "—"}</td>
                      <th scope="row" className="px-3 py-2.5 text-left font-medium">{seesAll ? <Link href={`/marketing/equipe/${r.id}`} className="hover:underline">{r.name}</Link> : r.name}{r.id === me ? " (toi)" : ""}</th>
                      <td className="px-3 py-2.5 text-right tabular">{r.assigned}</td><td className="px-3 py-2.5 text-right tabular">{r.handled}</td><td className="px-3 py-2.5 text-right font-semibold tabular">{r.booked}</td><td className="px-3 py-2.5 text-right tabular">{pct(r.bookingRate)}</td><td className="px-3 py-2.5 text-right tabular">{pct(r.showRate)}</td>
                      <td className="px-3 py-2.5 text-right tabular">{r.signed ? `${r.signed} · ${euro.format(r.amount)}` : "—"}</td>
                      {seesAll ? KPI_FIELDS.setter.map((fd) => <td key={fd.key} className="px-3 py-2.5 pr-5 text-right tabular text-fg-2">{num(r.declared[fd.key])}</td>) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {seesAll ? <p className="border-t border-border px-5 py-3 text-[12px] text-muted">Les quatre dernières colonnes viennent du suivi quotidien saisi par chaque setter : elles sont déclaratives.</p> : null}
        </Card>
      ) : null}

      {tab === "closers" ? (
        <Card>
          <CardHeader title="Closers" description={board.closers.ranked ? "Classés par montant signé. Survole un intitulé pour lire sa règle de calcul." : `${board.closers.reason ?? ""} Les chiffres sont affichés sans rang.`} />
          {kpi.closers.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Aucun closer dans l&apos;équipe. Invite-en un depuis Réglages › Équipe.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-[13.5px]">
                <thead><tr className="border-b border-border"><Head right={false} first>Rang</Head><Head right={false}>Closer</Head><Head rule={KPI_RULES.scheduled}>RDV prévus</Head><Head rule={KPI_RULES.held}>Tenus</Head><Head rule={KPI_RULES.noShow}>Absents</Head><Head rule={KPI_RULES.showRate}>Présence</Head><Head rule={KPI_RULES.signed}>Signés</Head><Head rule={KPI_RULES.closeRate}>Closing</Head><Head rule={KPI_RULES.amount}>Signé HT</Head><Head rule={KPI_RULES.average}>Panier moyen</Head>{seesAll ? KPI_FIELDS.closer.map((fd) => <Head key={fd.key} rule={KPI_RULES.declared}>{fd.label}</Head>) : null}</tr></thead>
                <tbody className="divide-y divide-border">{kpi.closers.map(closerRow)}</tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "suivi" ? (
        entries === null ? null : (
          <DailyEntry today={today} me={me} canPickMember={seesAll} defaultRole={myRole}
            members={team.filter((m) => m.marketing_role === "setter" || m.marketing_role === "closer").map((m) => ({ id: m.id, name: m.name, role: m.marketing_role as "setter" | "closer" }))}
            entries={entries.map((e) => ({ profile_id: e.profile_id, day: e.day, metrics: e.metrics ?? {}, note: e.note }))} />
        )
      ) : null}
    </>
  );
}
