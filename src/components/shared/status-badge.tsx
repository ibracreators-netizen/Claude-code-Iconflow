import { Badge, STATUS_TONE, type Tone } from "@/components/ui/badge";
import {
  BRAIN_KIND, BRIEF_STATUS, CLIENT_STATUS, HEALTH, INVOICE_STATUS, LIVRABLE_STATUS, MANAGEMENT_STAGE, TASK_PRIORITY, TASK_STATUS,
} from "@/lib/data/types";

const LABELS: Record<string, Record<string, string>> = {
  brief: BRIEF_STATUS, livrable: LIVRABLE_STATUS, client: CLIENT_STATUS, stage: MANAGEMENT_STAGE, task: TASK_STATUS,
  priority: TASK_PRIORITY, invoice: INVOICE_STATUS, health: HEALTH, brain: BRAIN_KIND,
};

/** `label` et `tone` permettent d'afficher une valeur dynamique (ex. étape de pipeline personnalisée). */
export function StatusBadge({ kind, value, className, dot = true, label, tone }: { kind: keyof typeof LABELS; value: string; className?: string; dot?: boolean; label?: string; tone?: Tone }) {
  return <Badge tone={tone ?? STATUS_TONE[value] ?? "neutral"} dot={dot} className={className}>{label ?? LABELS[kind]?.[value] ?? value}</Badge>;
}
