import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, emailTemplates, isAdmin, members, salesRole, stagesFor } from "@/lib/marketing/crm-server";
import { isMailerConfigured } from "@/lib/email/mailer";
import type { Contact, MarketingTask, Prospect, ProspectEvent } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { DemoBadge } from "@/components/shared/demo-badge";
import { stageTone } from "@/lib/marketing/ui";
import { Appointments, CallForm, DealForm, FollowForm, TasksPanel } from "./prospect-client";
import { ProspectTimeline } from "./prospect-timeline";
import { EmailComposer, NoteForm } from "../lead-dialogs";
import { ClientProposals } from "../../reglages/automatisations/automations-client";

export const metadata: Metadata = { title: "Fiche lead" };

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crm = await crmPage("marketing_prospects");
  const prospect = await crm.db.get<Prospect>("marketing_prospects", id);
  if (!prospect) notFound();
  const profile = crm.session.profile;
  const canCal = canAccess(profile, "marketing_calendrier"), canTasks = canAccess(profile, "marketing_taches"), canContacts = canAccess(profile, "marketing_contacts");
  const [settings, stages, team, templates, contact, events, tasks] = await Promise.all([
    crm.store.settings(), stagesFor(crm), members(), emailTemplates(),
    prospect.contact_id ? crm.db.get<Contact>("marketing_contacts", prospect.contact_id) : Promise.resolve(null),
    crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["eq", "prospect_id", id]], order: ["created_at", "desc"], limit: 300 }),
    crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "prospect_id", id]], order: ["created_at", "desc"] }),
  ]);
  const external = (settings as { booking_mode?: string }).booking_mode !== "interne";
  const [appointments, slots] = canCal ? await Promise.all([crm.store.appointmentsForProspect(id), external ? Promise.resolve([]) : crm.store.availableSlots(21)]) : [[], []];
  const names = Object.fromEntries(team.map((m) => [m.id, m.name]));
  // Règle 6 : après une signature, l'administrateur valide ici (ou dans Réglages › Automatisations) la création du client dans Studio.
  const [proposal] = isAdmin(crm.session) ? await crm.db.list<{ id: string; created_at: string }>("marketing_client_proposals", { where: [["eq", "prospect_id", id], ["eq", "status", "en_attente"]], limit: 1 }).catch(() => []) : [];
  const stage = stages.find((s) => s.id === prospect.stage_id) ?? null;
  const title = contact?.name ?? prospect.name ?? contact?.email ?? prospect.email ?? "Prospect";
  const origin = ([["Site", prospect.site], ["Page d'entrée", prospect.landing_page], ["Site d'origine", prospect.referrer], ...Object.entries(prospect.utm ?? {})] as Array<[string, string | null | undefined]>).filter(([, v]) => v);

  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour au CRM"><Link href="/marketing/crm" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/crm" className="hover:text-fg">CRM</Link></nav>
      <PageHeader title={title} actions={<div className="flex items-center gap-2">{crm.demo ? <DemoBadge /> : null}<Badge tone={stageTone(stage)}>{stage?.name ?? "Sans étape"}</Badge></div>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {contact?.email ?? prospect.email ? <span>{contact?.email ?? prospect.email}</span> : null}
          {contact?.phone ?? prospect.phone ? <span>· {contact?.phone ?? prospect.phone}</span> : null}
          {contact?.company ?? prospect.marque ? <span>· {contact?.company ?? prospect.marque}</span> : null}
          {prospect.source ? <span>· {prospect.source}</span> : null}
          {contact && canContacts ? <Link href={`/marketing/crm/contacts/${contact.id}`} className="text-accent-2 hover:underline">Voir la fiche contact</Link> : null}
        </span>} />

      {proposal ? <div className="mb-4"><ClientProposals rows={[{ id: proposal.id, prospectId: id, name: (contact?.company ?? contact?.name ?? prospect.name ?? "").trim() || null, email: contact?.email ?? prospect.email ?? null, amount: prospect.signed_amount ?? null, when: formatDateTimeInZone(proposal.created_at, settings.timezone) }]} /></div> : null}
      <Card className="mb-4">
        <CardHeader title="Provenance" description="Page d'entrée et paramètres de campagne relevés à l'arrivée du lead." />
        <CardBody>
          {origin.length ? (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {origin.map(([cle, valeur]) => (<div key={cle} className="min-w-0 max-w-full"><dt className="text-[11.5px] uppercase tracking-wide text-muted">{cle}</dt><dd className="break-words text-[13.5px]">{valeur}</dd></div>))}
            </dl>
          ) : <p className="text-[13px] text-muted">Aucune page d&apos;entrée ni paramètre de campagne : ce prospect n&apos;est pas arrivé par un formulaire suivi.</p>}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card><CardHeader title="Affaire" description="Étape du pipeline, valeur et responsables." /><CardBody><DealForm prospect={prospect} stages={stages} members={team} canAssign={!salesRole(crm.session)} /></CardBody></Card>
          <Card><CardHeader title="Appel" description="Résultat, issue et montant signé. Saisis par le closer, ou reçus de l'outil de réservation." /><CardBody><CallForm prospect={prospect} /></CardBody></Card>
          <Card><CardHeader title="Suivi et qualification" description={`Opt-in ${prospect.opted_in_at ? formatDateTimeInZone(prospect.opted_in_at, settings.timezone) : "non enregistré"}${prospect.unsubscribed_at ? " · désinscrit" : ""}`} /><CardBody><FollowForm prospect={prospect} /></CardBody></Card>
          <Card id="email"><CardHeader title="Écrire au lead" description="L'email part à ton nom et s'ajoute à l'historique. Les réponses arrivent dans ta boîte mail." /><CardBody>
            <EmailComposer lead={{ id: prospect.id, name: title, email: contact?.email ?? prospect.email ?? null, company: contact?.company ?? prospect.marque ?? null, setter_id: prospect.setter_id ?? null, closer_id: prospect.closer_id ?? null, unsubscribed: !!prospect.unsubscribed_at }}
              mail={{ templates, mailReady: !crm.demo && isMailerConfigured(), canEditTemplates: isAdmin(crm.session), myName: profile.display_name ?? null }} />
          </CardBody></Card>
          <Card><CardHeader title="Historique" description="Chaque changement, email et note, avec sa date et son auteur." /><CardBody><div className="mb-5"><NoteForm prospectId={prospect.id} /></div><ProspectTimeline events={events} timezone={settings.timezone} names={names} /></CardBody></Card>
        </div>
        <div className="space-y-4 self-start">
          {canTasks ? <Card><CardBody><TasksPanel prospectId={prospect.id} tasks={tasks} members={team} me={crm.session.user.id} timezone={settings.timezone} today={new Date().toISOString().slice(0, 10)} /></CardBody></Card> : null}
          <Card><CardBody>{canCal ? <Appointments prospectId={prospect.id} appointments={appointments} slots={slots} slotMinutes={settings.slot_minutes} timezone={settings.timezone} canBook={!external} /> : <p className="text-[13px] text-muted">Le module Calendrier n&apos;est pas accordé à ton compte.</p>}</CardBody></Card>
        </div>
      </div>
    </>
  );
}
