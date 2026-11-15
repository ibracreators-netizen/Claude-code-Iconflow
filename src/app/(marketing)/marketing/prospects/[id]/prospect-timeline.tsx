import { CalendarPlus, CalendarX, CheckCircle2, Clock, Download, Euro, ListChecks, MessageSquare, Phone, Plug, Sparkles, Target, UserCheck, UserPlus, Workflow, Zap, type LucideIcon } from "lucide-react";
import { CALL_RESULT, OUTCOME, PROSPECT_EVENT, PROSPECT_STATUS, type CallResult, type Outcome, type ProspectEvent, type ProspectEventKind, type ProspectStatus } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";

const ICON: Record<string, LucideIcon> = {
  cree: UserPlus, opt_in: Sparkles, statut: CheckCircle2, etape: Workflow, note: MessageSquare, qualification: Target,
  prochaine_action: Clock, rdv_pris: CalendarPlus, rdv_annule: CalendarX, relance_programmee: Clock,
  attribution: UserCheck, appel: Phone, valeur: Euro, tache_creee: ListChecks, tache_faite: CheckCircle2, tache_annulee: ListChecks,
  contact_modifie: UserCheck, import: Download, source: Plug, automatisation: Zap, migration_etape: Workflow,
};
const label = (s: unknown) => PROSPECT_STATUS[s as ProspectStatus] ?? String(s ?? "?");
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function describe(e: ProspectEvent): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  switch (e.kind) {
    case "statut": return `${label(d.from)} → ${label(d.to)}`;
    case "etape": return `${str(d.de) ?? "Sans étape"} → ${str(d.vers) ?? "?"}`;
    case "migration_etape": return `Ancien statut : ${label(d.ancien_statut)}`;
    case "attribution": return `${d.role === "closer" ? "Closer" : "Setter"} : ${str(d.nom) ?? (d.membre ? "membre" : "personne")}${str(d.avant) ? ` (avant : ${d.avant})` : ""}`;
    case "appel": return [d.resultat ? CALL_RESULT[d.resultat as CallResult] : null, d.issue ? OUTCOME[d.issue as Outcome] : null, typeof d.montant_signe_ht === "number" ? `${euro.format(d.montant_signe_ht)} HT` : null, str(d.note)].filter(Boolean).join(" · ");
    case "valeur": return [typeof d.valeur === "number" ? euro.format(d.valeur) : null, str(d.titre)].filter(Boolean).join(" · ");
    case "tache_creee": return [str(d.tache), str(d.pour) ? `pour ${d.pour}` : null].filter(Boolean).join(" · ");
    case "tache_faite": case "tache_annulee": return str(d.tache) ?? "";
    case "contact_modifie": return Array.isArray(d.champs) ? `Champs : ${d.champs.join(", ")}` : "";
    case "import": case "source": case "automatisation": return [str(d.origine), str(d.regle), str(d.detail)].filter(Boolean).join(" · ");
    case "note": return str(d.excerpt) ?? "";
    case "qualification": return [d.besoin, d.budget].filter(Boolean).join(" · ");
    case "prochaine_action": return str(d.note) ?? "";
    case "opt_in": return [d.marque, d.source, d.landing_page].filter(Boolean).join(" · ");
    case "cree": return [str(d.origine), str(d.source) ? `source : ${d.source}` : null, str(d.etape)].filter(Boolean).join(" · ");
    case "rdv_pris": return [str(d.origine), str(d.starts_at) ? "rendez-vous enregistré" : null].filter(Boolean).join(" · ");
    default: return "";
  }
}

/** Chronologie horodatée d'un prospect, avec l'auteur de chaque changement. Rendue côté serveur. */
export function ProspectTimeline({ events, timezone, names = {} }: { events: ProspectEvent[]; timezone: string; names?: Record<string, string> }) {
  if (!events.length) return <p className="text-[13px] text-muted">Aucun événement pour l&apos;instant. Chaque changement apparaîtra ici, avec son auteur.</p>;
  return (
    <ol>
      {events.map((e, i) => {
        const Icon = ICON[e.kind] ?? Clock;
        const detail = describe(e);
        const author = e.created_by ? names[e.created_by] ?? "un membre" : "le système";
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-18px)] w-px bg-border" aria-hidden /> : null}
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"><Icon className="size-3.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{PROSPECT_EVENT[e.kind as ProspectEventKind] ?? e.kind}</p>
              {detail ? <p className="break-words text-[12.5px] text-muted">{detail}</p> : null}
              <p className="text-[11.5px] text-muted-2">{formatDateTimeInZone(e.created_at, timezone)} · par {author}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
