import type { Stage } from "./types";

/** Couleur d'une étape du pipeline (utilisable côté serveur comme côté navigateur). */
export const stageTone = (s: Pick<Stage, "kind" | "key"> | null | undefined): "success" | "danger" | "info" | "neutral" =>
  (s?.kind === "gagne" ? "success" : s?.kind === "perdu" ? "danger" : s?.key === "nouveau_lead" ? "neutral" : "info");
export const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
