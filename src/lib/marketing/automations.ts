/**
 * Automatisations de l'espace Marketing : règles fixes, chacune avec son interrupteur (Réglages)
 * et son journal. Écrit contre `Db`, comme le reste du CRM.
 */
import type { Db } from "./db";
import type { LeadResult } from "./crm";
import type { Prospect } from "./types";

/** Appelé après chaque modification d'un prospect (fiche, pipeline, outil de réservation). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function afterProspectChange(db: Db, before: Prospect, after: Prospect): Promise<void> {
  // Les règles arrivent avec la phase 11.
}

/** Appelé quand un lead vient d'arriver (formulaire du site, outil de réservation). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function afterLeadReceived(db: Db, lead: LeadResult): Promise<void> {
  // Règle 1 (alerte, attribution à tour de rôle) : phase 11.
}
