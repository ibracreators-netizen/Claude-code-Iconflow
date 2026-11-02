import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PROSPECT_STATUS } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusAndNotes, Appointments } from "./prospect-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params; const store = await requireMarketing("marketing_prospects"); const p = await store.prospect(id);
  return { title: p?.name ?? p?.email ?? "Prospect" };
}

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireMarketing("marketing_prospects");
  const prospect = await store.prospect(id);
  if (!prospect) notFound();
  const canCal = canAccess(store.session.profile, "marketing_calendrier");
  const settings = await store.settings();
  const [appointments, slots] = canCal ? await Promise.all([store.appointmentsForProspect(id), store.availableSlots(21)]) : [[], []];

  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux prospects"><Link href="/marketing/prospects" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/prospects" className="hover:text-fg">Prospects</Link></nav>
      <PageHeader title={prospect.name ?? prospect.email ?? "Prospect"}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">{prospect.email ? <span>{prospect.email}</span> : null}{prospect.phone ? <span>· {prospect.phone}</span> : null}{prospect.source ? <span>· {prospect.source}</span> : null}<span>· {PROSPECT_STATUS[prospect.status]}</span></span>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card><CardHeader title="Suivi du prospect" description={`Opt-in ${prospect.opted_in_at ? formatDateTimeInZone(prospect.opted_in_at, settings.timezone) : "non enregistré"}${prospect.unsubscribed_at ? " · désinscrit" : ""}`} /><CardBody><StatusAndNotes id={prospect.id} status={prospect.status} notes={prospect.notes} /></CardBody></Card>
        <Card><CardBody>{canCal ? <Appointments prospectId={prospect.id} appointments={appointments} slots={slots} slotMinutes={settings.slot_minutes} timezone={settings.timezone} /> : <p className="text-[13px] text-muted">Le module Calendrier n&apos;est pas accordé à ton compte.</p>}</CardBody></Card>
      </div>
    </>
  );
}
