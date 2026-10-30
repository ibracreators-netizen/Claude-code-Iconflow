import type {
  Activity, Avatar, BrainEntry, BrandDossier, BrandDossierData, Brief, BriefKind, BriefStatus, CalendarEvent, Client,
  ClientManagement, Contact, Document, FileAsset, Invoice, Knowledge, Livrable, LivrableComment, LivrableStatus,
  ManagementStage, Message, Metric, Profile, Role, Task, TaskStatus, Validation,
} from "./types";

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

  // Livrables
  livrables(opts?: { clientId?: string; month?: string }): Promise<Livrable[]>;
  livrable(id: string): Promise<Livrable | null>;
  createLivrable(input: { client_id: string; month: string; kind: Livrable["kind"]; title: string; file_url?: string | null; duration_sec?: number | null; brief_id?: string | null }): Promise<Livrable>;
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
  createBrainEntry(input: { client_id: string; section: string; kind: BrainEntry["kind"]; title: string; content: string; source_url?: string | null }): Promise<BrainEntry>;
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
  createDocument(input: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client" | "parent_id">>): Promise<Document>;
  updateDocument(id: string, patch: Patch<Document>): Promise<Document>;
  archiveDocument(id: string, archived: boolean): Promise<Document>;

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

  // Messages, activité, planning, métriques
  messages(clientId: string, limit?: number): Promise<Message[]>;
  sendMessage(clientId: string, body: string): Promise<Message>;
  activity(opts?: { clientId?: string; actorId?: string; limit?: number }): Promise<Activity[]>;
  logActivity(input: Pick<Activity, "kind" | "summary"> & Partial<Pick<Activity, "client_id" | "entity_id">>): Promise<void>;
  events(opts?: { from?: string; to?: string; clientId?: string }): Promise<CalendarEvent[]>;
  createEvent(input: Omit<CalendarEvent, "id" | "created_by">): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
  metrics(opts?: { clientId?: string; from?: string; to?: string }): Promise<Metric[]>;
  upsertMetric(input: Omit<Metric, "id">): Promise<Metric>;
}

export class StoreError extends Error {
  constructor(message: string, public code = "STORE") { super(message); }
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
    bad_stage: "Choisis une étape proposée.",
    bad_notes: "La note dépasse 20 000 caractères.",
    forbidden_module: "Tu n'as pas accès à cette partie du studio. Demande à un administrateur de l'agence.",
    service_key_missing: "Invitation impossible : la clé SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur l'hébergeur.",
    cannot_edit_self: "Tu ne peux pas modifier tes propres droits ni retirer ton propre accès.",
    email_taken: "Un compte existe déjà avec cet email.",
  };
  if (map[msg]) return map[msg];
  if (/42501|permission denied|row-level security/i.test(msg)) return "Accès refusé pour ce compte.";
  if (/23505|duplicate key/i.test(msg)) return "Cet élément existe déjà.";
  return msg || "Une erreur est survenue. Réessaie dans un instant.";
}
