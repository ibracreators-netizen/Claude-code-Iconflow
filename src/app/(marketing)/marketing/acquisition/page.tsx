import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarDays, ChevronRight, CircleCheck, ClipboardPen, Users } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { salesRoleOf } from "@/lib/marketing/db";
import { crmPage, members, salesRole } from "@/lib/marketing/crm-server";
import { declaredData, prospectSummary, refreshGoogleAfterResponse, upcomingCalls, type Person } from "@/lib/marketing/dashboard-server";
import { shiftDay, sinceLabel, todayIn } from "@/lib/marketing/kpi-links";
import { zonedTimeToUtc } from "@/lib/marketing/slots";
import { euro } from "@/lib/marketing/ui";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { MkChart, type MkSeries } from "../_components/mk-chart";
import { BTN_PRIMARY, ChartLegend, DashHeader, Note, Panel, PanelEmpty, PeriodSwitch, SegmentLinks, ToneIcon, WarnBanner } from "../_components/dash-ui";
import {
  countChange, dailySeries, daysBetween, fieldsFor, groupCalls, inDays, inTeam, missingOn, parsePeriod, parseTeam, periodLabel, periodRange, PERIODS,
  previousLabel, ranking, rate, rateChange, TEAM_FILTERS, totals, type TeamFilter,
} from "./perf";
import { CallDay, MissingList, PerfCards, RankingTable, type CardFigure } from "./parts";

export const metadata: Metadata = { title: "Tableau de bord" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const UPCOMING_DAYS = 7;
const LINK = "inline-flex items-center gap-1 text-[14px] font-medium text-accent-2 hover:underline";
/** Séries de la courbe par jour : le volume en gris, l'étape intermédiaire en vert clair, le résultat en vert. */
const SERIES: Record<"setter" | "closer", MkSeries[]> = {
  setter: [{ key: "appels", label: "Appels passés", muted: true }, { key: "decroches", label: "Appels décrochés", soft: true }, { key: "conversations", label: "Conversations" }],
  closer: [{ key: "relances", label: "Relances passées", muted: true }, { key: "propositions", label: "Propositions envoyées" }],
};

/**
 * Tableau de bord Marketing : les performances déclarées par l'équipe (saisies des membres et des liens de saisie)
 * et les appels des sept prochains jours (rendez-vous de l'app et agendas Google). La réception des leads et la
 * publicité n'y sont plus : les leads arrivent désormais par GoHighLevel.
 */
export default async function MarketingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  // Un setter ou un closer qui a le droit KPI ouvre aussi le tableau de bord : il n'y voit que ses propres chiffres.
  const session = await getSession();
  const gate: ModuleKey = session && salesRoleOf(session.profile) && !canAccess(session.profile, "marketing_dashboard") && canAccess(session.profile, "marketing_classement") ? "marketing_classement" : "marketing_dashboard";
  const crm = await crmPage(gate);
  const role = salesRole(crm.session), me = crm.session.user.id;
  const days = parsePeriod(one(sp.days));
  const settings = await crm.store.settings().catch(() => null), tz = settings?.timezone ?? "Europe/Paris";
  const now = new Date(), today = todayIn(tz, now), range = periodRange(today, days);
  // Courbe : la période, ou les sept derniers jours quand on regarde aujourd'hui seulement.
  const chartDays = daysBetween(days === 1 ? shiftDay(today, -6) : range.from, today);
  const readFrom = [range.prevFrom, chartDays[0]].sort()[0];
  const midnight = (day: string) => { const [y, mo, d] = day.split("-").map(Number); return zonedTimeToUtc(y, mo, d, 0, 0, tz); };

  // Agendas Google : relus après la réponse si leur copie date (la page n'attend pas).
  refreshGoogleAfterResponse();
  const [decl, up, pros, team] = await Promise.all([
    declaredData(crm, readFrom),
    upcomingCalls(crm, { now, until: midnight(shiftDay(today, UPCOMING_DAYS)) }),
    prospectSummary(crm, midnight(range.from).toISOString()),
    members(),
  ]);

  const seesTeam = decl.scope === "equipe";
  const teamFilter: TeamFilter = seesTeam ? parseTeam(one(sp.equipe)) : "tous";
  const href = (o: { days?: number; equipe?: TeamFilter }) => {
    const q = new URLSearchParams({ days: String(o.days ?? days) });
    const t = o.equipe ?? teamFilter;
    if (t !== "tous") q.set("equipe", t);
    return `/marketing/acquisition?${q.toString()}`;
  };
  const person = new Map(decl.people.map((p) => [p.who, p]));
  const rows = decl.rows.filter((r) => inTeam(person.get(r.who)?.role, teamFilter));
  const people = decl.people.filter((p) => inTeam(p.role, teamFilter));
  // Indicateurs montrés : ceux du filtre ; pour un setter ou un closer, ceux de son rôle.
  const own = role === "setter" || role === "closer" ? role : null;
  const fields = fieldsFor(own ?? teamFilter);
  const cur = totals(inDays(rows, range.from, range.to)), before = totals(inDays(rows, range.prevFrom, range.prevTo));
  const suffix = previousLabel(days), nothingBefore = days === 1 ? "Rien saisi hier" : `Rien sur les ${days} jours d'avant`;
  const cards: CardFigure[] = fields.map((f) => {
    const c: CardFigure = { field: f, value: cur[f.key] ?? 0, change: countChange(cur[f.key] ?? 0, before[f.key] ?? 0) };
    if (f.key === "decroches") c.rate = { label: "Taux de décroché", value: rate(cur.decroches, cur.appels), change: rateChange(rate(cur.decroches, cur.appels), rate(before.decroches, before.appels)) };
    if (f.key === "conversations") c.rate = { label: "Taux de conversation", value: rate(cur.conversations, cur.decroches), change: rateChange(rate(cur.conversations, cur.decroches), rate(before.conversations, before.decroches)) };
    return c;
  });
  const seriesKind: "setter" | "closer" = own ?? (teamFilter === "closers" ? "closer" : "setter");
  const series = SERIES[seriesKind];
  const daily = dailySeries(rows, chartDays, series.map((s) => s.key));
  const dayFmt = new Intl.DateTimeFormat("fr-FR", chartDays.length <= 7 ? { weekday: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  const chartData = daily.map((p) => ({ ...p, label: dayFmt.format(new Date(`${p.day}T00:00:00Z`)) }));
  const ranked = ranking(inDays(rows, range.from, range.to), people);
  const missing = missingOn(people, decl.rows, today);
  const expected = people.filter((p) => p.expected).length;
  const mine = decl.rows.filter((r) => r.who === `m:${me}`);
  const myToday = mine.some((r) => r.day === today), myDays = new Set(inDays(mine, range.from, range.to).map((r) => r.day)).size;
  const sinceOf = (p: Person) => (p.lastEntryAt ? `Dernière saisie ${sinceLabel(p.lastEntryAt, tz, now.getTime())}` : "Pas de saisie récente");

  // Appels à venir : ceux des membres du filtre (setters, closers) ; « Toute l'équipe » : tous.
  const roleOfMember = new Map(team.map((m) => [m.id, m.marketing_role ?? (m.admin ? "admin" as const : "equipe" as const)]));
  const calls = up.calls.filter((c) => teamFilter === "tous" || c.memberIds.some((id) => inTeam(roleOfMember.get(id), teamFilter)));
  const groups = groupCalls(calls, tz, today);
  const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const timeOf = (iso: string) => timeFmt.format(new Date(iso));
  const g = up.google;
  const googleLine = !g.ready || !up.allowed ? null
    : g.invalid ? <>L&apos;accès à ton agenda Google a expiré. <Link href="/marketing/calendrier" className="font-medium text-accent-2 hover:underline">Le reconnecter dans Calendrier</Link></>
    : g.connected ? <>Ton agenda Google est relu à l&apos;ouverture de cette page quand sa copie a plus de dix minutes{g.lastSync ? ` (dernière lecture ${sinceLabel(g.lastSync, tz, now.getTime())})` : ""}.</>
    : <>Ton agenda Google n&apos;est pas relié. <Link href="/marketing/calendrier" className="font-medium text-accent-2 hover:underline">Le relier dans Calendrier</Link></>;

  const periodText = days === 1 ? "aujourd'hui" : `sur les ${days} derniers jours`;
  return (
    // Conteneur : les colonnes suivent la place réellement disponible (barre latérale dépliée ou repliée), pas la fenêtre.
    <div className="@container">
      <DashHeader title="Tableau de bord"
        sub={seesTeam ? "Les performances déclarées par l'équipe et les appels des sept prochains jours." : "Tes performances déclarées et tes appels des sept prochains jours."}
        actions={<>
          {crm.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : null}
          <PeriodSwitch value={days} options={PERIODS} labelOf={periodLabel} hrefOf={(n) => href({ days: n })} />
        </>} />

      {decl.membersMissing ? <WarnBanner>Le suivi quotidien demande la migration 0026 de la base : les saisies des membres ne peuvent pas être lues.</WarnBanner> : null}
      {decl.linksMissing ? <WarnBanner>Les saisies faites par lien demandent la migration 0028 : seules celles des membres sont comptées.</WarnBanner> : null}

      {/* ─── Performances déclarées ─── */}
      <div className="mb-3 flex flex-col gap-3 @min-[720px]:flex-row @min-[720px]:items-end @min-[720px]:justify-between">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-snug text-mk-strong">{seesTeam ? "Performances de l'équipe" : "Tes performances"}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-mk-sub">
            {decl.scope === "aucun" ? "Elles viennent du suivi quotidien (KPI)." : `Chiffres saisis chaque jour, ${periodText}${seesTeam ? ", avec le compte ou le lien personnel de chacun" : ""}. Déclaratifs : l'app ne les vérifie pas.`}
          </p>
        </div>
        {seesTeam ? <SegmentLinks label="Membres de l'équipe" className="@min-[720px]:w-auto" items={TEAM_FILTERS.map(([k, label]) => ({ href: href({ equipe: k }), label, active: k === teamFilter }))} /> : null}
      </div>

      {decl.scope === "aucun" ? (
        <Panel title="Performances" sub="Le suivi quotidien n'est pas accordé à ton compte.">
          <PanelEmpty className="py-8">Demande l&apos;accès aux KPI à l&apos;administrateur pour voir les chiffres saisis.</PanelEmpty>
        </Panel>
      ) : (
        <>
          <PerfCards cards={cards} suffix={suffix} nothingBefore={nothingBefore} />
          {decl.truncated ? <Note className="mt-3 px-1">Très nombreuses saisies : seules les plus récentes ont été lues, la période d&apos;avant peut être incomplète. Choisis une période plus courte.</Note> : null}

          <div className="mt-4 grid gap-4 @min-[1080px]:grid-cols-3">
            <Panel className="@min-[1080px]:col-span-2" title="Activité par jour"
              sub={days === 1 ? "Les sept derniers jours, pour situer aujourd'hui." : `Total saisi chaque jour, ${periodText}.`}
              action={<ChartLegend items={series.map((s) => ({ label: s.label, muted: s.muted, soft: s.soft }))} />}>
              {daily.some((p) => series.some((s) => Number(p[s.key as keyof typeof p]) > 0))
                ? <MkChart data={chartData} series={series} kind="line" height={260} />
                : <PanelEmpty className="py-24">Aucune saisie sur ces jours.</PanelEmpty>}
            </Panel>

            {seesTeam ? (
              <Panel title="Qui n'a pas saisi aujourd'hui" sub={expected ? `${fr(expected - missing.length)} sur ${fr(expected)} ont saisi leurs chiffres du jour.` : "Aucun setter ni closer à suivre dans ce filtre."}>
                {!expected ? <PanelEmpty className="py-8">Invite un setter ou un closer, ou crée-lui un lien de saisie.</PanelEmpty>
                  : missing.length === 0 ? (
                    <p className="flex items-center gap-3 py-2 text-[14px] text-mk-text"><ToneIcon icon={CircleCheck} tone="success" />Tout le monde a saisi aujourd&apos;hui.</p>
                  ) : <MissingList people={missing} sinceOf={sinceOf} />}
                <Link href="/marketing/kpi?onglet=suivi" className={cn(LINK, "mt-3")}>Voir le suivi du jour<ChevronRight className="size-4" aria-hidden /></Link>
              </Panel>
            ) : (
              <Panel className="@min-[1080px]:self-start" title="Ta saisie du jour" sub={`${myDays} jour${myDays > 1 ? "s" : ""} saisi${myDays > 1 ? "s" : ""} ${days === 1 ? "aujourd'hui" : `sur les ${days} derniers jours`}.`}>
                <div className="flex flex-col gap-4">
                  <p className="flex items-center gap-3 text-[14px] text-mk-text">
                    <ToneIcon icon={myToday ? CircleCheck : ClipboardPen} tone={myToday ? "success" : "warn"} />
                    {myToday ? "Tes chiffres du jour sont saisis." : "Tu n'as pas encore saisi tes chiffres du jour."}
                  </p>
                  <Link href="/marketing/kpi?onglet=saisie" className={cn(BTN_PRIMARY, "w-full")}><ClipboardPen strokeWidth={2} />{myToday ? "Modifier mes chiffres du jour" : "Saisir mes chiffres du jour"}</Link>
                </div>
              </Panel>
            )}
          </div>

          {seesTeam ? (
            <Panel className="mt-4" flush title="Classement par personne" sub={`Membres et personnes « par lien » ensemble, ${periodText}. Survole un intitulé pour lire sa règle de calcul.`}>
              <RankingTable rows={ranked} fields={fields} periodDays={days} me={me} />
            </Panel>
          ) : null}
        </>
      )}

      {/* ─── Appels à venir · Prospects ─── */}
      <div className={cn("mt-6 grid gap-4", pros && "@min-[1080px]:grid-cols-3")}>
        <Panel className={cn(pros && "@min-[1080px]:col-span-2")} flush title="Appels à venir"
          sub={`Les ${UPCOMING_DAYS} prochains jours : rendez-vous pris dans l'app et agenda Google${seesTeam ? " de l'équipe" : ""}.`}
          action={up.allowed ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 items-center rounded-full bg-mk-chip px-3 text-[13px] font-medium text-mk-text tabular-nums">{fr(calls.length)} appel{calls.length > 1 ? "s" : ""}</span>
              <Link href="/marketing/calendrier" className={LINK}>Calendrier<ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          ) : null}>
          {!up.allowed ? (
            <PanelEmpty className="border-t border-mk-line py-10">Le Calendrier n&apos;est pas accordé à ton compte : les appels à venir ne peuvent pas s&apos;afficher.</PanelEmpty>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-t border-mk-line px-4 py-12 text-center">
              <ToneIcon icon={CalendarDays} tone="accent" className="size-11" />
              <p className="text-[15px] font-medium text-mk-strong">Aucun appel prévu sur les {UPCOMING_DAYS} prochains jours</p>
              <p className="max-w-[440px] text-[13px] leading-relaxed text-mk-sub">
                Les rendez-vous pris dans l&apos;app et les événements de l&apos;agenda Google qui ont un invité s&apos;affichent ici.
              </p>
              <Link href="/marketing/calendrier" className={LINK}>{g.ready && !g.connected ? "Relier ton agenda Google dans Calendrier" : "Ouvrir le Calendrier"}<ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          ) : (
            <div>{groups.map((d) => <CallDay key={d.day} label={d.label} calls={d.calls} timeOf={timeOf} showMember={seesTeam} />)}</div>
          )}
          {googleLine ? <p className="border-t border-mk-line px-4 py-3 text-[13px] leading-relaxed text-mk-sub lg:px-5">{googleLine}</p> : null}
        </Panel>

        {pros ? (
          <Panel className="@min-[1080px]:self-start" title="Prospects" sub={role ? "Les prospects qui te sont attribués." : "Le pipeline dans l'app."}
            action={<Link href="/marketing/crm" className={LINK}>Ouvrir<ChevronRight className="size-4" aria-hidden /></Link>}>
            <ul className="-my-1">
              <li className="flex min-h-14 items-center gap-3 border-b border-mk-line py-2">
                <ToneIcon icon={Users} tone="accent" />
                <span className="min-w-0 flex-1 text-[14px] text-mk-text">En cours</span>
                <b className="text-[22px] font-semibold text-mk-strong tabular-nums">{fr(pros.open)}</b>
              </li>
              <li className="flex min-h-14 items-center gap-3 py-2" title="Prospects passés à une étape « Gagné » sur la période">
                <ToneIcon icon={BadgeCheck} tone="success" />
                <span className="min-w-0 flex-1 text-[14px] text-mk-text">Signés {days === 1 ? "aujourd'hui" : `sur ${days} jours`}{pros.amount ? <span className="block text-[13px] text-mk-sub">{euro.format(pros.amount)} HT</span> : null}</span>
                <b className="text-[22px] font-semibold text-mk-strong tabular-nums">{fr(pros.signed)}</b>
              </li>
            </ul>
          </Panel>
        ) : null}
      </div>
      <p className="mt-6 px-1 text-[12px] text-mk-sub">{seesTeam
        ? "Sources : suivi quotidien de l'équipe (comptes et liens de saisie) · rendez-vous de l'app · agendas Google reliés"
        : "Sources : ton suivi quotidien · tes rendez-vous de l'app · ton agenda Google s'il est relié"}</p>
    </div>
  );
}
