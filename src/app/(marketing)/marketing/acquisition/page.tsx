import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarCheck, CalendarDays, ChevronRight, ClipboardCheck, Euro, Inbox, UserCheck, Users, type LucideIcon } from "lucide-react";
import { crmPage, facts, isAdmin, members, salesRole, type Crm } from "@/lib/marketing/crm-server";
import { canSeeKpiLinkEntries, kpiLinkData } from "@/lib/marketing/kpi-links-server";
import { dayLabel, declaredTotals, DECLARED_FIELDS, sinceLabel, todayIn } from "@/lib/marketing/kpi-links";
import { breakdown, buildFunnel, leadSeries, upcomingByWeek } from "@/lib/marketing/funnel";
import { myTodoSummary } from "@/lib/marketing/home-server";
import { buildKpi } from "@/lib/marketing/kpi";
import { euro, stageHex } from "@/lib/marketing/ui";
import type { Breakdown, FunnelStage, KpiEntry, MarketingCounts } from "@/lib/marketing/types";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { FunnelFlow } from "./funnel-flow";
import { FunnelTable } from "../_components/funnel-table";
import { ComparePages } from "./compare-pages";
import { MkChart } from "../_components/mk-chart";
import { ChartLegend, DashHeader, Note, Panel, PanelEmpty, PeriodSwitch, SIGNED_RULE, StatCard, ToneIcon, type DashTone } from "../_components/dash-ui";

export const metadata: Metadata = { title: "Tableau de bord" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const plural = (n: number, s: string, p = `${s}s`) => `${fr(n)} ${n > 1 ? p : s}`;
const PERIODS = [7, 30, 90] as const;

/** Répartition en barres : libellé et nombre au-dessus, barre verte proportionnelle dessous. */
function BreakdownBars({ items, empty }: { items: Breakdown[]; empty: string }) {
  if (!items.length) return <PanelEmpty>{empty}</PanelEmpty>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-3.5">
      {items.slice(0, 8).map((i) => (
        <li key={i.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate text-mk-text" title={i.label}>{i.label}</span>
            <span className="shrink-0 font-semibold text-mk-strong tabular-nums">{i.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-mk-chip" aria-hidden><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

interface Declared { totals: Record<string, number>; count: number; people: number; recent: Array<{ key: string; name: string; viaLink: boolean; day: string; at: string }>; linksMissing: boolean }
/**
 * Suivi déclaré de l'équipe sur la période : saisies des membres (0026) et saisies faites par lien (0028), additionnées.
 * Lu seulement par un membre de l'agence avec le droit KPI (comme la base l'exige) ; `null` sinon, ou si 0026 manque.
 */
async function declared(crm: Crm, fromDay: string): Promise<Declared | null> {
  if (!canSeeKpiLinkEntries(crm)) return null;
  const [mine, links, team] = await Promise.all([
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", fromDay]], order: ["day", "desc"], limit: 2000 }).catch(() => null),
    kpiLinkData(crm, fromDay).catch(() => null), members(),
  ]);
  if (mine === null) return null;
  const names = new Map(team.map((m) => [m.id, m.name])), linkNames = new Map((links?.names ?? []).map((n) => [n.id, n.name]));
  const rows = [
    ...mine.map((e) => ({ key: `m-${e.id}`, who: `m-${e.profile_id}`, name: names.get(e.profile_id) ?? "Ancien membre", viaLink: false, day: e.day, at: e.updated_at || e.created_at, metrics: e.metrics })),
    ...(links?.entries ?? []).map((e) => ({ key: `l-${e.id}`, who: `l-${e.person_id}`, name: linkNames.get(e.person_id) ?? "Personne supprimée", viaLink: true, day: e.day, at: e.updated_at || e.created_at, metrics: e.metrics })),
  ];
  const recent = [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map(({ key, name, viaLink, day, at }) => ({ key, name, viaLink, day, at }));
  return { totals: declaredTotals(rows), count: rows.length, people: new Set(rows.map((r) => r.who)).size, recent, linksMissing: links === null };
}

export default async function MarketingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_dashboard");
  const days = one(sp.days) === "90" ? 90 : one(sp.days) === "7" ? 7 : 30;
  const can = (m: ModuleKey) => canAccess(crm.session.profile, m);
  const role = salesRole(crm.session);
  // Résultats à saisir : pour l'agence et un closer, exactement ceux que listent Tâches › Éléments à faire et les Notifications.
  const listed = can("marketing_taches") && (role === null || role === "closer");
  const now = new Date(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const settings = await crm.store.settings().catch(() => null), tz = settings?.timezone ?? "Europe/Paris";
  const [f, counts, todo, decl] = await Promise.all([
    facts(crm), crm.store.counts().catch((): MarketingCounts => ({ prospects: 0, appointments: 0, emailsPending: 0 })),
    listed ? myTodoSummary(tz).catch(() => null) : Promise.resolve(null),
    declared(crm, from.slice(0, 10)),
  ]);
  const today = todayIn(tz, now);
  const base = { prospects: f.prospects, appointments: f.appointments, insights: f.insights, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to };
  const byPage = buildFunnel({ ...base, by: "landing_page" }), byCampaign = buildFunnel({ ...base, by: "campaign" });
  const t = byPage.total;
  // Signés et montant signé HT : le calcul de la page KPI (closing), sur la même période, pour que les deux pages concordent.
  const closing = buildKpi({ prospects: f.prospects, appointments: f.appointments, tasks: [], entries: [], members: [], wonStages: base.wonStages, from, to }).closing;
  const cohort = f.prospects.filter((p) => { const d = p.opted_in_at ?? p.created_at; return d >= from && d < to; });
  const series = leadSeries(cohort, days, now), weeks = upcomingByWeek(f.appointments, now);
  const upcoming = f.appointments.filter((a) => a.status === "confirme" && Date.parse(a.starts_at) > now.getTime()).length;
  // Sans liste à ouvrir (media buyer, setter) : le même compte, sur les faits sans coordonnées (rendez-vous commencés depuis 30 jours).
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const toFill = todo ? todo.results.length
    : f.appointments.filter((a) => a.status === "confirme" && Date.parse(a.starts_at) < now.getTime() && a.starts_at >= monthAgo && (a.result ?? "a_venir") === "a_venir").length;
  const funnel: FunnelStage[] = [
    { key: "leads", label: "Leads", count: t.leads, measured: true }, { key: "rdv", label: "RDV pris", count: t.booked, measured: true },
    { key: "presents", label: "Présents", count: t.showed, measured: true }, { key: "signes", label: "Signés", count: t.signed, measured: true },
  ];
  const stageCounts = f.stages.filter((s) => s.active).map((s) => ({ stage: s, count: f.prospects.filter((p) => p.stage_id === s.id).length }));
  const sources = breakdown(cohort, (p) => p.source, "(source inconnue)");
  const signRate = t.leads > 0 ? Math.round((t.signed / t.leads) * 1000) / 10 : null;
  const inbox = counts.inboxAttention ?? 0;
  const actions: Array<{ key: string; n: number; label: [string, string]; text: string; href: string; ok: boolean; icon: LucideIcon; tone: DashTone }> = [
    { key: "rdv", n: weeks[0]?.count ?? 0, label: ["rendez-vous cette semaine", "rendez-vous cette semaine"], text: "Confirmés, à préparer avant l'appel.", href: "/marketing/calendrier", ok: can("marketing_calendrier"), icon: CalendarDays, tone: "accent" },
    { key: "resultats", n: toFill, label: ["résultat à saisir", "résultats à saisir"], text: "Appels des 30 derniers jours dont le résultat n'est pas encore saisi.", href: "/marketing/taches", ok: !!todo, icon: ClipboardCheck, tone: toFill ? "warn" : "success" },
    { key: "reception", n: inbox, label: ["lead à vérifier", "leads à vérifier"], text: "Leads reçus en erreur, suspects ou bloqués.", href: "/marketing/reglages/reception", ok: can("marketing_reception"), icon: Inbox, tone: inbox ? "warn" : "success" },
  ];
  const share = (a: number, b: number) => `${Math.round((a / b) * 100)} %`;

  return (
    // Conteneur : les colonnes suivent la place réellement disponible (barre latérale dépliée ou repliée), pas la fenêtre.
    <div className="@container">
      <DashHeader title="Tableau de bord" sub="Ce que ton acquisition a produit sur la période."
        actions={<>
          {crm.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : null}
          <PeriodSwitch value={days} options={PERIODS} hrefOf={(n) => `/marketing/acquisition?days=${n}`} />
        </>} />

      {/* Les chiffres de la période */}
      <div className="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-6 lg:gap-4 @min-[1080px]:grid-cols-5">
        <StatCard className="@min-[560px]:col-span-2 @min-[1080px]:col-span-1" label="Leads" value={fr(t.leads)} icon={Users} tone="accent" hint={`Sur ${days} jours · ${fr(f.prospects.length)} au total`} />
        <StatCard className="@min-[560px]:col-span-2 @min-[1080px]:col-span-1" label="RDV pris" value={fr(t.booked)} icon={CalendarCheck} tone="accent" hint={t.leads ? `${share(t.booked, t.leads)} des leads` : "Aucun lead"} />
        <StatCard className="@min-[560px]:col-span-2 @min-[1080px]:col-span-1" label="Présents" value={fr(t.showed)} icon={UserCheck} tone="accent" hint={t.booked ? `${share(t.showed, t.booked)} des RDV pris` : "Aucun rendez-vous"} />
        <StatCard className="@min-[560px]:col-span-3 @min-[1080px]:col-span-1" label="Signés" value={fr(closing.signed)} icon={BadgeCheck} tone="success"
          hint={closing.held ? `Sur ${plural(closing.held, "appel tenu", "appels tenus")} de la période` : "Aucun appel tenu sur la période"} />
        <StatCard className="col-span-2 @min-[560px]:col-span-3 @min-[1080px]:col-span-1" label="Montant signé HT" value={euro.format(closing.amount)} icon={Euro} tone="success"
          hint={<><span className="block">Signés après un appel tenu, comme dans les KPI.</span><span className="mt-0.5 block">{t.spend === null ? "Dépense publicitaire non connectée" : `Dépense : ${euro.format(t.spend)}`}</span></>} />
      </div>
      <Note className="mt-3 px-1">{SIGNED_RULE} Le parcours « Du lead à la signature », plus bas, suit lui les leads arrivés sur la période, jusqu&apos;à aujourd&apos;hui.</Note>

      {/* Volume dans le temps · ce qui attend l'équipe */}
      <div className="mt-4 grid gap-4 @min-[1080px]:grid-cols-3">
        <Panel className="@min-[1080px]:col-span-2" title="Leads dans le temps" sub={`Nombre de leads par jour sur les ${days} derniers jours.`} action={<ChartLegend items={[{ label: "Leads par jour" }]} />}>
          {series.some((p) => p.count > 0)
            ? <MkChart data={series.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "Leads" }]} kind="area" height={260} />
            : <PanelEmpty className="py-24">Aucun lead sur la période.</PanelEmpty>}
        </Panel>
        <Panel title="À traiter" sub="Ce qui attend une action de l'équipe." flush>
          <ul className="border-t border-mk-line">
            {actions.map((a) => {
              const label = a.n > 1 ? a.label[1] : a.label[0];
              const body = (
                <>
                  <ToneIcon icon={a.icon} tone={a.tone} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2"><b className="text-[20px] font-semibold leading-tight text-mk-strong tabular-nums">{fr(a.n)}</b><span className="text-[14px] font-medium text-mk-text">{label}</span></span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-mk-sub">{a.text}</span>
                  </span>
                  {a.ok ? <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden /> : null}
                </>
              );
              const cls = "flex min-h-[76px] items-center gap-3.5 px-4 py-3 lg:px-5";
              return <li key={a.key} className="border-b border-mk-line last:border-b-0">{a.ok ? <Link href={a.href} className={cn(cls, "transition hover:bg-surface-2")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
            })}
          </ul>
        </Panel>
      </div>

      {/* Ce que l'équipe déclare chaque jour (membres et liens de saisie) */}
      {decl ? (
        <Panel className="mt-4" title="Suivi déclaré de l'équipe" sub={`Chiffres saisis chaque jour par les setters et les closers, avec leur compte ou leur lien personnel, sur les ${days} derniers jours. Déclaratifs : le CRM ne les vérifie pas.`}
          action={<Link href={`/marketing/kpi?onglet=suivi&jours=${days}`} className="inline-flex items-center gap-1 text-[14px] font-medium text-accent-2 hover:underline">Voir le suivi du jour<ChevronRight className="size-4" aria-hidden /></Link>}>
          {decl.linksMissing ? <p className="mb-4 rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-3.5 py-2.5 text-[13px] text-mk-warn">Les saisies faites par lien demandent la migration 0028 : seules celles des membres sont comptées.</p> : null}
          {decl.count === 0 ? (
            <PanelEmpty className="py-10">Aucune saisie sur la période. Les commerciaux notent leurs chiffres dans Paiements › Saisie des KPI, ou avec leur lien personnel.</PanelEmpty>
          ) : (
            <div className="grid gap-5 @min-[880px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] @min-[880px]:gap-8">
              <div>
                <p className="mb-2.5 text-[13px] text-mk-sub">{plural(decl.count, "saisie")} · {plural(decl.people, "personne")}</p>
                <ul className="grid grid-cols-2 gap-2.5 @min-[560px]:grid-cols-3">
                  {DECLARED_FIELDS.map((fd) => (
                    <li key={fd.key} className="rounded-[10px] border border-mk-line bg-surface-2 px-3.5 py-3" title={fd.hint}>
                      <p className="text-[12.5px] font-medium leading-snug text-mk-sub">{fd.label}</p>
                      <p className="mt-1 text-[22px] font-semibold leading-none text-mk-strong tabular-nums">{fr(decl.totals[fd.key] ?? 0)}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 text-[14px] font-semibold text-mk-strong">Dernières saisies</h3>
                <ul>
                  {decl.recent.map((r) => (
                    <li key={r.key} className="flex min-h-11 items-center gap-3 border-b border-mk-line py-2 text-[14px] last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-mk-strong">{r.name}{r.viaLink ? <span className="ml-2 inline-flex h-5 items-center rounded-full bg-mk-chip px-2 align-middle text-[11.5px] font-medium text-mk-sub">par lien</span> : null}</span>
                        <span className="block text-[13px] text-mk-sub">{dayLabel(r.day, today)}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-mk-sub tabular-nums">{sinceLabel(r.at, tz, now.getTime())}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Panel>
      ) : null}

      {/* Parcours de la cohorte · origine des leads */}
      <div className="mt-4 grid gap-4 @min-[1080px]:grid-cols-3">
        <Panel className="@min-[1080px]:col-span-2" title="Du lead à la signature" sub={`Les leads arrivés sur les ${days} derniers jours, et jusqu'où chacun est allé depuis.`}
          action={signRate === null
            ? <span className="text-[14px] font-medium text-mk-sub">Aucun lead sur la période</span>
            : <div className="sm:text-right"><p className="text-[24px] font-semibold leading-none text-mk-strong tabular-nums">{String(signRate).replace(".", ",")} %</p><p className="mt-1 text-[13px] text-mk-sub">des leads ont signé · {plural(t.leads, "lead")} → {plural(t.signed, "signé")}</p></div>}>
          <FunnelFlow stages={funnel} periodDays={days} />
          <Note className="mt-5 border-t border-mk-line pt-4">
            Un lead compte une seule fois par étape. La longueur de chaque barre est proportionnelle au nombre de leads, avec un trait minimal pour les petites valeurs. Les règles de calcul sont détaillées sous les tableaux ci-dessous.
          </Note>
        </Panel>
        <Panel title="Par source" sub="Origine des leads de la période."><BreakdownBars items={sources} empty="Aucun lead sur la période." /></Panel>
      </div>

      {/* L'entonnoir par page d'entrée et par campagne */}
      <Panel className="mt-4" flush title="Entonnoir par page d'entrée" sub="La première page vue par le visiteur, sans ses paramètres. C'est ici que se comparent ta page avec optin et ta page sans optin.">
        <FunnelTable funnel={byPage} first="Page d'entrée" byPage />
      </Panel>
      <Panel className="mt-4" flush title="Comparer deux pages" sub="Choisis deux pages d'entrée : les mêmes indicateurs, côte à côte."><ComparePages rows={byPage.rows} /></Panel>
      <Panel className="mt-4" flush title="Entonnoir par campagne" sub="Campagne relevée à l'arrivée du lead (utm_campaign, ou identifiant de campagne Meta).">
        <FunnelTable funnel={byCampaign} first="Campagne" />
      </Panel>
      {!byCampaign.hasSpend ? <Note className="mt-3 px-1">Dépense publicitaire non connectée : aucun coût n&apos;est affiché, plutôt qu&apos;un chiffre inventé.{isAdmin(crm.session) ? <> <Link href="/marketing/reglages#publicite" className="font-medium text-accent-2 hover:underline">Désigner le compte Meta Ads de l&apos;agence</Link></> : null}</Note> : null}

      {/* Le pipeline aujourd'hui */}
      <div className="mt-4 grid gap-4 @min-[1080px]:grid-cols-3">
        <Panel title="Répartition par étape" sub="État du moment, tous prospects confondus.">
          {stageCounts.length ? (
            <ul className="-my-1.5">
              {stageCounts.map(({ stage, count }) => (
                <li key={stage.id} className="flex h-11 items-center gap-2.5 border-b border-mk-line text-[14px] last:border-b-0">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: stageHex(stage) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-mk-text">{stage.name}</span>
                  <span className="font-semibold text-mk-strong tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          ) : <PanelEmpty>Aucune étape active.</PanelEmpty>}
        </Panel>
        <Panel className="@min-[1080px]:col-span-2" title="RDV à venir par semaine" sub="Rendez-vous confirmés, 8 prochaines semaines."
          action={<span className="inline-flex h-7 items-center rounded-full bg-mk-chip px-3 text-[13px] font-medium text-mk-text tabular-nums">{fr(upcoming)} RDV à venir</span>}>
          {weeks.some((w) => w.count > 0)
            ? <MkChart data={weeks.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "RDV" }]} kind="bar" height={220} />
            : <PanelEmpty>Aucun rendez-vous confirmé à venir.</PanelEmpty>}
        </Panel>
      </div>
      <p className="mt-6 px-1 text-[12px] text-mk-sub">Source : IconFlow Marketing · à l&apos;instant</p>
    </div>
  );
}
