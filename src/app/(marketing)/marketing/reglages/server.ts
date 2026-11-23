import "server-only";
import { canAccess, hasFullAccess } from "@/lib/permissions";
import type { Profile } from "@/lib/data/types";
import { bookingSource } from "@/lib/marketing/sources/run";
import type { SectionFlags } from "./sections";

/**
 * Droits qui décident des rubriques affichées (menu de gauche et liste du téléphone).
 * Les pages vérifient elles-mêmes leur accès : ce calcul ne sert qu'à ne pas montrer un lien qui serait refusé.
 */
export function sectionFlags(profile: Profile): SectionFlags {
  return {
    admin: hasFullAccess(profile),
    // Même règle que la carte « Liens de saisie des KPI » (membre de l'agence), plus le droit d'ouvrir l'onglet Saisie des KPI.
    kpiLinks: profile.role === "agency" && canAccess(profile, "marketing_reglages") && canAccess(profile, "marketing_classement"),
    iclosed: bookingSource().configured(),
  };
}
