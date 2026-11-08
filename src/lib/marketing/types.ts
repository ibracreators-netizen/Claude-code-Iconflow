/** Types de l'espace IconFlow Marketing. Les horodatages sont en UTC (ISO). */

export type ProspectStatus = "nouveau" | "relance" | "reserve" | "converti" | "perdu";
export const PROSPECT_STATUS: Record<ProspectStatus, string> = {
  nouveau: "Nouveau", relance: "Relancé", reserve: "Réservé", converti: "Converti", perdu: "Perdu",
};

export interface Prospect {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  marque: string | null;
  utm: Record<string, string> | null;
  status: ProspectStatus;
  opted_in_at: string | null;
  notes: string | null;
  unsubscribed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus = "confirme" | "annule" | "deplace";
export const APPOINTMENT_STATUS: Record<AppointmentStatus, string> = {
  confirme: "Confirmé", annule: "Annulé", deplace: "Déplacé",
};

export interface Appointment {
  id: string;
  prospect_id: string;
  starts_at: string;  // UTC ISO
  ends_at: string;    // UTC ISO
  status: AppointmentStatus;
  meeting_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailTemplateKey = "rappel_rdv" | "relance_optin";
export type EmailStatus = "pending" | "claimed" | "sent" | "failed" | "uncertain" | "cancelled";
export const EMAIL_STATUS: Record<EmailStatus, string> = {
  pending: "En attente", claimed: "En cours", sent: "Envoyé", failed: "Échec", uncertain: "Incertain", cancelled: "Annulé",
};

export interface ScheduledEmail {
  id: string;
  prospect_id: string | null;
  appointment_id: string | null;
  template: EmailTemplateKey | string;
  params: Record<string, unknown>;
  send_at: string;    // UTC ISO
  status: EmailStatus;
  idempotency_key: string;
  claimed_by: string | null;
  claimed_at: string | null;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  dry_run: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Une plage de disponibilité hebdomadaire : jour (0 = dimanche … 6 = samedi), heures locales (fuseau d'affichage). */
export interface AvailabilityWindow { weekday: number; start: string; end: string } // "HH:MM"

/**
 * Réglages Marketing. AUCUNE disponibilité n'est présupposée active : tant que `availability` est vide
 * ou `slot_minutes` absent, aucun créneau n'est proposé. Les offsets de rappel et le délai de relance
 * sont vides par défaut (rien n'est programmé automatiquement).
 */
export interface MarketingSettings {
  timezone: string;                       // fuseau d'affichage des créneaux (stockage en UTC)
  availability: AvailabilityWindow[];     // vide par défaut
  slot_minutes: number | null;            // durée d'un RDV ; null = non configuré
  min_notice_hours: number;               // délai minimum avant réservation
  booking_public_enabled: boolean;        // page publique de réservation (désactivée par défaut)
  emails_live: boolean;                   // false = DRY RUN (rien n'est envoyé)
  test_email: string | null;              // mode « adresse de test » (distinct du mode live)
  reminder_offsets_hours: number[];       // ex. [24, 1] ; vide par défaut
  relance_delay_hours: number | null;     // relance après opt-in sans réservation ; null par défaut
}

/** Valeurs par défaut sûres : rien d'actif (ni dispo, ni rappel, ni relance, ni envoi, ni page publique). */
export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  timezone: "Europe/Paris",
  availability: [],
  slot_minutes: null,
  min_notice_hours: 12,
  booking_public_enabled: false,
  emails_live: false,
  test_email: null,
  reminder_offsets_hours: [],
  relance_delay_hours: null,
};

export interface MarketingCounts { prospects: number; appointments: number; emailsPending: number }
