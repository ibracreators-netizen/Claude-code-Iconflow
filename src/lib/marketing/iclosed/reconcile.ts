/**
 * iClosed — cœur de réconciliation (PUR, hors transport et hors base).
 *
 * Décide quoi faire d'un événement normalisé selon ce qu'on sait déjà, en tolérant les
 * livraisons REJOUÉES (dédup) et DÉSORDONNÉES (un événement plus ancien ne doit pas écraser
 * un plus récent). Quand l'ordre ne peut pas être établi (horodatage source manquant) ou qu'on
 * reçoit un report/annulation d'un appel inconnu, on NE DEVINE PAS : on met en revue et on
 * bloque les relances du prospect jusqu'à réconciliation. Cette fonction ne touche rien :
 * l'appelant (récepteur/worker, phase ultérieure) applique le plan dans une transaction.
 */
import type { NormalizedEvent } from "./events";

/** Ce que l'on sait déjà de l'entité visée (appel pour booking/reschedule/cancel, contact pour contact). */
export interface KnownEntity {
  exists: boolean;
  last_occurred_at: string | null;  // horodatage source du dernier événement appliqué (ordonnancement)
}

export interface PlanInput {
  event: NormalizedEvent;
  /** La livraison exacte a-t-elle déjà été traitée (clé de dédup déjà vue) ? */
  alreadySeen: boolean;
  /** État connu de l'entité visée, ou null si inconnue. */
  known: KnownEntity | null;
}

export type PlanAction = "dedupe" | "apply" | "ignore_stale" | "needs_review";
export type PlanEffect = "upsert_contact" | "book" | "reschedule" | "cancel";

export interface Plan {
  action: PlanAction;
  reason: string;
  effect?: PlanEffect;
  /** Arrêter les relances de ce prospect (RDV pris, ou ordre incertain → prudence). */
  block_relance?: boolean;
  /** Contacts : programmer un email ? (false si pas d'email — ex. téléphone seul). */
  may_schedule_email?: boolean;
}

/** Compare deux horodatages ISO ; null si l'un manque (ordre indéterminé). */
function olderThanKnown(incoming: string | null, known: string | null): boolean | null {
  if (!incoming || !known) return null;              // ordre indéterminé
  const a = Date.parse(incoming), b = Date.parse(known);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a < b;
}

export function planIclosed(input: PlanInput): Plan {
  const { event, alreadySeen, known } = input;
  if (alreadySeen) return { action: "dedupe", reason: "livraison déjà traitée" };

  // Ordre, quand une entité est déjà connue : un événement plus ancien n'écrase pas un plus récent.
  if (known?.exists) {
    const older = olderThanKnown(event.occurred_at, known.last_occurred_at);
    if (older === true) return { action: "ignore_stale", reason: "événement plus ancien que l'état connu" };
    if (older === null && event.kind !== "contact") {
      // Pour les appels, l'ordre compte (booking/reschedule/cancel) : sans horodatage fiable, on met en revue.
      return { action: "needs_review", reason: "ordre indéterminé (horodatage source manquant)", block_relance: true };
    }
  }

  switch (event.kind) {
    case "contact":
      return { action: "apply", reason: "contact à (mettre à) jour", effect: "upsert_contact", may_schedule_email: !!event.email };
    case "booking":
      // Un RDV pris bloque la relance, même avant que le reste n'arrive.
      return { action: "apply", reason: "réservation", effect: "book", block_relance: true };
    case "reschedule":
      if (!known?.exists) return { action: "needs_review", reason: "report d'un appel inconnu — à réconcilier", block_relance: true };
      return { action: "apply", reason: "report du RDV (mise à jour en place)", effect: "reschedule", block_relance: true };
    case "cancel":
      if (!known?.exists) return { action: "needs_review", reason: "annulation d'un appel inconnu — à réconcilier" };
      // On annule le RDV ; on ne ressuscite PAS automatiquement une relance (décision explicite d'un nouvel épisode).
      return { action: "apply", reason: "annulation du RDV", effect: "cancel" };
  }
}
