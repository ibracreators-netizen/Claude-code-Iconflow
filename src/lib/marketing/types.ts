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
  // D'où vient la personne (migration 0017). Absent tant que la migration n'est pas appliquée.
  site?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  status: ProspectStatus;
  opted_in_at: string | null;
  notes: string | null;
  // Qualification + prochaine action (migration 0016). Déclaratif, saisi à la main.
  besoin: string | null;
  budget: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  unsubscribed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // L'affaire (migration 0018) : contact, étape du pipeline, responsables, appel.
  contact_id?: string | null;
  stage_id?: string | null;
  stage_changed_at?: string | null;
  title?: string | null;
  value?: number | null;
  setter_id?: string | null;
  closer_id?: string | null;
  call_result?: CallResult | null;
  outcome?: Outcome | null;
  signed_amount?: number | null;
  call_note?: string | null;
}

/** Résultat d'appel et issue : saisis par le closer, ou reçus de l'outil de réservation. */
export type CallResult = "a_venir" | "present" | "absent" | "annule" | "reporte";
export const CALL_RESULT: Record<CallResult, string> = { a_venir: "À venir", present: "Présent", absent: "Absent", annule: "Annulé", reporte: "Reporté" };
export type Outcome = "signe" | "non_signe" | "en_reflexion";
export const OUTCOME: Record<Outcome, string> = { signe: "Signé", non_signe: "Non signé", en_reflexion: "En réflexion" };

/** Une fiche par personne. L'email est unique ; le téléphone normalisé sert au dédoublonnage. */
export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phone_norm: string | null;
  company: string | null;
  tags: string[];
  source: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StageKind = "ouvert" | "gagne" | "perdu";
export const STAGE_KIND: Record<StageKind, string> = { ouvert: "En cours", gagne: "Gagné", perdu: "Perdu" };
/** Étape du pipeline « IconFlow — Ventes ». `key` est un repère stable ; `name` se modifie dans Réglages. */
export interface Stage {
  id: string;
  key: string;
  name: string;
  position: number;
  kind: StageKind;
  legacy_status: ProspectStatus;
  is_system: boolean;
  active: boolean;
  /** Couleur de la colonne dans le kanban (migration 0026). */
  color?: StageColor | null;
}
export type StageColor = "gris" | "bleu" | "vert" | "jaune" | "orange" | "rouge" | "violet" | "rose";

export type TaskKind = "a_appeler" | "relance" | "resultat" | "autre";
export const TASK_KIND: Record<TaskKind, string> = { a_appeler: "À appeler", relance: "Relance", resultat: "Résultat à saisir", autre: "Autre" };
export type TaskStatus = "ouverte" | "faite" | "annulee";
export const TASK_STATUS: Record<TaskStatus, string> = { ouverte: "À faire", faite: "Faite", annulee: "Annulée" };
/** Tâche de l'espace Marketing, rattachée à un prospect. Sans rapport avec les tâches de Studio. */
export interface MarketingTask {
  id: string;
  prospect_id: string | null;
  contact_id: string | null;
  kind: TaskKind;
  title: string;
  note: string | null;
  assignee_id: string | null;
  due_at: string | null;
  status: TaskStatus;
  done_at: string | null;
  done_by: string | null;
  origin: "manuel" | "source" | "automatisation" | "import";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Membre de l'équipe visible dans l'espace Marketing (attribution, auteur dans la chronologie). */
/**
 * Un membre de l'équipe. `marketing_role` : son rôle d'appel (un compte de l'agence peut en choisir un sans perdre ses
 * droits) ; `sales` : compte commercial (setter, closer ou media buyer, profiles.role = « marketing »), limité à ce qui
 * lui est attribué ; `admin` : compte de l'agence avec tous les droits.
 */
export interface Member { id: string; name: string; email: string | null; marketing_role: MarketingRole | null; admin: boolean; sales: boolean }
export type MarketingRole = "setter" | "closer" | "media_buyer";
export const MARKETING_ROLE: Record<MarketingRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

export type ProspectEventKind =
  | "cree" | "opt_in" | "statut" | "note" | "qualification" | "prochaine_action"
  | "rdv_pris" | "rdv_annule" | "relance_programmee"
  | "etape" | "attribution" | "appel" | "valeur" | "tache_creee" | "tache_faite" | "tache_annulee" | "contact_modifie"
  | "import" | "source" | "automatisation" | "migration_etape" | "email";
export const PROSPECT_EVENT: Record<ProspectEventKind, string> = {
  cree: "Prospect créé", opt_in: "Opt-in", statut: "Changement de statut", note: "Note",
  qualification: "Qualification", prochaine_action: "Prochaine action",
  rdv_pris: "Rendez-vous pris", rdv_annule: "Rendez-vous annulé", relance_programmee: "Relance programmée",
  etape: "Changement d'étape", attribution: "Attribution", appel: "Appel", valeur: "Valeur de l'affaire",
  tache_creee: "Tâche créée", tache_faite: "Tâche terminée", tache_annulee: "Tâche annulée", contact_modifie: "Contact modifié",
  import: "Import", source: "Outil externe", automatisation: "Automatisation", migration_etape: "Reprise de l'ancien statut", email: "Email envoyé",
};

/** Événement horodaté d'un prospect (chronologie de la fiche + entonnoir par cohortes). */
export interface ProspectEvent {
  id: string;
  prospect_id: string;
  kind: ProspectEventKind | string;
  data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
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
  // Source externe (migration 0020) : d'où vient le rendez-vous, qui le tient, son résultat.
  source?: string;
  external_id?: string | null;
  contact_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
  result?: CallResult;
  title?: string | null;
  calendar_event_id?: string | null;
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
  alert_emails: string[];                 // destinataires des alertes internes (nouveau lead, erreur, planificateur) ; vide par défaut
  relance_delay_hours: number | null;     // relance après opt-in sans réservation ; null par défaut
  booking_mode: "externe" | "interne";   // « externe » : la réservation se fait dans un outil externe (iClosed) ; /reserver et les disponibilités sont masqués
  booking_url: string | null;             // lien de réservation de l'outil externe (repris dans l'email de relance)
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
  alert_emails: [],
  relance_delay_hours: null,
  booking_mode: "externe",
  booking_url: null,
};

export interface MarketingCounts { prospects: number; appointments: number; emailsPending: number; inboxAttention?: number }

/* ─────────────── Agrégations du tableau de bord (données réelles) ─────────────── */

/** Point d'une série temporelle (jour ou semaine). `label` est prêt à afficher (fr). */
export interface TimePoint { date: string; label: string; count: number }
/** Décompte par catégorie (source, marque, campagne UTM…). */
export interface Breakdown { key: string; label: string; count: number }
/**
 * Étape d'un entonnoir par cohorte. `measured` indique que l'étape repose sur des
 * événements horodatés réels (et non sur le statut du moment).
 */
export interface FunnelStage { key: string; label: string; count: number; measured: boolean }

/**
 * Données agrégées du tableau de bord Marketing — UNIQUEMENT des données réelles du
 * magasin (aucune métrique publicitaire inventée). `conversionMeasured` dit si des
 * conversions horodatées existent sur la période : sinon l'entonnoir ne prétend pas
 * à un « taux de conversion » et on s'appuie sur la répartition par statut.
 */
export interface MarketingDashboard {
  periodDays: number;
  generatedAt: string;
  totals: { prospects: number; optins: number; upcoming: number; relanceToday: number };
  optins: TimePoint[];
  statusDistribution: Breakdown[];
  funnel: FunnelStage[];
  conversionMeasured: boolean;
  sources: Breakdown[];
  marques: Breakdown[];
  campaigns: Breakdown[];
  upcomingByWeek: TimePoint[];
}

/* ─────────────── Réception des leads (boîte leads_inbox, migration 0017) ─────────────── */

export type InboxStatus = "recu" | "traite" | "erreur" | "suspect";
export const INBOX_STATUS: Record<InboxStatus, string> = { recu: "Reçu", traite: "Traité", erreur: "Erreur", suspect: "Suspect" };
export type InboxAlert = "envoyee" | "simulee" | "echec" | "aucun_destinataire" | "desactivee";
export const INBOX_ALERT: Record<InboxAlert, string> = { envoyee: "Alerte envoyée", simulee: "Alerte simulée", echec: "Alerte en échec", aucun_destinataire: "Aucun destinataire", desactivee: "Alerte éteinte (règle 1)" };

/** Une ligne reçue d'un site : la charge brute est conservée telle quelle. */
export interface InboxRow {
  id: string;
  request_id: string;
  site: string | null;
  landing_page: string | null;
  page: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  payload: Record<string, unknown>;
  received_at: string;
  status: InboxStatus;
  error: string | null;
  attempts: number;
  processed_at: string | null;
  prospect_id: string | null;
  is_test: boolean;
  alert_status: InboxAlert | null;
  alert_error: string | null;
  updated_at: string;
}
/** `stuck` : lignes restées « reçu » depuis plus de 5 minutes (le planificateur ne les a pas traitées). */
export interface InboxCounts { recu: number; traite: number; erreur: number; suspect: number; stuck: number }
/** `available` est faux tant que la migration 0017 n'est pas appliquée : la page le dit au lieu d'afficher une liste vide. */
export interface InboxOverview { available: boolean; rows: InboxRow[]; counts: InboxCounts }

/** Dernier passage du planificateur (clé « scheduler » de marketing_settings). */
export interface SchedulerBeat {
  last_run_at: string | null;
  ok: boolean;
  detail: string | null;
  inbox: { processed: number; traite: number; erreur: number; stuck: number } | null;
  outbox: { claimed: number; sent: number; simulated: number; failed: number } | null;
}
export type SchedulerState = "ok" | "en_retard" | "arrete" | "jamais";

/** Suivi quotidien déclaré par un membre (migration 0026) : ce que le CRM ne peut pas savoir tout seul. */
export interface KpiEntry { id: string; profile_id: string; day: string; metrics: Record<string, number>; note: string | null; created_at: string; updated_at: string }
/**
 * Un indicateur du suivi quotidien. `short` : intitulé court (colonnes de tableau) ; `unit` : « euro » pour un montant
 * en euros entiers (sinon un nombre) ; `group` : intitulé du groupe dans le formulaire de saisie.
 */
export interface KpiField { key: string; label: string; hint: string; short?: string; unit?: "euro"; group?: string }
/** Champs du suivi quotidien, par rôle. Déclaratif : saisi par le membre, affiché comme tel. */
export const KPI_FIELDS: Record<"setter" | "closer", KpiField[]> = {
  setter: [
    { key: "appels", label: "Appels passés", hint: "Tous les numéros composés" },
    { key: "decroches", label: "Appels décrochés", hint: "La personne a répondu" },
    { key: "messages", label: "Messages envoyés", hint: "SMS, WhatsApp, DM" },
    { key: "conversations", label: "Conversations", hint: "Un vrai échange a eu lieu" },
  ],
  // Rapport des closers : les rendez-vous du jour, leur résultat, l'argent, puis le suivi (les deux clés d'origine).
  closer: [
    { key: "rdv_prevus", label: "Appels prévus", short: "Prévus", hint: "Rendez-vous à ton agenda ce jour-là", group: "Rendez-vous" },
    { key: "show_up", label: "Show-up", hint: "Le prospect s'est présenté à l'appel", group: "Rendez-vous" },
    { key: "no_show", label: "No-show", hint: "Absent, sans prévenir", group: "Rendez-vous" },
    { key: "annules", label: "Annulés ou reportés", short: "Annulés", hint: "Annulé, ou décalé à un autre jour", group: "Rendez-vous" },
    { key: "non_qualifies", label: "Non qualifiés", short: "Non qualif.", hint: "Présent, mais pas le bon profil (budget, besoin, moment)", group: "Résultats des appels" },
    { key: "pitchs", label: "Pitchs", hint: "Offre présentée avec le prix", group: "Résultats des appels" },
    { key: "closes", label: "Closes", hint: "Ventes conclues", group: "Résultats des appels" },
    { key: "en_reflexion", label: "En réflexion", short: "Réflexion", hint: "Pitch fait, réponse attendue : à relancer", group: "Résultats des appels" },
    { key: "cash", label: "Cash collecté", short: "Cash", hint: "Encaissé ce jour-là, acomptes compris", unit: "euro", group: "Argent" },
    { key: "ca_signe", label: "CA signé", hint: "Montant total des ventes conclues ce jour-là, HT", unit: "euro", group: "Argent" },
    { key: "relances", label: "Relances passées", short: "Relances", hint: "Appels ou messages de suivi", group: "Suivi" },
    { key: "propositions", label: "Propositions envoyées", short: "Propositions", hint: "Offre ou devis transmis", group: "Suivi" },
  ],
};
/** Limites d'une case du suivi quotidien, les mêmes pour la saisie d'un membre et pour le lien personnel. */
export const KPI_MAX_COUNT = 10_000;
export const KPI_MAX_EURO = 1_000_000;
export const kpiMax = (f: Pick<KpiField, "unit">) => (f.unit === "euro" ? KPI_MAX_EURO : KPI_MAX_COUNT);
/**
 * Refus d'une valeur saisie, en français, ou `null` si elle est acceptée : un nombre entier de 0 à 10 000, ou un montant
 * en euros entiers de 0 à 1 000 000. Aucune valeur n'est rabotée : au-delà, l'enregistrement est refusé.
 */
export function kpiValueError(f: KpiField, v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return `${f.label} : saisis un nombre.`;
  if (!Number.isInteger(v)) return f.unit === "euro" ? `${f.label} : saisis un montant en euros entiers, sans centimes.` : `${f.label} : saisis un nombre entier.`;
  if (v < 0) return `${f.label} : un nombre ne peut pas être négatif.`;
  if (v > kpiMax(f)) return f.unit === "euro" ? `${f.label} : 1\u00a0000\u00a0000\u00a0€ au plus par jour.` : `${f.label} : 10\u00a0000 au plus par case.`;
  return null;
}
/**
 * Saisie du jour fusionnée avec celle déjà enregistrée : une clé envoyée remplace l'ancienne valeur (envoyée à 0, elle
 * est retirée) ; une clé absente du formulaire est gardée (les chiffres de l'autre rôle, après un changement de rôle
 * d'appel, ou quand un administrateur corrige un ancien jour). Seuls les nombres positifs sont gardés.
 */
export function mergeKpiMetrics(existing: Record<string, unknown> | null | undefined, sent: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(existing ?? {})) if (!(k in sent) && typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  for (const [k, v] of Object.entries(sent)) if (v > 0) out[k] = v;
  return out;
}
/** Email type du CRM (Réglages), avec {{prenom}}, {{nom}}, {{entreprise}}, {{mon_prenom}}. */
export interface EmailTemplate { id: string; name: string; subject: string; body: string }
export interface TeamLogEntry { id: string; profile_id: string; actor_id: string | null; kind: "invitation" | "role" | "acces" | "acces_retire" | "acces_retabli"; data: Record<string, unknown>; created_at: string }
