import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, facts, isAdmin, members, salesRole, stagesFor } from "@/lib/marketing/crm-server";
import { buildFunnel } from "@/lib/marketing/funnel";
import { partsInZone } from "@/lib/marketing/slots";
import { euro, stageTone } from "@/lib/marketing/ui";
import { CALL_RESULT, MARKETING_ROLE, TASK_KIND, type Appointment, type Contact, type MarketingTask, type Prospect } from "@/lib/marketing/types";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { DoneButton, MemberPicker } from "./espace-client";

export const metadata: Metadata = { title: "Mon espace" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] text-muted">{children}</p>;
const Row = ({ href, title, sub, right }: { href: string; title: string; sub?: string | null; right?: React.ReactNode }) => (
  <li className="flex items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><Link href={href} className="block truncate text-[13.5px] font-medium hover:underline">{title}</Link>{sub ? <span className="block truncate text-[12.5px] text-muted">{sub}</span> : null}</div>{right}</li>
);

export default async function EspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_espace");
  const admin = isAdmin(crm.session), myRole = salesRole(crm.session);
  const [team, settings] = await Promise.all([members(), crm.store.settings()]);
  const tz = settings.timezone, now = new Date();
  const who = admin && team.some((m) => m.id === one(sp.membre)) ? one(sp.membre) : crm.session.user.id;
  const viewed = team.find((m) => m.id === who);
  const role = admin ? viewed?.marketing_role ?? null : myRole;

  // ── Media buyer : des chiffres, jamais de coordonnées ──
  if (role === "media_buyer") {
    const f = await facts(crm);
    const from = new Date(now.getTime() - 30 * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
    const funnel = buildFunnel({ prospects: f.prospects, appointments: f.appointments, insights: f.insights, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to, by: "campaign" });
    const t = funnel.total;
    return (
      <>
        <PageHeader eyebrow="IconFlow Marketing" title="Mon espace" description="Les 30 derniers jours, en chiffres. Aucune coordonnée de contact n'est affichée dans ton espace."
          actions={<div className="flex items-center gap-3">{crm.demo ? <DemoBadge /> : null}{admin ? <MemberPicker members={team.map((m) => ({ id: m.id, name: m.name, role: m.marketing_role ? MARKETING_ROLE[m.marketing_role] : "" }))} value={who} /> : null}</div>} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Leads" value={t.leads} hint="30 derniers jours" />
          <Stat label="Rendez-vous pris" value={t.booked} hint={t.leads ? `${Math.round((t.booked / t.leads) * 100)} % des leads` : "aucun lead"} />
          <Stat label="Dépense Meta Ads" value={t.spend === null ? "non connecté" : euro.format(t.spend)} hint={t.spend === null ? "compte de l'agence à choisir" : "toutes campagnes"} />
          <Stat label="Coût par lead" value={t.costPerLead === null ? "—" : euro.format(t.costPerLead)} hint={t.costPerBooking === null ? "coût par rendez-vous : —" : `coût par rendez-vous : ${euro.format(t.costPerBooking)}`} />
        </div>
        <p className="mt-5 text-[13.5px]"><Link href="/marketing/publicite" className="text-accent-2 hover:underline">Voir le détail par campagne et par page d&apos;entrée</Link></p>
      </>
    );
  }

  // ── Setter et closer : ce qui m'est attribué (la base ne renvoie rien d'autre à un commercial) ──
  const [prospects, contacts, tasks, appts, stages] = await Promise.all([
    crm.db.list<Prospect>("marketing_prospects"), crm.db.list<Contact>("marketing_contacts"),
    crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "status", "ouverte"]] }),
    crm.db.list<Appointment>("marketing_appointments", { where: [["gte", "starts_at", new Date(now.getTime() - 30 * 86_400_000).toISOString()]], order: ["starts_at", "asc"] }).catch(() => [] as Appointment[]),
    stagesFor(crm),
  ]);
  const contact = new Map(contacts.map((c) => [c.id, c])), prospect = new Map(prospects.map((p) => [p.id, p]));
  const label = (p: Prospect | undefined) => { const c = p?.contact_id ? contact.get(p.contact_id) : null; return c?.name ?? p?.name ?? c?.email ?? p?.email ?? "Prospect"; };
  const phone = (p: Prospect | undefined) => (p?.contact_id ? contact.get(p.contact_id)?.phone : null) ?? p?.phone ?? null;
  const closed = new Set(stages.filter((s) => s.kind !== "ouvert").map((s) => s.id));
  const today = partsInZone(now, tz), sameDay = (iso: string) => { const d = partsInZone(new Date(iso), tz); return d.y === today.y && d.mo === today.mo && d.d === today.d; };
  const todayKey = `${today.y}-${String(today.mo).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
  const dayKey = (iso: string) => { const d = partsInZone(new Date(iso), tz); return `${d.y}-${String(d.mo).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; };
  const when = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  const showSetter = role === "setter" || role === null, showCloser = role === "closer" || role === null;

  const toCall = tasks.filter((t) => t.kind === "a_appeler" && t.assignee_id === who).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const followTasks = tasks.filter((t) => t.kind === "relance" && t.assignee_id === who && (!t.due_at || dayKey(t.due_at) <= todayKey));
  const followProspects = prospects.filter((p) => p.setter_id === who && p.next_action_at && dayKey(p.next_action_at) <= todayKey && !(p.stage_id && closed.has(p.stage_id)));
  const booked = appts.filter((a) => a.setter_id === who || prospect.get(a.prospect_id)?.setter_id === who).filter((a) => Date.parse(a.starts_at) >= now.getTime() - 14 * 86_400_000).reverse();
  const mineAsCloser = (a: Appointment) => a.closer_id === who || prospect.get(a.prospect_id)?.closer_id === who;
  const callsToday = appts.filter((a) => a.status === "confirme" && mineAsCloser(a) && sameDay(a.starts_at));
  const toFill = appts.filter((a) => a.status === "confirme" && mineAsCloser(a) && Date.parse(a.ends_at) < now.getTime() && (a.result ?? "a_venir") === "a_venir").reverse();
  const signed = prospects.filter((p) => p.closer_id === who && p.outcome === "signe").sort((a, b) => (b.stage_changed_at ?? b.updated_at).localeCompare(a.stage_changed_at ?? a.updated_at));
  const monthStart = `${today.y}-${String(today.mo).padStart(2, "0")}-01`;
  const signedMonth = signed.filter((p) => dayKey(p.stage_changed_at ?? p.updated_at) >= monthStart);

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title={admin && who !== crm.session.user.id ? `Espace de ${viewed?.name ?? "ce membre"}` : "Mon espace"}
        description={role === "setter" ? "Tes tâches « À appeler », tes relances du jour et les rendez-vous que tu as pris." : role === "closer" ? "Tes appels du jour, les résultats à saisir et tes signatures." : "Ce qui t'est attribué : appels à passer, relances, rendez-vous, résultats à saisir."}
        actions={<div className="flex items-center gap-3">{crm.demo ? <DemoBadge /> : null}{admin ? <MemberPicker members={team.map((m) => ({ id: m.id, name: m.name, role: m.marketing_role ? MARKETING_ROLE[m.marketing_role] : "" }))} value={who} /> : null}</div>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {showSetter ? (<>
          <Card>
            <CardHeader title="À appeler" description={`${toCall.length} tâche${toCall.length > 1 ? "s" : ""} à faire`} />
            <CardBody>{toCall.length === 0 ? <Empty>Aucun appel à passer.</Empty> : (
              <ul className="divide-y divide-border">{toCall.slice(0, 30).map((t) => { const p = t.prospect_id ? prospect.get(t.prospect_id) : undefined; const late = !!t.due_at && dayKey(t.due_at) < todayKey; return (
                <Row key={t.id} href={t.prospect_id ? `/marketing/crm/${t.prospect_id}` : "/marketing/taches"} title={label(p)} sub={[phone(p), t.due_at ? dayFmt.format(new Date(t.due_at)) : "sans échéance", t.note].filter(Boolean).join(" · ")}
                  right={<>{late ? <Badge tone="warning">En retard</Badge> : null}{who === crm.session.user.id || admin ? <DoneButton id={t.id} title={`${TASK_KIND[t.kind]} ${label(p)}`} /> : null}</>} />); })}</ul>)}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Relances du jour" description={`${followTasks.length + followProspects.length} à faire aujourd'hui ou en retard`} />
            <CardBody>{followTasks.length + followProspects.length === 0 ? <Empty>Aucune relance prévue aujourd&apos;hui.</Empty> : (
              <ul className="divide-y divide-border">
                {followTasks.map((t) => { const p = t.prospect_id ? prospect.get(t.prospect_id) : undefined; return <Row key={t.id} href={t.prospect_id ? `/marketing/crm/${t.prospect_id}` : "/marketing/taches"} title={label(p)} sub={[t.title, phone(p)].filter(Boolean).join(" · ")} right={<DoneButton id={t.id} title={t.title} />} />; })}
                {followProspects.map((p) => <Row key={p.id} href={`/marketing/crm/${p.id}`} title={label(p)} sub={[p.next_action_note ?? "Prochaine action", phone(p), p.next_action_at ? dayFmt.format(new Date(p.next_action_at)) : null].filter(Boolean).join(" · ")} />)}
              </ul>)}</CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Rendez-vous que j'ai pris" description="Les 14 derniers jours et ceux à venir." />
            <CardBody>{booked.length === 0 ? <Empty>Aucun rendez-vous sur cette période.</Empty> : (
              <ul className="divide-y divide-border">{booked.slice(0, 30).map((a) => <Row key={a.id} href={`/marketing/crm/${a.prospect_id}`} title={label(prospect.get(a.prospect_id))} sub={[when.format(new Date(a.starts_at)), a.title].filter(Boolean).join(" · ")}
                right={<Badge tone={a.status === "annule" ? "danger" : a.result === "present" ? "success" : a.result === "absent" ? "warning" : "neutral"}>{a.status === "annule" ? "Annulé" : CALL_RESULT[a.result ?? "a_venir"]}</Badge>} />)}</ul>)}</CardBody>
          </Card>
        </>) : null}
        {showCloser ? (<>
          <Card>
            <CardHeader title="Mes appels du jour" description={`${callsToday.length} appel${callsToday.length > 1 ? "s" : ""} aujourd'hui`} />
            <CardBody>{callsToday.length === 0 ? <Empty>Aucun appel aujourd&apos;hui.</Empty> : (
              <ul className="divide-y divide-border">{callsToday.map((a) => <Row key={a.id} href={`/marketing/crm/${a.prospect_id}`} title={label(prospect.get(a.prospect_id))} sub={[when.format(new Date(a.starts_at)), a.title, phone(prospect.get(a.prospect_id))].filter(Boolean).join(" · ")}
                right={a.meeting_url ? <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-accent-2 hover:underline">Lien de l&apos;appel</a> : null} />)}</ul>)}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Résultats à saisir" description={`${toFill.length} appel${toFill.length > 1 ? "s passés" : " passé"} sans résultat`} />
            <CardBody>{toFill.length === 0 ? <Empty>Tous les résultats sont saisis.</Empty> : (
              <ul className="divide-y divide-border">{toFill.slice(0, 30).map((a) => <Row key={a.id} href={`/marketing/crm/${a.prospect_id}`} title={label(prospect.get(a.prospect_id))} sub={when.format(new Date(a.starts_at))} right={<Badge tone="warning">À saisir</Badge>} />)}</ul>)}</CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Mes signatures" description={`Ce mois-ci : ${signedMonth.length} signature${signedMonth.length > 1 ? "s" : ""}, ${euro.format(signedMonth.reduce((s, p) => s + (p.signed_amount ?? 0), 0))} HT`} />
            <CardBody>{signed.length === 0 ? <Empty>Aucune signature enregistrée pour l&apos;instant.</Empty> : (
              <ul className="divide-y divide-border">{signed.slice(0, 15).map((p) => { const st = stages.find((s) => s.id === p.stage_id); return <Row key={p.id} href={`/marketing/crm/${p.id}`} title={label(p)} sub={dayFmt.format(new Date(p.stage_changed_at ?? p.updated_at))}
                right={<><span className="text-[13px] font-medium tabular">{p.signed_amount != null ? `${euro.format(p.signed_amount)} HT` : "montant à saisir"}</span><Badge tone={stageTone(st)}>{st?.name ?? "Sans étape"}</Badge></>} />; })}</ul>)}</CardBody>
          </Card>
        </>) : null}
      </div>
    </>
  );
}
