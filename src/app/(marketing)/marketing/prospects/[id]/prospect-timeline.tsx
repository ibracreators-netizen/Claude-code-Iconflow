import { CalendarPlus, CalendarX, CheckCircle2, Clock, MessageSquare, Sparkles, Target, UserPlus, type LucideIcon } from "lucide-react";
import { PROSPECT_EVENT, PROSPECT_STATUS, type ProspectEvent, type ProspectEventKind, type ProspectStatus } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";

const ICON: Record<string, LucideIcon> = {
  cree: UserPlus, opt_in: Sparkles, statut: CheckCircle2, note: MessageSquare, qualification: Target,
  prochaine_action: Clock, rdv_pris: CalendarPlus, rdv_annule: CalendarX, relance_programmee: Clock,
};
const label = (s: unknown) => PROSPECT_STATUS[s as ProspectStatus] ?? String(s ?? "?");

function describe(e: ProspectEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  switch (e.kind) {
    case "statut": return `${label(d.from)} → ${label(d.to)}`;
    case "note": return typeof d.excerpt === "string" ? d.excerpt : "";
    case "qualification": return [d.besoin, d.budget].filter(Boolean).join(" · ");
    case "prochaine_action": return typeof d.note === "string" ? d.note : "";
    case "opt_in": return [d.marque, d.source].filter(Boolean).join(" · ");
    case "cree": return typeof d.source === "string" ? `Source : ${d.source}` : "";
    default: return "";
  }
}

/** Chronologie horodatée d'un prospect (lecture seule). Rendue côté serveur. */
export function ProspectTimeline({ events, timezone }: { events: ProspectEvent[]; timezone: string }) {
  if (!events.length) return <p className="text-[13px] text-muted">Aucun événement pour l&apos;instant. L&apos;opt-in, les changements de statut, les notes et les rendez-vous apparaîtront ici.</p>;
  return (
    <ol>
      {events.map((e, i) => {
        const Icon = ICON[e.kind] ?? Clock;
        const detail = describe(e);
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-18px)] w-px bg-border" aria-hidden /> : null}
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"><Icon className="size-3.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{PROSPECT_EVENT[e.kind as ProspectEventKind] ?? e.kind}</p>
              {detail ? <p className="truncate text-[12.5px] text-muted">{detail}</p> : null}
              <p className="text-[11.5px] text-muted-2">{formatDateTimeInZone(e.created_at, timezone)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
