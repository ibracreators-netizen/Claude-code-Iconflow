import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { CancelAppt } from "./calendrier-client";

export const metadata: Metadata = { title: "Calendrier" };

export default async function CalendrierPage() {
  const store = await requireMarketing("marketing_calendrier");
  const now = new Date();
  const [settings, appts, prospects] = await Promise.all([store.settings(), store.appointments({ from: now.toISOString() }), store.prospects()]);
  const name = Object.fromEntries(prospects.map((p) => [p.id, p.name ?? p.email ?? "Prospect"]));
  const upcoming = appts.filter((a) => a.status === "confirme");
  const slotCount = settings.availability.length && settings.slot_minutes ? (await store.availableSlots(14)).length : 0;

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Calendrier" description="Les rendez-vous confirmés à venir. Les créneaux sont calculés dans le fuseau configuré et stockés en UTC." actions={store.demo ? <DemoBadge /> : undefined} />
      {settings.availability.length === 0 || !settings.slot_minutes ? (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">Aucune disponibilité configurée : aucun créneau n&apos;est proposé. <Link href="/marketing/reglages" className="underline">Configurer les réglages</Link>.</p>
      ) : <p className="mb-4 text-[12.5px] text-muted">{slotCount} créneau{slotCount > 1 ? "x" : ""} libre{slotCount > 1 ? "s" : ""} sur 14 jours · fuseau {settings.timezone}</p>}

      <Card>
        <CardHeader title="Rendez-vous à venir" description={`${upcoming.length} confirmé${upcoming.length > 1 ? "s" : ""}`} />
        {upcoming.length === 0 ? <CardBody><EmptyState compact icon={CalendarDays} title="Aucun rendez-vous à venir" description="Réserve depuis la fiche d'un prospect, ou ouvre la réservation en ligne dans les réglages." /></CardBody> : (
          <ul className="divide-y divide-border px-4 pb-2">
            {upcoming.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3 text-[13.5px]">
                <span className="w-56 shrink-0 font-medium">{formatDateTimeInZone(a.starts_at, settings.timezone)}</span>
                <Link href={`/marketing/prospects/${a.prospect_id}`} className="min-w-0 flex-1 truncate text-fg-2 hover:text-accent-2">{name[a.prospect_id] ?? "Prospect"}</Link>
                {a.meeting_url ? <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="hidden text-[12.5px] text-accent-2 hover:underline sm:block">Lien visio</a> : null}
                <CancelAppt id={a.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
