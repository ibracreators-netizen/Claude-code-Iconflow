import { classifyInfra } from "@/lib/infra-errors";
import type {
  Activity, Avatar, BrainEntry, BrainImport, BrandDossier, BrandDossierData, Brief, BriefConcept, BriefKind, BriefStatus, CalendarEvent, Client,
  ClientManagement, Contact, Document, DocumentFolder, FileAsset, Integration, Invoice, Knowledge, Livrable, LivrableComment, LivrableItem, LivrableStatus,
  ManagementStage, Message, Metric, PipelineStage, Profile, Role, Task, TaskStatus, Validation,
} from "./types";

/** Compteurs de la navigation (badges), calculés sans charger de lignes. */
export interface ShellCounts { briefs: number; livrables: number; taches: number; factures: number; validations: number }

export interface Session {
  user: { id: string; email: string };
  profile: Profile;
  demo: boolean;
}

export type Patch<T> = Partial<Omit<T, "id" | "created_at">>;

/**
 * Contrat d'accès aux données. Deux implémentations :
 *  - SupabaseStore : production (RLS = autorité, RPC pour les transitions).
 *  - DemoStore     : données en mémoire pour explorer l'interface sans backend.
 * Toutes les méthodes sont déjà scopées par la session courante.
 */
export interface DataStore {
  readonly session: Session;

  // People
  profiles(): Promise<Profile[]>;
  profile(id: string): Promise<Profile | null>;
  updateProfile(patch: Patch<Profile>): Promise<Profile>;
  /** Équipe & accès (agence). Les comptes Auth sont créés via l'API admin Supabase (clé service) ; en démo, en mémoire. */
  inviteMember(input: { email: string; full_name: string; title?: string | null; role: Role; client_id?: string | null; permissions?: string[] | null }): Promise<Profile>;
  updateMemberAccess(id: string, patch: { permissions?: string[] | null; disabled?: boolean; title?: string | null; client_id?: string | null }): Promise<Profile>;
  resendInvite(id: string): Promise<void>;

  // Clients
  clients(opts?: { includeArchived?: boolean }): Promise<Client[]>;
  client(id: string): Promise<Client | null>;
  createClient(input: { name: string; sector?: string; contact_email?: string; segment?: Client["segment"]; website?: string; monthly_budget?: number; retainer?: number; performance_fee_pct?: number; city?: string }): Promise<Client>;
  updateClient(id: string, patch: Patch<Client>): Promise<Client>;
  archiveClient(id: string, archived: boolean): Promise<Client>;
  management(): Promise<ClientManagement[]>;
  saveManagement(clientId: string, stage: ManagementStage, notes: string, revision: number): Promise<ClientManagement>;
  /** Suppression définitive (administrateur à accès complet) : toutes les données du client, comptes clients coupés. */
  deleteClient(id: string): Promise<void>;
  // Étapes du pipeline (personnalisables)
  stages(): Promise<PipelineStage[]>;
  saveStage(input: { key?: string; label: string; color?: PipelineStage["color"] }): Promise<PipelineStage>;
  reorderStages(keys: string[]): Promise<void>;
  deleteStage(key: string, replacement: string): Promise<void>;
  contacts(clientId: string): Promise<Contact[]>;
  upsertContact(input: Omit<Contact, "created_at"> | Omit<Contact, "id" | "created_at">): Promise<Contact>;
  deleteContact(id: string): Promise<void>;

  // Briefs
  briefs(opts?: { clientId?: string; month?: string; includeArchived?: boolean }): Promise<Brief[]>;
  brief(id: string): Promise<Brief | null>;
  createBrief(input: { client_id: string; month: string; kind: BriefKind; title: string }): Promise<Brief>;
  updateBrief(id: string, patch: Patch<Brief>): Promise<Brief>;
  transitionBrief(id: string, next: BriefStatus): Promise<Brief>;                 // agence
  clientDecideScript(id: string, decision: "valide" | "correction", comment?: string | null): Promise<Brief>; // client (RPC)
  reorderBriefs(ids: string[]): Promise<void>;
  // Concepts d'un brief (pages)
  concepts(briefId: string): Promise<BriefConcept[]>;
  /** Nombre de concepts par brief (une seule requête pour une liste). */
  conceptCounts(briefIds: string[]): Promise<Record<string, number>>;
  createConcept(briefId: string, input?: { title?: string; content?: Record<string, unknown> }): Promise<BriefConcept>;
  updateConcept(id: string, patch: { title?: string; content?: Record<string, unknown> }): Promise<BriefConcept>;
  reorderConcepts(briefId: string, ids: string[]): Promise<void>;
  deleteConcept(id: string): Promise<void>;

  // Livrables
  livrables(opts?: { clientId?: string; month?: string }): Promise<Livrable[]>;
  livrable(id: string): Promise<Livrable | null>;
  createLivrable(input: { client_id: string; month: string; kind: Livrable["kind"]; title: string; file_url?: string | null; duration_sec?: number | null; brief_id?: string | null; items?: LivrableItem[] }): Promise<Livrable>;
  updateLivrable(id: string, patch: Patch<Livrable>): Promise<Livrable>;
  transitionLivrable(id: string, next: LivrableStatus, comment?: string | null): Promise<Livrable>;
  livrableComments(livrableId: string): Promise<LivrableComment[]>;
  addLivrableComment(livrableId: string, body: string): Promise<LivrableComment>;
  validations(clientId?: string): Promise<Validation[]>;

  // Avatars
  avatars(clientId: string): Promise<Avatar[]>;
  createAvatar(input: { client_id: string; name: string; preview_url?: string | null }): Promise<Avatar>;
  toggleAvatar(id: string): Promise<Avatar>;
  deleteAvatar(id: string): Promise<void>;

  // Brain client
  brandDossier(clientId: string): Promise<BrandDossier | null>;
  saveBrandDossier(clientId: string, data: BrandDossierData): Promise<BrandDossier>;
  brainEntries(clientId: string): Promise<BrainEntry[]>;
  createBrainEntry(input: { client_id: string; section: string; kind: BrainEntry["kind"]; title: string; content: string; source_url?: string | null; origin?: BrainEntry["origin"]; import_id?: string | null; position?: number | null }): Promise<BrainEntry>;
  // Imports Brain (une URL analysée)
  brainImports(clientId: string): Promise<BrainImport[]>;
  createBrainImport(input: { client_id: string; url: string; status: string; pages_lues?: number | null }): Promise<BrainImport>;
  updateBrainImport(id: string, patch: Partial<Pick<BrainImport, "status" | "pages_lues" | "tokens_in" | "tokens_out" | "cost_usd">>): Promise<BrainImport>;
  updateBrainEntry(id: string, patch: Patch<BrainEntry>): Promise<BrainEntry>;
  deleteBrainEntry(id: string): Promise<void>;

  // Brain agence
  knowledge(): Promise<Knowledge[]>;
  createKnowledge(input: Pick<Knowledge, "title" | "category" | "body"> & Partial<Pick<Knowledge, "tags" | "segment" | "score" | "pinned">>): Promise<Knowledge>;
  updateKnowledge(id: string, patch: Patch<Knowledge>): Promise<Knowledge>;
  deleteKnowledge(id: string): Promise<void>;

  // Tâches
  tasks(opts?: { clientId?: string; assigneeId?: string }): Promise<Task[]>;
  createTask(input: Pick<Task, "title"> & Partial<Pick<Task, "description" | "priority" | "assignee_id" | "client_id" | "brief_id" | "livrable_id" | "due_date" | "labels" | "status">>): Promise<Task>;
  updateTask(id: string, patch: Patch<Task>): Promise<Task>;
  moveTask(id: string, status: TaskStatus, position: number): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Documents
  documents(opts?: { clientId?: string | null; includeArchived?: boolean }): Promise<Document[]>;
  document(id: string): Promise<Document | null>;
  createDocument(input: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client" | "parent_id" | "folder_id">>): Promise<Document>;
  updateDocument(id: string, patch: Patch<Document>): Promise<Document>;
  archiveDocument(id: string, archived: boolean): Promise<Document>;
  // Bibliothèque : dossiers et sous-dossiers
  folders(): Promise<DocumentFolder[]>;
  createFolder(input: { name: string; parent_id?: string | null; client_id?: string | null }): Promise<DocumentFolder>;
  updateFolder(id: string, patch: { name?: string; parent_id?: string | null; position?: number }): Promise<DocumentFolder>;
  deleteFolder(id: string): Promise<void>;

  // Fichiers
  files(opts?: { clientId?: string | null; folder?: string }): Promise<FileAsset[]>;
  registerFile(input: Omit<FileAsset, "id" | "created_at" | "uploaded_by">): Promise<FileAsset>;
  updateFile(id: string, patch: Patch<FileAsset>): Promise<FileAsset>;
  deleteFile(id: string): Promise<void>;
  fileUrl(path: string): Promise<string | null>;

  // Facturation
  invoices(opts?: { clientId?: string }): Promise<Invoice[]>;
  invoice(id: string): Promise<Invoice | null>;
  createInvoice(input: Pick<Invoice, "client_id" | "type"> & Partial<Pick<Invoice, "lines" | "notes" | "issue_date" | "due_date" | "status">>): Promise<Invoice>;
  updateInvoice(id: string, patch: Patch<Invoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;

  // Navigation
  shellCounts(): Promise<ShellCounts>;

  // Messages, activité, planning, métriques
  messages(clientId: string, limit?: number): Promise<Message[]>;
  sendMessage(clientId: string, body: string): Promise<Message>;
  activity(opts?: { clientId?: string; actorId?: string; limit?: number }): Promise<Activity[]>;
  logActivity(input: Pick<Activity, "kind" | "summary"> & Partial<Pick<Activity, "client_id" | "entity_id">>): Promise<void>;
  events(opts?: { from?: string; to?: string; clientId?: string }): Promise<CalendarEvent[]>;
  createEvent(input: Omit<CalendarEvent, "id" | "created_by" | "link"> & { link?: string | null }): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
  metrics(opts?: { clientId?: string; from?: string; to?: string }): Promise<Metric[]>;
  upsertMetric(input: Omit<Metric, "id">): Promise<Metric>;

  // Intégrations (administrateurs à accès complet) — le jeton ne sort jamais vers l'interface
  integrations(clientId?: string): Promise<Integration[]>;
  saveIntegration(input: { client_id: string; provider: string; account_id: string; account_name?: string | null; access_token: string; token_expires_at?: string | null; scopes?: string[] }): Promise<Integration>;
  integrationToken(id: string): Promise<string | null>;
  updateIntegration(id: string, patch: { last_sync_at?: string | null; last_error?: string | null; account_id?: string; account_name?: string | null }): Promise<Integration>;
  deleteIntegration(id: string): Promise<void>;
}

export class StoreError extends Error {
  /** Étiquette « IF|… » transmise au navigateur par React/Next pour les erreurs d'infrastructure (base pas à jour, RLS, réseau). */
  digest?: string;
  constructor(message: string, public code = "STORE") {
    super(message);
    const infra = classifyInfra(code, message);
    if (infra) {
      this.digest = infra.digest;
      if (typeof window === "undefined") console.error(`[iconflow] ${infra.kind}${infra.object ? ` ${infra.object}` : ""} (${code}) : ${message}`);
    }
  }
}

/** Messages français pour les erreurs métier (codes des RPC legacy et v2). */
export function humanError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "").trim();
  if (msg.startsWith("wrong_state:")) return "Cet élément n'est plus dans l'état attendu. Actualise avant de réessayer.";
  const map: Record<string, string> = {
    not_authenticated: "Ta session a expiré. Reconnecte-toi.",
    not_a_client: "Cette action est réservée au compte client.",
    not_an_agency: "Cette action est réservée à l'agence.",
    brief_not_found: "Ce brief n'est plus accessible.",
    livrable_not_found: "Ce livrable n'est plus accessible.",
    wrong_client: "Cet élément n'appartient pas à ton espace.",
    static_brief_ibra_only: "Les briefs statiques sont validés par Ibra.",
    bad_decision: "Choisis une validation ou une demande de correction.",
    already_decided: "Une décision a déjà été enregistrée pour cette version.",
    stale_revision: "Cette fiche a changé ailleurs. Recharge avant de réessayer.",
    client_not_available: "Ce client est archivé ou inaccessible.",
    bad_stage: "Cette étape n'existe pas (ou plus). Recharge la page.",
    last_stage: "Il doit rester au moins une étape dans le pipeline.",
    last_concept: "Un brief garde au moins un concept.",
    admin_only: "Réservé à un administrateur à accès complet.",
    bad_notes: "La note dépasse 20 000 caractères.",
    forbidden_module: "Tu n'as pas accès à cette partie du studio. Demande à un administrateur de l'agence.",
    service_key_missing: "Invitation impossible : la clé SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur l'hébergeur.",
    cannot_edit_self: "Tu ne peux pas modifier tes propres droits ni retirer ton propre accès.",
    email_taken: "Un compte existe déjà avec cet email.",
    last_admin: "Impossible : il doit toujours rester au moins un administrateur à accès complet.",
    admin_target: "Seul un administrateur à accès complet peut modifier ce compte.",
    cannot_grant: "Tu ne peux pas donner un accès que tu n'as pas toi-même.",
    account_disabled: "Ce compte n'a plus accès : rétablis son accès avant de lui renvoyer un lien.",
    target_not_found: "Compte introuvable.",
  };
  if (map[msg]) return map[msg];
  if (/42501|permission denied|row-level security/i.test(msg)) return "Accès refusé pour ce compte.";
  if (/23505|duplicate key/i.test(msg)) return "Cet élément existe déjà.";
  return msg || "Une erreur est survenue. Réessaie dans un instant.";
}
