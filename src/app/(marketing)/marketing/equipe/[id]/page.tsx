import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { crmPage, facts, isAdmin, memberNames, salesRole } from "@/lib/marketing/crm-server";
import { buildKpi, KPI_RULES } from "@/lib/marketing/kpi";
import { lastSignIn, teamLog } from "@/lib/marketing/team";
import { teamForPages } from "@/lib/marketing/team-view";
import { INVITE_ROLE_LABEL, isInviteRole, memberRoleLabel } from "@/lib/marketing/invite-errors";
import { euro } from "@/lib/marketing/ui";
import { moduleLabel } from "@/lib/permissions";
import { KPI_FIELDS, PROSPECT_EVENT, type KpiEntry, type Prospect, type ProspectEvent, type ProspectEventKind, type TeamLogEntry } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { BackLink, BTN_LIGHT, MemberAvatar, Panel, Pill, SubTitle } from "../../reglages/kit";
import { ResendInviteButton } from "../_components/invite-member";

export const metadata: Metadata = { title: "Membre de l'équipe" };
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);

function logLine(e: TeamLogEntry): string {
  const d = e.data ?? {}, role = (v: unknown) => (isInviteRole(v) ? INVITE_ROLE_LABEL[v] : String(v ?? "aucun"));
  const pages = Array.isArray(d.pages) ? d.pages.map((p) => moduleLabel(String(p))).join(", ") : "";
  switch (e.kind) {
    case "invitation": return d.renvoi ? "Invitation renvoyée (nouveau lien)" : `${d.repris ? "Compte repris et invité" : "Invité"} comme ${role(d.role)}${d.role === "responsable" ? " · tout l'espace Marketing" : pages ? ` · pages : ${pages}` : ""}`;
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
  const access = m.kind === "admin" ? "Accès complet à l'espace Marketing et à Studio." : m.manager ? "Tout l'espace Marketing." : m.permissions.map(moduleLabel).join(", ") || "Aucune page.";
  const inTeam = m.kind === "commercial" || !!m.manager, admin = isAdmin(crm.session);

  const roleLabel = memberRoleLabel(m);
  const infos = [m.email, isAdmin(crm.session) ? `Dernière connexion : ${seen ? when(seen) : "inconnue"}` : null, m.created_at > "2000" ? `Membre depuis le ${day(m.created_at)}` : null].filter((v): v is string => !!v);

  return (
    <>
      <BackLink href="/marketing/equipe" label="Équipe" title="Retour à l'équipe" />
      <PageHeader className="mk-keep-title" title={<span className="flex items-center gap-3"><MemberAvatar name={m.name} src={m.avatar} size={44} /><span className="min-w-0 break-words">{m.name}</span></span>}
        actions={<div className="flex flex-wrap items-center gap-2"><Pill tone={m.kind === "admin" ? "accent" : "neutral"}>{roleLabel}</Pill>{m.disabled ? <Pill tone="danger">Accès retiré</Pill> : m.pending ? <Pill tone="warn">Invitation en attente</Pill> : <Pill tone="success">Actif</Pill>}{admin && inTeam && m.pending && !m.disabled && !crm.demo ? <ResendInviteButton member={{ id: m.id, name: m.name }} /> : null}{admin && inTeam ? <Link href="/marketing/reglages/equipe" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>{m.manager ? "Gérer son accès" : "Modifier le rôle et les accès"}</Link> : null}</div>}
        description={<span className="flex flex-wrap gap-x-3 gap-y-1">{infos.map((t, i) => <span key={i}>{i > 0 ? "· " : ""}{t}</span>)}</span>} />
      {/* Téléphone : l'en-tête n'affiche pas de description, les informations du compte passent ici. */}
      {infos.length ? <p className="-mt-1 mb-4 text-[14px] text-mk-sub lg:hidden">{infos.join(" · ")}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {tiles.length ? (
            <Panel title="Ses chiffres" description="30 derniers jours, calculés à partir du CRM.">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {tiles.map(([k, v, rule]) => (
                  <div key={k} className="min-w-0 rounded-[10px] border border-mk-line p-3.5 sm:p-4">
                    <dt className="text-[13px] font-medium text-mk-sub">{k}</dt>
                    <dd className="mt-1 text-[24px] font-semibold leading-8 text-mk-strong tabular-nums sm:text-[28px] sm:leading-9">{v}</dd>
                    <dd className="mt-1 text-[12.5px] leading-snug text-mk-sub">{rule}</dd>
                  </div>
                ))}
              </dl>
              {Object.keys(declared).length ? (
                <div className="mt-5 border-t border-mk-line pt-4">
                  <SubTitle>Suivi quotidien déclaré (30 jours)</SubTitle>
                  <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">{fields.filter((fd) => declared[fd.key]).map((fd) => <div key={fd.key}><dt className="text-[13px] text-mk-sub">{fd.label}</dt><dd className="text-[18px] font-semibold text-mk-strong tabular-nums">{declared[fd.key]}</dd></div>)}</dl>
                </div>
              ) : null}
            </Panel>
          ) : null}
          <Panel flush title="Activité dans le CRM" description="Ses 120 dernières actions : étapes, appels, tâches, notes, emails.">
            {events.length === 0 ? <p className="px-4 py-5 text-[14px] text-mk-sub sm:px-5">Aucune action enregistrée pour l&apos;instant.</p> : (
              <ol>
                {events.map((e) => { const line = eventLine(e); return (
                  <li key={e.id} className="flex flex-col gap-1 border-b border-mk-line px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 sm:flex-row sm:items-baseline sm:gap-4 sm:px-5">
                    <span className="shrink-0 text-[13px] text-mk-sub tabular-nums sm:w-[150px]">{when(e.created_at)}</span>
                    <span className="min-w-0 flex-1 text-[14px] text-mk-text"><span className="font-medium text-mk-strong">{PROSPECT_EVENT[e.kind as ProspectEventKind] ?? e.kind}</span>{line ? <span> · {line}</span> : null}</span>
                    <Link href={`/marketing/crm/${e.prospect_id}`} className="shrink-0 text-[13px] font-medium text-accent-2 hover:underline">{leadName.get(e.prospect_id) ?? "lead"}</Link>
                  </li>
                ); })}
              </ol>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-4 self-start">
          <Panel title="Rôle et accès">
            <dl className="divide-y divide-mk-line text-[14px]">
              <div className="pb-3"><dt className="text-[13px] font-medium text-mk-sub">Rôle</dt><dd className="mt-0.5 font-medium text-mk-strong">{roleLabel}</dd></div>
              <div className="py-3"><dt className="text-[13px] font-medium text-mk-sub">Pages</dt><dd className="mt-0.5 text-mk-text">{access}</dd></div>
              <div className="pt-3"><dt className="text-[13px] font-medium text-mk-sub">Ce qu&apos;il voit</dt><dd className="mt-0.5 text-mk-text">{m.kind !== "commercial" ? "Tout, dans la limite de ses pages." : m.role === "media_buyer" ? "Les chiffres d'acquisition, sans aucune coordonnée." : "Seulement les leads, tâches et rendez-vous qui lui sont attribués."}</dd></div>
            </dl>
            {m.kind === "agence" && !m.manager ? <p className="mt-3 rounded-[8px] bg-surface-2 px-3 py-2 text-[13px] text-mk-sub">Membre de l&apos;agence : ses accès se règlent depuis Studio.</p> : null}
          </Panel>
          <Panel title="Historique du compte" description="Invitation, changements de rôle et d'accès.">
            {log.length === 0 ? <p className="text-[14px] text-mk-sub">Aucun changement enregistré. L&apos;historique commence à la migration 0026.</p> : (
              <ol>
                {log.map((e) => <li key={e.id} className="border-b border-mk-line py-3 first:pt-0 last:border-b-0 last:pb-0"><p className="text-[14px] text-mk-strong">{logLine(e)}</p><p className="mt-0.5 text-[13px] text-mk-sub">{when(e.created_at)} · par {e.actor_id ? names[e.actor_id] ?? "un administrateur" : "le système"}</p></li>)}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
