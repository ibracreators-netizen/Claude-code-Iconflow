import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, facts, isAdmin, memberNames, salesRole } from "@/lib/marketing/crm-server";
import { buildKpi, KPI_RULES } from "@/lib/marketing/kpi";
import { lastSignIn, SALES_ROLE_LABEL, teamLog } from "@/lib/marketing/team";
import { KIND_LABEL, teamForPages } from "@/lib/marketing/team-view";
import { euro } from "@/lib/marketing/ui";
import { moduleLabel } from "@/lib/permissions";
import { KPI_FIELDS, PROSPECT_EVENT, type KpiEntry, type Prospect, type ProspectEvent, type ProspectEventKind, type TeamLogEntry } from "@/lib/marketing/types";
import { PageHeader } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

export const metadata: Metadata = { title: "Membre de l'équipe" };
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);

function logLine(e: TeamLogEntry): string {
  const d = e.data ?? {}, role = (v: unknown) => SALES_ROLE_LABEL[v as keyof typeof SALES_ROLE_LABEL] ?? String(v ?? "aucun");
  const pages = Array.isArray(d.pages) ? d.pages.map((p) => moduleLabel(String(p))).join(", ") : "";
  switch (e.kind) {
    case "invitation": return `Invité comme ${role(d.role)}${pages ? ` · pages : ${pages}` : ""}`;
    case "role": return `Rôle : ${role(d.de)} → ${role(d.vers)}`;
    case "acces": return `Pages accordées : ${pages || "aucune"}`;
    case "acces_retire": return "Accès retiré";
    case "acces_retabli": return "Accès rétabli";
  }
}
function eventLine(e: ProspectEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>, s = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (e.kind) {
    case "etape": return `${s(d.de) ?? "Sans étape"} → ${s(d.vers) ?? "?"}`;
    case "email": return [s(d.sujet), d.statut === "simule" ? "simulé" : null].filter(Boolean).join(" · ");
    case "note": return s(d.excerpt) ?? "";
    case "tache_creee": case "tache_faite": case "tache_annulee": return s(d.tache) ?? "";
    case "attribution": return `${d.role === "closer" ? "Closer" : "Setter"} : ${s(d.nom) ?? "personne"}`;
    case "appel": return [s(d.resultat), s(d.issue), typeof d.montant_signe_ht === "number" ? `${euro.format(d.montant_signe_ht)} HT` : null].filter(Boolean).join(" · ");
    default: return "";
  }
}

export default async function MembrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crm = await crmPage("marketing_equipe");
  if (salesRole(crm.session)) redirect("/marketing/taches");
  const team = await teamForPages();
  const m = team.find((x) => x.id === id);
  if (!m) notFound();
  const now = new Date(), from = new Date(now.getTime() - 30 * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const [f, log, seen, events, entries, settings, names] = await Promise.all([
    facts(crm, { tasks: true }), teamLog(id), lastSignIn(id),
    crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["eq", "created_by", id]], order: ["created_at", "desc"], limit: 120 }).catch(() => [] as ProspectEvent[]),
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["eq", "profile_id", id], ["gte", "day", from.slice(0, 10)]], order: ["day", "desc"], limit: 60 }).catch(() => [] as KpiEntry[]),
    crm.store.settings(), memberNames(),
  ]);
  const leadIds = [...new Set(events.map((e) => e.prospect_id))];
  const leads = leadIds.length ? await crm.db.list<Prospect>("marketing_prospects", { where: [["in", "id", leadIds]] }).catch(() => [] as Prospect[]) : [];
  const leadName = new Map(leads.map((p) => [p.id, p.name ?? p.email ?? "lead"]));
  const kpi = buildKpi({ prospects: f.prospects, appointments: f.appointments, tasks: f.tasks, entries, members: team.map((x) => ({ id: x.id, name: x.name, marketing_role: x.role })), wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to });
  const s = kpi.setters.find((x) => x.id === id), c = kpi.closers.find((x) => x.id === id);
  const closed = new Set(f.stages.filter((x) => x.kind !== "ouvert").map((x) => x.id));
  const openLeads = f.prospects.filter((p) => (p.setter_id === id || p.closer_id === id) && !(p.stage_id && closed.has(p.stage_id))).length;
  const when = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(new Date(iso));
  const day = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: settings.timezone }).format(new Date(iso));
  const asCloser = m.role === "closer" || (!m.role && !!c && c.held > 0);
  const tiles: Array<[string, string, string]> = m.role === "media_buyer" ? [] : asCloser
    ? [["Leads en cours", String(openLeads), "Leads attribués, hors Gagné et Perdu."], ["Appels tenus", String(c?.held ?? 0), KPI_RULES.held], ["Taux de présence", pct(c?.showRate ?? null), KPI_RULES.showRate], ["Signatures", String(c?.signed ?? 0), KPI_RULES.signed], ["Taux de closing", pct(c?.closeRate ?? null), KPI_RULES.closeRate], ["Montant signé HT", euro.format(c?.amount ?? 0), KPI_RULES.amount]]
    : [["Leads en cours", String(openLeads), "Leads attribués, hors Gagné et Perdu."], ["Leads reçus", String(s?.assigned ?? 0), KPI_RULES.assigned], ["Leads traités", String(s?.handled ?? 0), KPI_RULES.handled], ["RDV pris", String(s?.booked ?? 0), KPI_RULES.booked], ["Taux de prise de RDV", pct(s?.bookingRate ?? null), KPI_RULES.bookingRate], ["Taux de présence", pct(s?.showRate ?? null), KPI_RULES.showRate]];
  const fields = m.role === "closer" ? KPI_FIELDS.closer : KPI_FIELDS.setter;
  const declared = (asCloser ? c?.declared : s?.declared) ?? {};
  const access = m.kind === "admin" ? "Accès complet à l'espace Marketing et à Studio." : m.permissions.map(moduleLabel).join(", ") || "Aucune page.";

  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour à l'équipe"><Link href="/marketing/equipe" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/equipe" className="hover:text-fg">Équipe</Link></nav>
      <PageHeader title={<span className="flex items-center gap-3"><Avatar name={m.name} src={m.avatar ?? undefined} size={44} />{m.name}</span>}
        actions={<div className="flex items-center gap-2"><Badge tone={m.kind === "admin" ? "accent" : "neutral"}>{m.role ? SALES_ROLE_LABEL[m.role] : KIND_LABEL[m.kind]}</Badge>{m.disabled ? <Badge tone="danger">Accès retiré</Badge> : <Badge tone="success">Actif</Badge>}{isAdmin(crm.session) && m.kind === "commercial" ? <Link href="/marketing/reglages/equipe" className={buttonVariants({ variant: "secondary", size: "sm" })}>Modifier le rôle et les accès</Link> : null}</div>}
        description={<span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">{m.email ? <span>{m.email}</span> : null}{isAdmin(crm.session) ? <span>· Dernière connexion : {seen ? when(seen) : "inconnue"}</span> : null}{m.created_at > "2000" ? <span>· Membre depuis le {day(m.created_at)}</span> : null}</span>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {tiles.length ? (
            <Card><CardHeader title="Ses chiffres" description="30 derniers jours, calculés à partir du CRM." /><CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
                {tiles.map(([k, v, rule]) => <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="text-[22px] font-semibold tabular leading-tight">{v}</dd><dd className="mt-1 text-[11px] leading-snug text-muted-2">{rule}</dd></div>)}
              </dl>
              {Object.keys(declared).length ? (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 text-[12px] text-muted">Suivi quotidien déclaré (30 jours)</p>
                  <dl className="flex flex-wrap gap-x-6 gap-y-2">{fields.filter((fd) => declared[fd.key]).map((fd) => <div key={fd.key}><dt className="text-[11.5px] text-muted">{fd.label}</dt><dd className="text-[15px] font-semibold tabular">{declared[fd.key]}</dd></div>)}</dl>
                </div>
              ) : null}
            </CardBody></Card>
          ) : null}
          <Card><CardHeader title="Activité dans le CRM" description="Ses 120 dernières actions : étapes, appels, tâches, notes, emails." /><CardBody>
            {events.length === 0 ? <p className="text-[13px] text-muted">Aucune action enregistrée pour l&apos;instant.</p> : (
              <ol className="divide-y divide-border">
                {events.map((e) => { const line = eventLine(e); return (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-[132px] shrink-0 text-[12px] text-muted tabular">{when(e.created_at)}</span>
                    <span className="min-w-0 flex-1 text-[13.5px]"><span className="font-medium">{PROSPECT_EVENT[e.kind as ProspectEventKind] ?? e.kind}</span>{line ? <span className="text-fg-2"> · {line}</span> : null}</span>
                    <Link href={`/marketing/crm/${e.prospect_id}`} className="shrink-0 text-[12.5px] text-accent-2 hover:underline">{leadName.get(e.prospect_id) ?? "lead"}</Link>
                  </li>
                ); })}
              </ol>
            )}
          </CardBody></Card>
        </div>
        <div className="space-y-4 self-start">
          <Card><CardHeader title="Rôle et accès" /><CardBody>
            <dl className="space-y-3 text-[13.5px]">
              <div><dt className="text-[12px] text-muted">Rôle</dt><dd>{m.role ? SALES_ROLE_LABEL[m.role] : KIND_LABEL[m.kind]}</dd></div>
              <div><dt className="text-[12px] text-muted">Pages</dt><dd className="text-fg-2">{access}</dd></div>
              <div><dt className="text-[12px] text-muted">Ce qu&apos;il voit</dt><dd className="text-fg-2">{m.kind !== "commercial" ? "Tout, dans la limite de ses pages." : m.role === "media_buyer" ? "Les chiffres d'acquisition, sans aucune coordonnée." : "Seulement les leads, tâches et rendez-vous qui lui sont attribués."}</dd></div>
              {m.kind !== "commercial" ? <div className="text-[12.5px] text-muted">Ce compte se gère dans Studio › Équipe &amp; accès.</div> : null}
            </dl>
          </CardBody></Card>
          <Card><CardHeader title="Historique du compte" description="Invitation, changements de rôle et d'accès." /><CardBody>
            {log.length === 0 ? <p className="text-[13px] text-muted">Aucun changement enregistré. L&apos;historique commence à la migration 0026.</p> : (
              <ol className="space-y-3">
                {log.map((e) => <li key={e.id}><p className="text-[13.5px]">{logLine(e)}</p><p className="text-[11.5px] text-muted-2">{when(e.created_at)} · par {e.actor_id ? names[e.actor_id] ?? "un administrateur" : "le système"}</p></li>)}
              </ol>
            )}
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}
