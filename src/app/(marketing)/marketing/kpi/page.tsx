import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardPen, Euro, Handshake, PhoneCall, UserCheck } from "lucide-react";
import { crmPage, facts, isAdmin, members, salesRole } from "@/lib/marketing/crm-server";
import { kpiLinkData } from "@/lib/marketing/kpi-links-server";
import { buildKpi, KPI_RULES, type ClosingKpi } from "@/lib/marketing/kpi";
import { buildLeaderboard, MIN_SAMPLE } from "@/lib/marketing/leaderboard";
import { KPI_FIELDS, type KpiEntry } from "@/lib/marketing/types";
import { euro } from "@/lib/marketing/ui";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { DeleteKpiEntry } from "./delete-entry";
import { TabChips } from "../paiements/parts";
import { MkChart } from "../_components/mk-chart";
import { BTN_PRIMARY, ChartLegend, DashHeader, Delta, Panel, PanelEmpty, PeriodSwitch, RuleLabel, ScrollHint, StatCard, TABLE, TD, TH, THEAD, TR, UnderlineTabs, WarnBanner } from "../_components/dash-ui";

export const metadata: Metadata = { title: "KPI" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS = [7, 30, 90] as const;
const TABS = [["closing", "Closing"], ["setters", "Setters"], ["closers", "Closers"], ["suivi", "Suivi du jour"]] as const;
type Tab = (typeof TABS)[number][0];
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
const num = (v: number | undefined) => (v ? String(v) : "—");
/** Colonnes du suivi quotidien : champs des setters puis des closers. */
const DAILY_FIELDS = [...KPI_FIELDS.setter, ...KPI_FIELDS.closer];

/** En-tête de colonne : la règle de calcul se lit au survol de l'intitulé. */
const Head = ({ children, rule, right = true }: { children: React.ReactNode; rule?: string; right?: boolean }) => (
  <th scope="col" className={cn(TH, right && "text-right")}><RuleLabel rule={rule}>{children}</RuleLabel></th>
);
const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : Math.round((now - before) * 10) / 10);
const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? "s" : ""}`;
const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
/** Suivi du jour : lignes affichées d'emblée, et lignes lues au plus sur la période. */
const DAILY_MAX = 120, READ_MAX = 2000;
const ROW_ME = "bg-accent-soft/40 hover:bg-accent-soft/60";
/** Une ligne du suivi du jour : saisie d'un membre, ou d'une personne autorisée par lien (« par lien »). */
interface DailyRow { key: string; entryId: string; day: string; id: string; name: string; viaLink: boolean; metrics: Record<string, number>; note: string | null }

export default async function KpiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_classement");
  const days = PERIODS.includes(Number(one(sp.jours)) as (typeof PERIODS)[number]) ? Number(one(sp.jours)) : 30;
  const tab: Tab = (TABS.find(([k]) => k === one(sp.onglet))?.[0] ?? "closing") as Tab;
  const now = new Date(), to = new Date(now.getTime() + 60_000).toISOString(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), before = new Date(now.getTime() - 2 * days * 86_400_000).toISOString();
  const [f, team, entries, links] = await Promise.all([
    facts(crm, { tasks: true }), members(),
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", from.slice(0, 10)]], order: ["day", "desc"], limit: READ_MAX }).then((r) => r as KpiEntry[] | null).catch(() => null),
    // Saisies faites par lien (migration 0028) : lues seulement par un membre de l'agence, comme le suivi de l'équipe.
    tab === "suivi" ? kpiLinkData(crm, from.slice(0, 10), READ_MAX).catch(() => null) : Promise.resolve({ names: [], entries: [] }),
  ]);
  const base = { prospects: f.prospects, appointments: f.appointments, tasks: f.tasks, members: team, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id) };
  const kpi = buildKpi({ ...base, entries: entries ?? [], from, to });
  const prev = buildKpi({ ...base, entries: [], from: before, to: from });
  const board = buildLeaderboard({ ...base, from, to });
  const me = crm.session.user.id, role = salesRole(crm.session), seesAll = !role, admin = isAdmin(crm.session);
  const c = kpi.closing, d = delta(c.closeRate, prev.closing.closeRate);
  const href = (o: { onglet?: string; jours?: number }) => `/marketing/kpi?onglet=${o.onglet ?? tab}&jours=${o.jours ?? days}`;
  const showAll = one(sp.tout) === "1";
  const tabs = TABS.map(([k, label]) => ({ href: href({ onglet: k }), label, active: k === tab }));
  const outcomes: Array<[string, number]> = [["Signé", c.signed], ["En réflexion", c.thinking], ["Non signé", c.notSigned], ["Issue non saisie", Math.max(0, c.held - c.signed - c.thinking - c.notSigned)]];
  const memberLink = (id: string, name: string) => (seesAll ? <Link href={`/marketing/equipe/${id}`} className="transition hover:text-accent-2 hover:underline">{name}</Link> : name);
  const toi = (id: string) => (id === me ? <span className="font-normal text-mk-sub"> (toi)</span> : null);
  const closerRow = (r: ClosingKpi & { id: string; name: string; declared: Record<string, number> }, i: number) => (
    <tr key={r.id} className={cn(TR, r.id === me && ROW_ME)}>
      <td className={cn(TD, "text-mk-sub")}>{board.closers.ranked ? i + 1 : "—"}</td>
      <th scope="row" className={cn(TD, "whitespace-nowrap text-left font-medium text-mk-strong")}>{memberLink(r.id, r.name)}{toi(r.id)}</th>
      <td className={cn(TD, "text-right")}>{r.scheduled}</td><td className={cn(TD, "text-right")}>{r.held}</td><td className={cn(TD, "text-right")}>{r.noShow}</td><td className={cn(TD, "text-right")}>{pct(r.showRate)}</td>
      <td className={cn(TD, "text-right")}>{r.signed}</td>
      <td className={cn(TD, "whitespace-nowrap text-right font-semibold text-mk-strong")}>{pct(r.closeRate)}{r.held > 0 && r.held < MIN_SAMPLE ? <span className="block text-[12px] font-normal text-mk-sub">sur {plural(r.held, "appel")}</span> : null}</td>
      <td className={cn(TD, "whitespace-nowrap text-right font-semibold text-mk-strong")}>{euro.format(r.amount)}</td><td className={cn(TD, "whitespace-nowrap text-right")}>{r.average === null ? "—" : euro.format(r.average)}</td>
      {seesAll ? KPI_FIELDS.closer.map((fd) => <td key={fd.key} className={cn(TD, "text-right")}>{num(r.declared[fd.key])}</td>) : null}
    </tr>
  );

  const names = new Map(team.map((m) => [m.id, m.name]));
  const nameOf = (id: string) => names.get(id) ?? (id === me ? "Moi" : "Ancien membre");
  // Suivi du jour : saisies des membres et saisies faites par lien, dans le même tableau, du plus récent au plus ancien.
  const linkNames = new Map((links?.names ?? []).map((n) => [n.id, n.name]));
  const rowsAll: DailyRow[] = [
    ...(entries ?? []).map((e) => ({ key: `m-${e.profile_id}-${e.day}`, entryId: e.id, day: e.day, id: e.profile_id, name: nameOf(e.profile_id), viaLink: false, metrics: e.metrics ?? {}, note: e.note })),
    ...(links?.entries ?? []).map((e) => ({ key: `l-${e.person_id}-${e.day}`, entryId: e.id, day: e.day, id: e.person_id, name: linkNames.get(e.person_id) ?? "Personne supprimée", viaLink: true, metrics: e.metrics ?? {}, note: e.note })),
  ].sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name, "fr"));
  // Les 120 saisies les plus récentes, ou toutes celles lues sur demande (« Tout afficher »).
  const daily = showAll ? rowsAll : rowsAll.slice(0, DAILY_MAX);
  const dailyTotal = rowsAll.length;
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dayOf = (d: string) => { const t = dayFmt.format(new Date(`${d}T00:00:00Z`)); return t.charAt(0).toUpperCase() + t.slice(1); };

  return (
    // Conteneur : les colonnes suivent la place réellement disponible (barre latérale dépliée ou repliée), pas la fenêtre.
    <div className="@container">
      {/* Téléphone : onglets en pastilles, puis la période */}
      <TabChips label="Onglets KPI" items={tabs} />
      <DashHeader title="KPI" sub="Le suivi de l'équipe commerciale : taux de closing, setters, closers. Chaque chiffre vient du CRM."
        actions={<>
          {crm.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : null}
          <PeriodSwitch value={days} options={PERIODS} hrefOf={(n) => href({ jours: n })} />
        </>} />
      <UnderlineTabs label="Onglets KPI" items={tabs} />
      {entries === null ? <WarnBanner>Le suivi quotidien demande la migration 0026. Les chiffres calculés à partir du CRM restent justes.</WarnBanner> : null}

      {tab === "closing" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:gap-4 @min-[880px]:grid-cols-4">
            <StatCard label="Taux de closing" value={pct(c.closeRate)} icon={Handshake} tone="accent"
              hint={c.held === 0 ? "Aucun appel tenu sur la période." : <>
                <span className="block">{plural(c.signed, "signé")} sur {plural(c.held, "appel")} tenu{c.held > 1 ? "s" : ""}</span>
                {d !== null ? <span className="mt-1 block"><Delta value={d} unit="pt" suffix={`vs les ${days} jours d'avant`} /></span> : null}
              </>} />
            <StatCard label="Montant signé HT" value={euro.format(c.amount)} icon={Euro} tone="success"
              hint={c.average === null ? "Aucune signature." : `Panier moyen : ${euro.format(c.average)}`} />
            <StatCard label="Appels tenus" value={String(c.held)} icon={PhoneCall} tone="accent"
              hint={`${c.scheduled} rendez-vous prévus · ${c.noShow} absent${c.noShow > 1 ? "s" : ""}`} />
            <StatCard label="Taux de présence" value={pct(c.showRate)} icon={UserCheck} tone={c.pending ? "warn" : "accent"}
              hint={c.pending ? <span className="font-medium text-mk-warn">{c.pending} résultat{c.pending > 1 ? "s" : ""} d&apos;appel à saisir</span> : "Tous les résultats sont saisis."} />
          </div>

          <div className="grid gap-4 @min-[960px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="Appels tenus et signatures par semaine" sub="Semaine du rendez-vous." action={<ChartLegend items={[{ label: "Appels tenus", muted: true }, { label: "Signés" }]} />}>
              {kpi.weekly.some((w) => w.held > 0)
                ? <MkChart data={kpi.weekly.map((w) => ({ label: w.label, held: w.held, signed: w.signed }))} series={[{ key: "held", label: "Appels tenus", muted: true }, { key: "signed", label: "Signés" }]} kind="bar" height={240} />
                : <PanelEmpty>Aucun appel tenu sur la période.</PanelEmpty>}
            </Panel>
            <Panel title="Issue des appels tenus" sub="Ce que sont devenus les appels de la période.">
              {c.held === 0 ? <PanelEmpty>Rien à afficher.</PanelEmpty> : (
                <ul className="space-y-4">
                  {outcomes.map(([label, n], i) => (
                    <li key={label}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="text-mk-text">{label}</span>
                        <span className="text-mk-sub tabular-nums"><b className="font-semibold text-mk-strong">{n}</b> · {pct(Math.round((n / c.held) * 1000) / 10)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-mk-chip" aria-hidden><div className={cn("h-full rounded-full", i === 0 ? "bg-accent" : "bg-muted-2")} style={{ width: `${(n / c.held) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Taux de closing par semaine" sub="Signés ÷ appels tenus. Une semaine sans appel reste vide.">
            {kpi.weekly.some((w) => w.rate !== null)
              ? <MkChart data={kpi.weekly.map((w) => ({ label: w.label, rate: w.rate }))} series={[{ key: "rate", label: "Taux de closing" }]} format="pctRaw" kind="line" height={200} />
              : <PanelEmpty>Pas encore de taux à tracer.</PanelEmpty>}
          </Panel>
          <div className="grid gap-4 @min-[960px]:grid-cols-2">
            <Panel flush title="Par closer" sub="Appels tenus et signatures de chaque closer.">
              {kpi.closers.length === 0 ? <PanelEmpty className="border-t border-mk-line">Aucun closer dans l&apos;équipe.</PanelEmpty> : (
                <div className="overflow-x-auto">
                  <table className={cn(TABLE, "min-w-[440px]")}>
                    <thead className={THEAD}><tr><Head right={false}>Closer</Head><Head rule={KPI_RULES.held}>Tenus</Head><Head rule={KPI_RULES.signed}>Signés</Head><Head rule={KPI_RULES.closeRate}>Closing</Head><Head rule={KPI_RULES.amount}>Signé HT</Head></tr></thead>
                    <tbody>{kpi.closers.map((r) => (
                      <tr key={r.id} className={TR}>
                        <th scope="row" className={cn(TD, "whitespace-nowrap text-left font-medium text-mk-strong")}>{r.name}</th>
                        <td className={cn(TD, "text-right")}>{r.held}</td><td className={cn(TD, "text-right")}>{r.signed}</td>
                        <td className={cn(TD, "text-right font-semibold text-mk-strong")}>{pct(r.closeRate)}</td><td className={cn(TD, "whitespace-nowrap text-right")}>{euro.format(r.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel flush title="Par source" sub="D'où viennent les leads qui signent.">
              {kpi.sources.length === 0 ? <PanelEmpty className="border-t border-mk-line">Aucun appel tenu sur la période.</PanelEmpty> : (
                <div className="overflow-x-auto">
                  <table className={cn(TABLE, "min-w-[440px]")}>
                    <thead className={THEAD}><tr><Head right={false}>Source</Head><Head rule={KPI_RULES.held}>Tenus</Head><Head rule={KPI_RULES.signed}>Signés</Head><Head rule={KPI_RULES.closeRate}>Closing</Head><Head rule={KPI_RULES.amount}>Signé HT</Head></tr></thead>
                    <tbody>{kpi.sources.slice(0, 8).map((r) => (
                      <tr key={r.label} className={TR}>
                        <th scope="row" className={cn(TD, "max-w-[200px] truncate text-left font-medium text-mk-strong")} title={r.label}>{r.label}</th>
                        <td className={cn(TD, "text-right")}>{r.held}</td><td className={cn(TD, "text-right")}>{r.signed}</td>
                        <td className={cn(TD, "text-right font-semibold text-mk-strong")}>{pct(r.rate)}</td><td className={cn(TD, "whitespace-nowrap text-right")}>{euro.format(r.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "setters" ? (
        <Panel flush title="Setters" sub={board.setters.ranked ? "Classés par rendez-vous pris. Survole un intitulé pour lire sa règle de calcul." : `${board.setters.reason ?? ""} Les chiffres sont affichés sans rang.`}>
          {kpi.setters.length === 0 ? <PanelEmpty className="border-t border-mk-line">Aucun setter dans l&apos;équipe. Invite-en un depuis Réglages › Équipe et accès.</PanelEmpty> : (
            <><ScrollHint /><div className="overflow-x-auto">
              <table className={cn(TABLE, "min-w-[980px]")}>
                <thead className={THEAD}><tr><Head right={false}>Rang</Head><Head right={false}>Setter</Head><Head rule={KPI_RULES.assigned}>Leads reçus</Head><Head rule={KPI_RULES.handled}>Leads traités</Head><Head rule={KPI_RULES.booked}>RDV pris</Head><Head rule={KPI_RULES.bookingRate}>Taux de RDV</Head><Head rule={KPI_RULES.showRate}>Présence</Head><Head rule="Signatures et montant signé HT sur les leads qu'il a apportés.">Signé grâce à lui</Head>{seesAll ? KPI_FIELDS.setter.map((fd) => <Head key={fd.key} rule={KPI_RULES.declared}>{fd.label}</Head>) : null}</tr></thead>
                <tbody>
                  {kpi.setters.map((r, i) => (
                    <tr key={r.id} className={cn(TR, r.id === me && ROW_ME)}>
                      <td className={cn(TD, "text-mk-sub")}>{board.setters.ranked ? i + 1 : "—"}</td>
                      <th scope="row" className={cn(TD, "whitespace-nowrap text-left font-medium text-mk-strong")}>{memberLink(r.id, r.name)}{toi(r.id)}</th>
                      <td className={cn(TD, "text-right")}>{r.assigned}</td><td className={cn(TD, "text-right")}>{r.handled}</td><td className={cn(TD, "text-right font-semibold text-mk-strong")}>{r.booked}</td><td className={cn(TD, "text-right")}>{pct(r.bookingRate)}</td><td className={cn(TD, "text-right")}>{pct(r.showRate)}</td>
                      <td className={cn(TD, "whitespace-nowrap text-right")}>{r.signed ? `${r.signed} · ${euro.format(r.amount)}` : "—"}</td>
                      {seesAll ? KPI_FIELDS.setter.map((fd) => <td key={fd.key} className={cn(TD, "text-right")}>{num(r.declared[fd.key])}</td>) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></>
          )}
          {seesAll ? <p className="border-t border-mk-line px-4 py-3 text-[13px] text-mk-sub lg:px-5">Les quatre dernières colonnes viennent du suivi quotidien saisi par chaque setter : elles sont déclaratives.</p> : null}
        </Panel>
      ) : null}

      {tab === "closers" ? (
        <Panel flush title="Closers" sub={board.closers.ranked ? "Classés par montant signé. Survole un intitulé pour lire sa règle de calcul." : `${board.closers.reason ?? ""} Les chiffres sont affichés sans rang.`}>
          {kpi.closers.length === 0 ? <PanelEmpty className="border-t border-mk-line">Aucun closer dans l&apos;équipe. Invite-en un depuis Réglages › Équipe et accès.</PanelEmpty> : (
            <><ScrollHint /><div className="overflow-x-auto">
              <table className={cn(TABLE, "min-w-[1040px]")}>
                <thead className={THEAD}><tr><Head right={false}>Rang</Head><Head right={false}>Closer</Head><Head rule={KPI_RULES.scheduled}>RDV prévus</Head><Head rule={KPI_RULES.held}>Tenus</Head><Head rule={KPI_RULES.noShow}>Absents</Head><Head rule={KPI_RULES.showRate}>Présence</Head><Head rule={KPI_RULES.signed}>Signés</Head><Head rule={KPI_RULES.closeRate}>Closing</Head><Head rule={KPI_RULES.amount}>Signé HT</Head><Head rule={KPI_RULES.average}>Panier moyen</Head>{seesAll ? KPI_FIELDS.closer.map((fd) => <Head key={fd.key} rule={KPI_RULES.declared}>{fd.label}</Head>) : null}</tr></thead>
                <tbody>{kpi.closers.map(closerRow)}</tbody>
              </table>
            </div></>
          )}
        </Panel>
      ) : null}

      {tab === "suivi" && seesAll && links === null && entries !== null ? <WarnBanner>Les saisies faites par lien demandent la migration 0028. Le suivi des membres reste juste.</WarnBanner> : null}
      {tab === "suivi" ? (
        entries === null ? null : (
          <Panel flush title={seesAll ? "Suivi quotidien de l'équipe" : "Ton suivi quotidien"}
            sub={`Chiffres déclarés chaque jour par les setters et les closers, sur les ${days} derniers jours. La saisie se fait dans Paiements › Saisie des KPI${seesAll ? ", ou par le lien personnel de chacun" : ""}.`}
            action={<Link href="/marketing/paiements?onglet=kpi" className={cn(BTN_PRIMARY, "w-full sm:w-auto")}><ClipboardPen strokeWidth={2} />Saisir mes chiffres du jour</Link>}>
            {daily.length === 0 ? <PanelEmpty className="border-t border-mk-line">Aucun jour saisi sur la période.</PanelEmpty> : (
              <><ScrollHint /><div className="overflow-x-auto">
                <table className={cn(TABLE, "min-w-[980px]")}>
                  <thead className={THEAD}><tr><Head right={false}>Jour</Head>{seesAll ? <Head right={false}>Membre</Head> : null}{DAILY_FIELDS.map((fd) => <Head key={fd.key} rule={fd.hint}>{fd.label}</Head>)}<Head right={false}>Remarque</Head>{admin ? <th scope="col" className={cn(TH, "w-12")}><span className="sr-only">Supprimer</span></th> : null}</tr></thead>
                  <tbody>
                    {daily.map((e) => (
                      <tr key={e.key} className={cn(TR, !e.viaLink && e.id === me && ROW_ME)}>
                        <td className={cn(TD, "whitespace-nowrap font-medium text-mk-strong")}>{dayOf(e.day)}</td>
                        {seesAll ? (
                          <th scope="row" className={cn(TD, "whitespace-nowrap text-left font-medium text-mk-strong")}>
                            {e.viaLink
                              ? <>{e.name}<span className="ml-2 inline-flex h-5 items-center rounded-full bg-mk-chip px-2 align-middle text-[11.5px] font-medium text-mk-sub" title="Saisi avec son lien personnel, sans compte">par lien</span></>
                              : <><Link href={`/marketing/equipe/${e.id}`} className="transition hover:text-accent-2 hover:underline">{e.name}</Link>{toi(e.id)}</>}
                          </th>
                        ) : null}
                        {DAILY_FIELDS.map((fd) => <td key={fd.key} className={cn(TD, "text-right")}>{num(e.metrics?.[fd.key])}</td>)}
                        <td className={cn(TD, "max-w-[240px] truncate text-mk-sub")} title={e.note ?? undefined}>{e.note ?? ""}</td>
                        {admin ? <td className={cn(TD, "w-12 text-right")}><DeleteKpiEntry kind={e.viaLink ? "lien" : "membre"} entryId={e.entryId} label={`${e.name}, ${dayOf(e.day)}`} /></td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dailyTotal > DAILY_MAX ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-mk-line px-4 py-3 text-[13px] text-mk-sub lg:px-5">
                  <span>{showAll
                    ? `${fr(dailyTotal)} saisies affichées${dailyTotal >= READ_MAX ? ` : les ${fr(READ_MAX)} plus récentes. Choisis une période plus courte pour voir les autres.` : "."}`
                    : `Les ${DAILY_MAX} saisies les plus récentes sur ${fr(dailyTotal)}${dailyTotal >= READ_MAX ? " ou plus" : ""}.`}</span>
                  <Link href={showAll ? href({}) : `${href({})}&tout=1`} scroll={false} className="font-medium text-accent-2 hover:underline">{showAll ? `Afficher les ${DAILY_MAX} plus récentes` : "Tout afficher"}</Link>
                </p>
              ) : null}</>
            )}
          </Panel>
        )
      ) : null}
    </div>
  );
}
