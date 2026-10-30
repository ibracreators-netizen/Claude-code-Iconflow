/**
 * Domain model — Iconflow Studio.
 * Mirrors the Supabase schema in /supabase/migrations. Kept framework-agnostic.
 */

export type Role = "owner" | "admin" | "member" | "client";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  title: string | null;          // "Head of Creative", "Monteur"…
  client_id: string | null;      // set when role === "client"
  created_at: string;
}

export type ClientStage =
  | "lead" | "appel" | "proposition" | "signe" | "onboarding" | "actif" | "pause" | "churn";

export type ClientSegment = "ecommerce" | "infopreneur" | "coach" | "saas" | "autre";

export interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  segment: ClientSegment;
  stage: ClientStage;
  owner_id: string | null;       // account manager
  monthly_budget: number;        // budget ads mensuel (€)
  retainer: number;              // honoraires mensuels (€)
  performance_fee_pct: number;   // % aux résultats
  health: "excellent" | "bon" | "attention" | "risque";
  tags: string[];
  notes: string | null;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  has_portal_access: boolean;
}

export type ProjectStatus = "brief" | "en_cours" | "en_test" | "scaling" | "termine" | "pause";

export interface Project {
  id: string;
  client_id: string;
  name: string;
  objective: string | null;
  platform: Array<"meta" | "tiktok" | "youtube" | "snapchat">;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  target_cpa: number | null;
  target_roas: number | null;
  created_at: string;
}

export type CreativeStatus =
  | "idee" | "script" | "validation_script" | "tournage" | "montage"
  | "validation_client" | "livre" | "en_test" | "winner" | "perdant";

export type CreativeFormat = "ugc" | "studio" | "motion" | "carrousel" | "statique" | "mashup";

export interface Creative {
  id: string;
  project_id: string;
  client_id: string;
  code: string;                  // ex: ICF-0421
  title: string;
  angle: string | null;          // angle psychologique
  hook: string | null;
  framework: "AIDA" | "PAS" | "BAB" | "4U" | "autre" | null;
  format: CreativeFormat;
  status: CreativeStatus;
  script: string | null;         // markdown
  video_url: string | null;
  thumbnail_url: string | null;
  duration_s: number | null;
  assignee_id: string | null;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreativeMetric {
  id: string;
  creative_id: string;
  period_start: string;          // date
  spend: number;
  impressions: number;
  clicks: number;
  thruplays_3s: number;
  purchases: number;
  revenue: number;
}

export interface CreativeKpis {
  spend: number; impressions: number; clicks: number; purchases: number; revenue: number;
  hook_rate: number; ctr: number; cpa: number; roas: number; cpm: number;
}

export type ApprovalDecision = "approuve" | "modifications" | "refuse";

export interface Approval {
  id: string;
  creative_id: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision: ApprovalDecision | null;
  comment: string | null;
}

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
  project_id: string | null;
  creative_id: string | null;
  due_date: string | null;
  position: number;
  labels: string[];
  created_at: string;
}

export type DocKind = "doc" | "brief" | "strategie" | "compte_rendu" | "sop" | "template";

export interface Document {
  id: string;
  title: string;
  icon: string;                  // emoji
  kind: DocKind;
  content: string;               // HTML (TipTap)
  client_id: string | null;      // null = interne agence
  project_id: string | null;
  shared_with_client: boolean;
  author_id: string | null;
  parent_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface FileAsset {
  id: string;
  name: string;
  path: string;                  // storage path
  mime: string;
  size: number;                  // bytes
  client_id: string | null;
  project_id: string | null;
  creative_id: string | null;
  folder: string;                // "Rushs", "Exports", "Brand kit", …
  shared_with_client: boolean;
  uploaded_by: string | null;
  created_at: string;
}

export type BrainCategory =
  | "angle" | "hook" | "framework" | "sop" | "swipe" | "insight" | "objection" | "prompt";

export interface BrainEntry {
  id: string;
  title: string;
  category: BrainCategory;
  body: string;                  // markdown / plain
  tags: string[];
  segment: ClientSegment | "tous";
  performance_score: number | null; // 0-100 (issu des créatives qui l'utilisent)
  uses: number;
  author_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = "brouillon" | "envoyee" | "payee" | "en_retard" | "annulee";
export type InvoiceType = "facture" | "devis" | "avoir";

export interface InvoiceLine {
  id: string;
  label: string;
  qty: number;
  unit_price: number;
  vat_pct: number;
}

export interface Invoice {
  id: string;
  number: string;                // F-2026-0042
  type: InvoiceType;
  client_id: string;
  project_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  lines: InvoiceLine[];
  notes: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  client_id: string;
  author_id: string;
  body: string;
  created_at: string;
  read_by: string[];
}

export type ActivityKind =
  | "creative.status" | "creative.approved" | "creative.changes" | "doc.shared" | "file.uploaded"
  | "invoice.sent" | "invoice.paid" | "client.stage" | "task.done" | "message" | "note";

export interface Activity {
  id: string;
  kind: ActivityKind;
  actor_id: string | null;
  client_id: string | null;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  kind: "tournage" | "livraison" | "appel" | "deadline" | "interne";
  starts_at: string;
  ends_at: string | null;
  client_id: string | null;
  project_id: string | null;
  creative_id: string | null;
}

/* ─── Labels (fr) ──────────────────────────────────────────────────────── */

export const CLIENT_STAGES: Record<ClientStage, string> = {
  lead: "Lead", appel: "Appel découverte", proposition: "Proposition", signe: "Signé",
  onboarding: "Onboarding", actif: "Actif", pause: "En pause", churn: "Churn",
};
export const PIPELINE_ORDER: ClientStage[] = ["lead", "appel", "proposition", "signe", "onboarding", "actif", "pause", "churn"];

export const SEGMENTS: Record<ClientSegment, string> = {
  ecommerce: "E-commerce", infopreneur: "Infopreneur", coach: "Coach", saas: "SaaS", autre: "Autre",
};

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  brief: "Brief", en_cours: "En cours", en_test: "En test", scaling: "Scaling", termine: "Terminé", pause: "Pause",
};

export const CREATIVE_STATUS: Record<CreativeStatus, string> = {
  idee: "Idée", script: "Script", validation_script: "Validation script", tournage: "Tournage",
  montage: "Montage", validation_client: "Validation client", livre: "Livré", en_test: "En test",
  winner: "Winner", perdant: "Perdant",
};
export const CREATIVE_FLOW: CreativeStatus[] = [
  "idee", "script", "validation_script", "tournage", "montage", "validation_client", "livre", "en_test", "winner",
];

export const CREATIVE_FORMAT: Record<CreativeFormat, string> = {
  ugc: "UGC", studio: "Studio", motion: "Motion", carrousel: "Carrousel", statique: "Statique", mashup: "Mashup",
};

export const TASK_STATUS: Record<TaskStatus, string> = {
  a_faire: "À faire", en_cours: "En cours", revue: "En revue", termine: "Terminé",
};
export const TASK_PRIORITY: Record<TaskPriority, string> = {
  basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente",
};

export const DOC_KIND: Record<DocKind, string> = {
  doc: "Document", brief: "Brief", strategie: "Stratégie", compte_rendu: "Compte-rendu", sop: "SOP", template: "Template",
};

export const BRAIN_CATEGORY: Record<BrainCategory, string> = {
  angle: "Angles", hook: "Hooks", framework: "Frameworks", sop: "SOP", swipe: "Swipe file",
  insight: "Insights", objection: "Objections", prompt: "Prompts IA",
};

export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  brouillon: "Brouillon", envoyee: "Envoyée", payee: "Payée", en_retard: "En retard", annulee: "Annulée",
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

export function computeKpis(rows: CreativeMetric[]): CreativeKpis {
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
