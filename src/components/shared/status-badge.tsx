import { Badge, STATUS_TONE } from "@/components/ui/badge";
import {
  BRAIN_KIND, BRIEF_STATUS, CLIENT_STATUS, HEALTH, INVOICE_STATUS, LIVRABLE_STATUS, MANAGEMENT_STAGE, TASK_PRIORITY, TASK_STATUS,
} from "@/lib/data/types";

const LABELS: Record<string, Record<string, string>> = {
  brief: BRIEF_STATUS, livrable: LIVRABLE_STATUS, client: CLIENT_STATUS, stage: MANAGEMENT_STAGE, task: TASK_STATUS,
  priority: TASK_PRIORITY, invoice: INVOICE_STATUS, health: HEALTH, brain: BRAIN_KIND,
};

export function StatusBadge({ kind, value, className, dot = true }: { kind: keyof typeof LABELS; value: string; className?: string; dot?: boolean }) {
  return <Badge tone={STATUS_TONE[value] ?? "neutral"} dot={dot} className={className}>{LABELS[kind]?.[value] ?? value}</Badge>;
}
