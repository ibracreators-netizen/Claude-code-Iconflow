import type { Stage, StageColor } from "./types";

/** Couleur d'une étape du pipeline (utilisable côté serveur comme côté navigateur). */
export const stageTone = (s: Pick<Stage, "kind" | "key"> | null | undefined): "success" | "danger" | "info" | "neutral" =>
  (s?.kind === "gagne" ? "success" : s?.kind === "perdu" ? "danger" : s?.key === "nouveau_lead" ? "neutral" : "info");
export const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Couleurs proposées pour une colonne du kanban. Teintes moyennes, lisibles en clair comme en sombre. */
export const STAGE_COLORS: Record<StageColor, { label: string; hex: string }> = {
  gris: { label: "Gris", hex: "#8a938a" }, bleu: { label: "Bleu", hex: "#3b82c4" }, vert: { label: "Vert", hex: "#2f9e5b" }, jaune: { label: "Jaune", hex: "#c9a227" },
  orange: { label: "Orange", hex: "#d9782d" }, rouge: { label: "Rouge", hex: "#d1483f" }, violet: { label: "Violet", hex: "#8b5fc7" }, rose: { label: "Rose", hex: "#d2588f" },
};
/** Couleur affichée d'une étape : celle choisie, sinon celle de sa nature. */
export const stageHex = (s: Pick<Stage, "kind" | "key" | "color"> | null | undefined): string =>
  (s?.color && STAGE_COLORS[s.color] ? STAGE_COLORS[s.color].hex : s?.kind === "gagne" ? STAGE_COLORS.vert.hex : s?.kind === "perdu" ? STAGE_COLORS.rouge.hex : STAGE_COLORS.gris.hex);
/** Remplace {{prenom}}, {{nom}}, {{entreprise}}, {{mon_prenom}} dans un email type. Une variable inconnue reste vide. */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => (vars[k.toLowerCase()] ?? "").trim());
}
