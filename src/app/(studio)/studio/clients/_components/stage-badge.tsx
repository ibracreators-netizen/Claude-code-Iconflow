import { StatusBadge } from "@/components/shared/status-badge";
import { stageLabel, type PipelineStage, type StageColor } from "@/lib/data/types";

/** Pastille de couleur d'une étape (en-tête de colonne, sélecteur de couleur, suivi agence). */
export const STAGE_DOT: Record<StageColor, string> = {
  neutral: "bg-muted", info: "bg-info", accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", violet: "bg-violet",
};

/** Nom lisible de chaque couleur disponible pour une étape. */
export const STAGE_COLOR_LABEL: Record<StageColor, string> = {
  neutral: "Gris", info: "Bleu", accent: "Vert", success: "Émeraude", warning: "Ambre", danger: "Rouge", violet: "Violet",
};

/** Étiquette d'étape du pipeline : libellé et couleur réels (les étapes sont personnalisables par l'agence). */
export function StageBadge({ stages, value, className }: { stages: PipelineStage[]; value: string; className?: string }) {
  const meta = stages.find((s) => s.key === value);
  return <StatusBadge kind="stage" value={value} label={stageLabel(stages, value)} tone={meta?.color} className={className} />;
}
