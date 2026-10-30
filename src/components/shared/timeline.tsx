import { Activity as ActivityIcon, CheckCircle2, Clapperboard, FileText, FolderUp, MessageSquare, Receipt, Share2, Sparkles } from "lucide-react";
import type { Activity } from "@/lib/data/types";
import { BRIEF_STATUS, LIVRABLE_STATUS, MANAGEMENT_STAGE } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

const ICON: Record<string, typeof ActivityIcon> = {
  "brief.created": FileText, "brief.status": FileText, "livrable.created": Clapperboard, "livrable.status": Clapperboard, validation: CheckCircle2,
  "doc.shared": Share2, "file.uploaded": FolderUp, "invoice.sent": Receipt, "invoice.paid": Receipt, "client.stage": Sparkles, "task.done": CheckCircle2,
  message: MessageSquare, note: ActivityIcon,
};

/** Clés d'état historiques (« → attente_ibra ») rendues avec leur libellé ; les résumés récents sont déjà lisibles. */
const STATE_LABELS: Record<string, string> = { ...MANAGEMENT_STAGE, ...BRIEF_STATUS, ...LIVRABLE_STATUS, archived: "Corbeille" };
export function humanizeSummary(summary: string) {
  return summary.replace(/→ ([a-z_]+)$/, (m, key: string) => (STATE_LABELS[key] ? `→ ${STATE_LABELS[key]}` : m));
}

export function Timeline({ items, clientNames, compact }: { items: Activity[]; clientNames?: Record<string, string>; compact?: boolean }) {
  if (!items.length) return <p className="px-1 py-6 text-center text-[13px] text-muted">Aucune activité pour le moment.</p>;
  return (
    <ol className="relative space-y-0">
      {items.map((a, i) => {
        const Icon = ICON[a.kind] ?? ActivityIcon;
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-px bg-border" aria-hidden /> : null}
            <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted hairline"><Icon className="size-3.5" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={compact ? "text-[13px] leading-snug" : "text-[13.5px] leading-snug"}>{humanizeSummary(a.summary)}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">{clientNames && a.client_id && clientNames[a.client_id] ? `${clientNames[a.client_id]} · ` : ""}{fmt.relative(a.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
