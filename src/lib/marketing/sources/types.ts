/**
 * Couche d'ingestion : ce qu'un outil de réservation externe nous apprend, sous une forme commune.
 * Un adaptateur par outil (iClosed aujourd'hui) traduit ses réponses vers ces types ; le reste de
 * l'app ne connaît que ces types. Changer d'outil = écrire un autre adaptateur, rien d'autre.
 */
import type { CallResult, Outcome } from "../types";

export interface SourceContact {
  external_id?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  utm?: Record<string, string> | null;
  created_at?: string | null;
  tags?: string[];
}
/** Cas 1 : un rendez-vous (créé, déplacé, annulé, ou dont le résultat vient d'être saisi). */
export interface SourceBooking {
  external_id: string;
  contact: SourceContact;
  starts_at: string;                 // UTC ISO
  ends_at: string;                   // UTC ISO
  cancelled: boolean;
  result: CallResult;
  outcome?: Outcome | null;
  amount?: number | null;            // montant signé HT, si l'outil le donne
  title?: string | null;             // nom du type de rendez-vous
  meeting_url?: string | null;
  closer?: { email?: string | null; name?: string | null } | null;
  setter?: { email?: string | null; name?: string | null } | null;
  note?: string | null;
}
/** Cas 2 : une personne qui a laissé ses coordonnées sans prendre de rendez-vous. */
export interface SourceLead { contact: SourceContact; callable: boolean; tag?: string | null }

export interface SourceCursor { [key: string]: string | number | boolean | null | undefined }
export interface PullResult { bookings: SourceBooking[]; leads: SourceLead[]; cursor: SourceCursor; more: boolean; requests: number }

export interface SourceAdapter {
  /** Repère technique (« iclosed ») et nom affiché (« iClosed »). */
  readonly source: string;
  readonly label: string;
  /** Vrai si la clé d'accès est lue sur l'hébergeur. */
  configured(): boolean;
  /** Lit ce qui a changé depuis le dernier passage. `deadline` : heure limite (ms) à ne pas dépasser. */
  pull(cursor: SourceCursor, deadline: number): Promise<PullResult>;
  /** Relit des rendez-vous précis (appel reçu par webhook). */
  fetchBookings(ids: string[]): Promise<SourceBooking[]>;
  /** Extrait d'une notification reçue les identifiants à relire. Le contenu lui-même n'est jamais cru. */
  parseWebhook(body: unknown): { bookingIds: string[]; refresh: boolean };
}
