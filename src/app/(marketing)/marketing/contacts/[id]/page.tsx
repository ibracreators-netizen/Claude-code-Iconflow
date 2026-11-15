import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, members, stagesFor } from "@/lib/marketing/crm-server";
import type { Contact, Prospect, ProspectEvent } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { DemoBadge } from "@/components/shared/demo-badge";
import { stageTone, euro } from "@/lib/marketing/ui";
import { ProspectTimeline } from "../../prospects/[id]/prospect-timeline";
import { ContactForm } from "../contacts-client";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crm = await crmPage("marketing_contacts");
  const contact = await crm.db.get<Contact>("marketing_contacts", id);
  if (!contact) notFound();
  const [settings, stages, team, prospects] = await Promise.all([crm.store.settings(), stagesFor(crm), members(), crm.db.list<Prospect>("marketing_prospects", { where: [["eq", "contact_id", id]], order: ["created_at", "desc"] })]);
  const events = prospects.length ? await crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["in", "prospect_id", prospects.map((p) => p.id)]], order: ["created_at", "desc"], limit: 200 }) : [];
  const names = Object.fromEntries(team.map((m) => [m.id, m.name]));
  const canProspects = canAccess(crm.session.profile, "marketing_prospects");
  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux contacts"><Link href="/marketing/contacts" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/contacts" className="hover:text-fg">Contacts</Link></nav>
      <PageHeader title={contact.name ?? contact.email ?? contact.phone ?? "Contact"} actions={crm.demo ? <DemoBadge /> : null}
        description={`Dernière activité : ${contact.last_activity_at ? formatDateTimeInZone(contact.last_activity_at, settings.timezone) : "aucune"}${contact.source ? ` · source : ${contact.source}` : ""}`} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="self-start"><CardHeader title="Fiche" description="Une modification ici se répercute sur les affaires de ce contact." /><CardBody><ContactForm contact={contact} /></CardBody></Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Affaires" description="Les prospects rattachés à ce contact." />
            <CardBody>
              {prospects.length === 0 ? <p className="text-[13px] text-muted">Aucune affaire pour ce contact.</p> : (
                <ul className="space-y-2">
                  {prospects.map((p) => {
                    const stage = stages.find((s) => s.id === p.stage_id) ?? null, amount = p.signed_amount ?? p.value;
                    const row = <><span className="min-w-0 flex-1 truncate">{p.title ?? p.source ?? "Affaire"}<span className="ml-2 text-[12px] text-muted">{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: settings.timezone }).format(new Date(p.created_at))}</span></span>{amount != null ? <span className="tabular text-fg-2">{euro.format(amount)}</span> : null}<Badge tone={stageTone(stage)}>{stage?.name ?? "Sans étape"}</Badge></>;
                    return <li key={p.id}>{canProspects ? <Link href={`/marketing/prospects/${p.id}`} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] transition hover:bg-surface-3">{row}</Link> : <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">{row}</div>}</li>;
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card><CardHeader title="Activité" description="Tout ce qui s'est passé sur les affaires de ce contact." /><CardBody><ProspectTimeline events={events} timezone={settings.timezone} names={names} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
