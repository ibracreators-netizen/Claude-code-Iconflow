/**
 * Domain model — Iconflow Studio.
 *
 * Source of truth = the existing Supabase project (xqacgjtlktzrmfcolbst).
 * Legacy tables are kept as-is (clients, profiles, briefs, livrables, validations,
 * avatars, brand_dossiers, brain_entries, agency_client_management…) and extended
 * additively by /supabase/migrations/0002_studio_v2.sql (new columns + new tables).
 */

/* ─── Auth & people ────────────────────────────────────────────────────── */

export type Role = "agency" | "client";

export interface Profile {
  id: string;
  role: Role;
  client_id: string | null;
  display_name: string | null;
  email: string | null;          // v2
  avatar_url: string | null;     // v2
  title: string | null;          // v2 ("Fondateur", "Monteur"…)
  permissions: string[] | null;  // v2 — modules du studio autorisés ; null = accès complet
  disabled_at: string | null;    // v2 — accès retiré
  invited_by: string | null;     // v2
  created_at: string;
}

/* ─── Clients ──────────────────────────────────────────────────────────── */

export type ClientStatus = "onboarding" | "active" | "paused" | "archived";
export type ClientSegment = "ecommerce" | "infopreneur" | "coach" | "saas" | "autre";
export type ClientHealth = "excellent" | "bon" | "attention" | "risque";
/** Étape du pipeline : clé d'une ligne de pipeline_stages (personnalisable par l'agence). */
export type ManagementStage = string;
export type StageColor = "neutral" | "info" | "accent" | "success" | "warning" | "danger" | "violet";
export const STAGE_COLORS: StageColor[] = ["neutral", "info", "accent", "success", "warning", "danger", "violet"];
export interface PipelineStage { key: string; label: string; color: StageColor; position: number }
export const DEFAULT_STAGES: PipelineStage[] = [
  { key: "onboarding", label: "Onboarding", color: "info", position: 0 },
  { key: "in_progress", label: "En cours", color: "accent", position: 1 },
  { key: "completed", label: "Terminé", color: "success", position: 2 },
];
export function stageLabel(stages: PipelineStage[], key: string) { return stages.find((s) => s.key === key)?.label ?? MANAGEMENT_STAGE[key] ?? key; }
export function stageKeyFromLabel(label: string) {
  const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40);
  return slug || `etape_${Math.random().toString(36).slice(2, 8)}`;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  status: ClientStatus;
  current_step: number;
  sector: string | null;
  contact_email: string | null;
  created_at: string;
  // v2
  website: string | null;
  logo_url: string | null;
  segment: ClientSegment;
  monthly_budget: number;        // budget ads mensuel (€)
  retainer: number;              // honoraires mensuels (€)
  performance_fee_pct: number;   // % aux résultats
  health: ClientHealth;
  tags: string[];
  city: string | null;
  owner_id: string | null;       // account manager (profiles.id)
  archived_at: string | null;
  updated_at: string;
  dashboard_url: string | null;  // v2 — tableau de bord externe (Looker Studio, Meta…) intégrable
}

export interface ClientManagement {
  client_id: string;
  stage: ManagementStage;
  notes: string;
  revision: number;
  updated_at: string;
  updated_by: string | null;
}

export interface Contact {
  id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
  created_at: string;
}

/* ─── Briefs (scripts vidéo / statiques) ───────────────────────────────── */

export type BriefKind = "video" | "statique";
export type BriefStatus = "redaction" | "attente_ibra" | "attente_client" | "valide" | "archived";

export interface VideoBriefContent {
  concept: string;
  transcription: { hooks: string[]; corps: string; ctas: string[] };
  acting: string;
  angle?: string;
  framework?: "AIDA" | "PAS" | "BAB" | "4U" | string;
  [k: string]: unknown;
}
export interface StaticBriefContent {
  reference: string;
  angle: string;
  overlay: string;
  [k: string]: unknown;
}

export interface Brief {
  id: string;
  client_id: string;
  month: string;                 // YYYY-MM-01
  kind: BriefKind;
  title: string;
  status: BriefStatus;
  content: VideoBriefContent | StaticBriefContent | Record<string, unknown>;
  source: string;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
  script_version: number;
  submitted_content: unknown | null;
  position: number | null;
  // v2
  assignee_id: string | null;
  due_date: string | null;
  updated_at: string;
}

/** Un brief contient plusieurs concepts (pages), chacun avec sa propre structure de script. */
export interface BriefConcept {
  id: string;
  brief_id: string;
  title: string;
  position: number;
  content: VideoBriefContent | StaticBriefContent | Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function emptyBriefContent(kind: BriefKind): VideoBriefContent | StaticBriefContent {
  return kind === "video" ? { concept: "", transcription: { hooks: [""], corps: "", ctas: [""] }, acting: "" } : { reference: "", angle: "", overlay: "" };
}

/* ─── Livrables ────────────────────────────────────────────────────────── */

/** Élément d'un batch : une vidéo ou un visuel du lot (le lien Frame est porté par le livrable). */
export interface LivrableItem { name: string; duration_sec?: number | null; url?: string | null }

export type LivrableKind = "video" | "static" | "rush";
export type LivrableStatus = "en_controle" | "attente_client" | "valide" | "correction";

export interface Livrable {
  id: string;
  client_id: string;
  month: string;
  kind: LivrableKind;
  title: string;
  file_url: string | null;
  duration_sec: number | null;
  status: LivrableStatus;
  created_at: string;
  // v2
  brief_id: string | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  updated_at: string;
  items: LivrableItem[];         // v2 — un livrable = un batch (plusieurs vidéos ou visuels, un seul lien)
}

export interface LivrableComment {
  id: string;
  livrable_id: string;
  author: string | null;
  body: string;
  created_at: string;
}

export type ValidationDecision = "valide" | "correction" | "attente_client";

export interface Validation {
  id: string;
  client_id: string;
  item_kind: "script" | "rushs" | "crea" | string;
  brief_id: string | null;
  item_ref: string;
  decision: ValidationDecision | string;
  comment: string | null;
  decided_by: string | null;
  created_at: string;
}

/* ─── Avatars ──────────────────────────────────────────────────────────── */

export interface Avatar {
  id: string;
  client_id: string;
  name: string;
  preview_url: string | null;
  chosen: boolean;
  created_at: string;
}

/* ─── Brain (client) ───────────────────────────────────────────────────── */

export interface BrandDossierData {
  promesse?: string;
  personas?: Array<{ nom: string; resume: string }>;
  ton?: string;
  concurrents?: string[];
  [k: string]: unknown;
}

export interface BrandDossier {
  client_id: string;
  data: BrandDossierData;
  updated_at: string;
  updated_by: string | null;
}

export type BrainEntryKind = "fait" | "allegation" | "conflit" | "manque" | "note";

export interface BrainEntry {
  id: string;
  client_id: string;
  section: string;               // "Identité", "Produits & prix", "Connaissances"…
  kind: BrainEntryKind;
  title: string | null;
  content: string;
  source_url: string | null;
  origin: "manuel" | "import";
  import_id: string | null;
  position: number | null;
  created_at: string;
  created_by: string | null;
}

/* ─── Brain agence (v2) — connaissance transverse ──────────────────────── */

export type KnowledgeCategory =
  | "angle" | "hook" | "framework" | "sop" | "swipe" | "insight" | "objection" | "prompt";

export interface Knowledge {
  id: string;
  title: string;
  category: KnowledgeCategory;
  body: string;
  tags: string[];
  segment: ClientSegment | "tous";
  score: number | null;          // 0-100
  uses: number;
  pinned: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Tâches (v2) ──────────────────────────────────────────────────────── */

export type TaskStatus = "a_faire" | "en_cours" | "revue" | "termine";
export type TaskPriority = "basse" | "normale" | "haute" | "urgente";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  client_id: string | null;
  brief_id: string | null;
  livrable_id: string | null;
  due_date: string | null;
  position: number;
  labels: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Documents (v2) — remplace Notion / Docs / Craft ──────────────────── */

export type DocKind = "doc" | "brief" | "strategie" | "compte_rendu" | "sop" | "template";

export interface Document {
  id: string;
  title: string;
  icon: string;
  kind: DocKind;
  content: string;               // HTML TipTap
  client_id: string | null;      // null = interne agence
  shared_with_client: boolean;
  author_id: string | null;
  parent_id: string | null;
  folder_id: string | null;      // v2 — dossier de la bibliothèque
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Dossier de la bibliothèque de documents (arborescence libre). */
export interface DocumentFolder {
  id: string;
  name: string;
  parent_id: string | null;
  client_id: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
}

/* ─── Fichiers (v2) — remplace Drive ───────────────────────────────────── */

export interface FileAsset {
  id: string;
  name: string;
  path: string;                  // storage path dans le bucket "studio"
  mime: string;
  size: number;
  client_id: string | null;
  livrable_id: string | null;
  folder: string;                // "Rushs", "Exports", "Brand kit", "Contrats"…
  shared_with_client: boolean;
  uploaded_by: string | null;
  created_at: string;
}

/* ─── Facturation (v2) ─────────────────────────────────────────────────── */

export type InvoiceStatus = "brouillon" | "envoyee" | "payee" | "en_retard" | "annulee";
export type InvoiceType = "facture" | "devis" | "avoir";

export interface InvoiceLine { id: string; label: string; qty: number; unit_price: number; vat_pct: number }

export interface Invoice {
  id: string;
  number: string;
  type: InvoiceType;
  client_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  lines: InvoiceLine[];
  notes: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Messagerie, activité, planning, métriques (v2) ───────────────────── */

export interface Message {
  id: string;
  client_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type ActivityKind =
  | "brief.created" | "brief.status" | "livrable.created" | "livrable.status" | "validation"
  | "doc.shared" | "file.uploaded" | "invoice.sent" | "invoice.paid" | "client.stage" | "task.done"
  | "message" | "note";

/** Événements internes à l'agence : jamais montrés à un compte client (ni en aperçu « comme le client »). */
// Événements jamais montrés à un compte client : classement interne, tâches, notes, mais aussi la création d'un brief
// (le brief naît « en rédaction », masqué au client) et le dépôt de fichier (le fichier n'est pas partagé par défaut).
export const AGENCY_ONLY_ACTIVITY: readonly ActivityKind[] = ["client.stage", "task.done", "note", "brief.created", "file.uploaded"];
export const isClientVisibleActivity = (a: { kind: ActivityKind }) => !AGENCY_ONLY_ACTIVITY.includes(a.kind);

export interface Activity {
  id: string;
  kind: ActivityKind;
  actor_id: string | null;
  client_id: string | null;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

export type EventKind = "tournage" | "livraison" | "appel" | "deadline" | "interne";

export interface CalendarEvent {
  id: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string | null;
  client_id: string | null;
  notes: string | null;
  created_by: string | null;
  link: string | null;           // v2 — page ouverte au clic (fiche client, brief, livrable, tâche, URL)
}

export interface Metric {
  id: string;
  client_id: string;
  livrable_id: string | null;
  period_start: string;          // date (semaine)
  spend: number;
  impressions: number;
  clicks: number;
  thruplays_3s: number;
  purchases: number;
  revenue: number;
}

/* ─── Intégrations (v2) — Meta Ads… Le jeton n'est jamais exposé à l'interface. ── */

export interface Integration {
  id: string;
  client_id: string;
  provider: "meta" | string;
  account_id: string;
  account_name: string | null;
  token_expires_at: string | null;
  scopes: string[];
  connected_by: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_error: string | null;
}

/* ─── Imports Brain (legacy) — un import = une URL analysée ─────────────── */

export interface BrainImport {
  id: string;
  client_id: string;
  url: string;
  status: "pending" | "done" | "error" | string;
  pages_lues: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  worst_case_usd: number | null;
  created_by: string | null;
  created_at: string;
}

export interface Kpis {
  spend: number; impressions: number; clicks: number; purchases: number; revenue: number;
  hook_rate: number; ctr: number; cpa: number; roas: number; cpm: number;
}

/* ─── Labels (fr) ──────────────────────────────────────────────────────── */

export const CLIENT_STATUS: Record<ClientStatus, string> = {
  onboarding: "Onboarding", active: "Actif", paused: "En pause", archived: "Archivé",
};
export const MANAGEMENT_STAGE: Record<ManagementStage, string> = {
  onboarding: "Onboarding", in_progress: "En cours", completed: "Terminé",
};
export const MANAGEMENT_ORDER: ManagementStage[] = ["onboarding", "in_progress", "completed"];
export const SEGMENTS: Record<ClientSegment, string> = {
  ecommerce: "E-commerce", infopreneur: "Infopreneur", coach: "Coach", saas: "SaaS", autre: "Autre",
};
export const HEALTH: Record<ClientHealth, string> = {
  excellent: "Excellent", bon: "Bon", attention: "Attention", risque: "À risque",
};
export const BRIEF_STATUS: Record<BriefStatus, string> = {
  redaction: "En rédaction", attente_ibra: "Contrôle Ibra", attente_client: "Attente client",
  valide: "Validé", archived: "Corbeille",
};
export const BRIEF_FLOW: BriefStatus[] = ["redaction", "attente_ibra", "attente_client", "valide"];
export const BRIEF_KIND: Record<BriefKind, string> = { video: "Brief vidéo", statique: "Brief statique" };
export const LIVRABLE_STATUS: Record<LivrableStatus, string> = {
  en_controle: "Contrôle agence", attente_client: "Attente client", valide: "Validé", correction: "Correction demandée",
};
export const LIVRABLE_KIND: Record<LivrableKind, string> = { video: "Vidéo montée", static: "Statique", rush: "Rush" };
export const BRAIN_KIND: Record<BrainEntryKind, string> = {
  fait: "Fait", allegation: "Allégation", conflit: "Conflit", manque: "Manque", note: "Note",
};
export const BRAIN_SECTIONS = ["Identité", "Directives", "Connaissances", "Produits & prix", "Références", "Avatars"] as const;
export const KNOWLEDGE_CATEGORY: Record<KnowledgeCategory, string> = {
  angle: "Angles", hook: "Hooks", framework: "Frameworks", sop: "SOP", swipe: "Swipe file",
  insight: "Insights", objection: "Objections", prompt: "Prompts IA",
};
export const TASK_STATUS: Record<TaskStatus, string> = {
  a_faire: "À faire", en_cours: "En cours", revue: "En revue", termine: "Terminé",
};
export const TASK_ORDER: TaskStatus[] = ["a_faire", "en_cours", "revue", "termine"];
export const TASK_PRIORITY: Record<TaskPriority, string> = {
  basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente",
};
export const DOC_KIND: Record<DocKind, string> = {
  doc: "Document", brief: "Brief", strategie: "Stratégie", compte_rendu: "Compte-rendu", sop: "SOP", template: "Template",
};
export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  brouillon: "Brouillon", envoyee: "Envoyée", payee: "Payée", en_retard: "En retard", annulee: "Annulée",
};
export const INVOICE_TYPE: Record<InvoiceType, string> = { facture: "Facture", devis: "Devis", avoir: "Avoir" };
export const EVENT_KIND: Record<EventKind, string> = {
  tournage: "Tournage", livraison: "Livraison", appel: "Appel", deadline: "Deadline", interne: "Interne",
};

/* ─── Business rules (portées du legacy) ───────────────────────────────── */

/** Transition de brief autorisée pour un rôle (identique à supabase-store.js). */
export function briefTransition(role: Role, brief: Pick<Brief, "kind" | "status">): BriefStatus | null {
  if (role === "agency" && brief.status === "redaction") return "attente_ibra";
  if (role === "agency" && brief.status === "attente_ibra") return brief.kind === "video" ? "attente_client" : "valide";
  if (role === "client" && brief.kind === "video" && brief.status === "attente_client") return "valide";
  return null;
}

export function allowedLivrableTransition(role: Role, l: Pick<Livrable, "status">, next: LivrableStatus) {
  return (
    (role === "agency" && l.status === "en_controle" && next === "attente_client") ||
    (role === "agency" && l.status === "correction" && next === "attente_client") ||
    (role === "client" && l.status === "attente_client" && (next === "valide" || next === "correction"))
  );
}

export function computeKpis(rows: Metric[]): Kpis {
  const s = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks,
      thruplays: a.thruplays + r.thruplays_3s, purchases: a.purchases + r.purchases, revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, thruplays: 0, purchases: 0, revenue: 0 },
  );
  return {
    spend: s.spend, impressions: s.impressions, clicks: s.clicks, purchases: s.purchases, revenue: s.revenue,
    hook_rate: s.impressions ? s.thruplays / s.impressions : 0,
    ctr: s.impressions ? s.clicks / s.impressions : 0,
    cpa: s.purchases ? s.spend / s.purchases : 0,
    roas: s.spend ? s.revenue / s.spend : 0,
    cpm: s.impressions ? (s.spend / s.impressions) * 1000 : 0,
  };
}

export function invoiceTotals(inv: Pick<Invoice, "lines">) {
  const ht = inv.lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const tva = inv.lines.reduce((a, l) => a + l.qty * l.unit_price * (l.vat_pct / 100), 0);
  return { ht, tva, ttc: ht + tva };
}

export function monthKey(d: string | Date = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export function prettyMonth(key: string) {
  const [y, m] = key.slice(0, 7).split("-");
  return `${MONTHS_FR[Number(m) - 1]} ${y}`;
}
