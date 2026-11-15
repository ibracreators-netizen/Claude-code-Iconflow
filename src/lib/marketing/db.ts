/**
 * Accès aux données de l'espace Marketing, réduit à ce dont la logique métier a besoin.
 * Deux réalisations : Supabase (production, sous RLS ou avec la clé service) et la mémoire
 * (sans base reliée, et pour les vérifications hors ligne). Toute la logique (contacts,
 * prospects, tâches, imports, sources, automatisations) est écrite UNE fois contre cette
 * interface, ce qui permet de la tester sans base ni réseau.
 *
 * Ce fichier ne dépend de rien côté serveur : il est importable depuis un script.
 */
export type Filter =
  | ["eq" | "neq", string, unknown]
  | ["in", string, unknown[]]
  | ["gte" | "gt" | "lte" | "lt", string, string | number]
  | ["null" | "notnull", string]
  | ["ieq", string, string]            // égalité insensible à la casse (emails)
  | ["has", string, string]            // tableau contenant la valeur (étiquettes)
  | ["search", string[], string];      // « contient », sur plusieurs colonnes

export interface ListOpts { where?: Filter[]; order?: [string, "asc" | "desc"]; limit?: number }

export interface Db {
  /** Identifiant du membre qui agit (auteur dans la chronologie) ; null = le système. */
  readonly actor: string | null;
  list<T>(table: string, opts?: ListOpts): Promise<T[]>;
  get<T>(table: string, id: string): Promise<T | null>;
  insert<T>(table: string, row: Record<string, unknown>): Promise<T>;
  update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(table: string, id: string): Promise<void>;
  /** Réglage clé/valeur (table marketing_settings). */
  setting<T>(key: string): Promise<T | null>;
  saveSetting(key: string, value: unknown): Promise<void>;
}

export class DbError extends Error { constructor(message: string, public code?: string) { super(message); this.name = "DbError"; } }

/* ─────────────────────────── Réalisation en mémoire ─────────────────────────── */

type Row = Record<string, unknown>;
export type MemoryTables = Record<string, Row[]>;
const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `m-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
const cmp = (a: unknown, b: unknown) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

/** Valeurs par défaut posées par la base en production (colonnes `default`). */
const DEFAULTS: Record<string, () => Row> = {
  marketing_contacts: () => ({ name: null, email: null, phone: null, phone_norm: null, company: null, tags: [], source: null, last_activity_at: null, created_by: null }),
  marketing_prospects: () => ({ name: null, email: null, phone: null, source: null, marque: null, utm: null, site: null, landing_page: null, referrer: null, status: "nouveau", opted_in_at: null, notes: null, besoin: null, budget: null,
    next_action_at: null, next_action_note: null, unsubscribed_at: null, created_by: null, contact_id: null, stage_id: null, stage_changed_at: null, title: null, value: null, setter_id: null, closer_id: null,
    call_result: null, outcome: null, signed_amount: null, call_note: null }),
  marketing_tasks: () => ({ prospect_id: null, contact_id: null, kind: "a_appeler", note: null, assignee_id: null, due_at: null, status: "ouverte", done_at: null, done_by: null, origin: "manuel", created_by: null }),
  marketing_pipeline_stages: () => ({ position: 0, kind: "ouvert", legacy_status: "nouveau", is_system: false, active: true }),
  marketing_prospect_events: () => ({ data: {}, created_by: null }),
  marketing_imports: () => ({ filename: null, total: 0, created: 0, merged: 0, rejected: 0, report: {}, status: "en_cours", created_by: null }),
  marketing_appointments: () => ({ status: "confirme", meeting_url: null, created_by: null, source: "interne", external_id: null, contact_id: null, setter_id: null, closer_id: null, result: "a_venir", title: null, calendar_event_id: null }),
};

export function matches(row: Row, where: Filter[] = []): boolean {
  return where.every((f) => {
    switch (f[0]) {
      case "eq": return row[f[1]] === f[2] || (row[f[1]] == null && f[2] == null);
      case "neq": return row[f[1]] !== f[2];
      case "in": return f[2].includes(row[f[1]]);
      case "gte": return row[f[1]] != null && (row[f[1]] as string | number) >= f[2];
      case "gt": return row[f[1]] != null && (row[f[1]] as string | number) > f[2];
      case "lte": return row[f[1]] != null && (row[f[1]] as string | number) <= f[2];
      case "lt": return row[f[1]] != null && (row[f[1]] as string | number) < f[2];
      case "null": return row[f[1]] == null;
      case "notnull": return row[f[1]] != null;
      case "ieq": return typeof row[f[1]] === "string" && (row[f[1]] as string).toLowerCase() === f[2].toLowerCase();
      case "has": return Array.isArray(row[f[1]]) && (row[f[1]] as unknown[]).includes(f[2]);
      case "search": { const t = f[2].toLowerCase(); return f[1].some((c) => typeof row[c] === "string" && (row[c] as string).toLowerCase().includes(t)); }
    }
  });
}

export class MemoryDb implements Db {
  constructor(private tables: MemoryTables, public readonly actor: string | null = null, private settings: Record<string, unknown> = {}) {}
  private t(name: string): Row[] { return (this.tables[name] ??= []); }
  async list<T>(table: string, opts: ListOpts = {}): Promise<T[]> {
    let rows = this.t(table).filter((r) => matches(r, opts.where));
    if (opts.order) { const [col, dir] = opts.order; rows = [...rows].sort((a, b) => cmp(a[col], b[col]) * (dir === "asc" ? 1 : -1)); }
    return (opts.limit ? rows.slice(0, opts.limit) : rows).map((r) => ({ ...r })) as T[];
  }
  async get<T>(table: string, id: string): Promise<T | null> { const r = this.t(table).find((x) => x.id === id); return r ? ({ ...r } as T) : null; }
  async insert<T>(table: string, row: Row): Promise<T> {
    const now = new Date().toISOString();
    const full: Row = { ...(DEFAULTS[table]?.() ?? {}), id: uid(), created_at: now, updated_at: now, ...row };
    // Unicités tenues par la base en production : email d'un contact, clé d'une étape, référence externe.
    if (table === "marketing_contacts" && typeof full.email === "string" && this.t(table).some((c) => typeof c.email === "string" && c.email.toLowerCase() === (full.email as string).toLowerCase())) throw new DbError("duplicate key value: marketing_contacts_email_key", "23505");
    if (table === "marketing_pipeline_stages" && this.t(table).some((s) => s.key === full.key)) throw new DbError("duplicate key value: stage key", "23505");
    if (table === "marketing_external_refs" && this.t(table).some((r) => r.source === full.source && r.entity === full.entity && r.external_id === full.external_id)) throw new DbError("duplicate key value: marketing_external_refs", "23505");
    this.t(table).unshift(full);
    // En production, un déclencheur tient à jour la « dernière activité » du contact à chaque événement.
    if (table === "marketing_prospect_events") {
      const p = this.t("marketing_prospects").find((x) => x.id === full.prospect_id);
      const c = p && this.t("marketing_contacts").find((x) => x.id === p.contact_id);
      if (c) c.last_activity_at = full.created_at;
    }
    return { ...full } as T;
  }
  async update<T>(table: string, id: string, patch: Row): Promise<T> {
    const r = this.t(table).find((x) => x.id === id);
    if (!r) throw new DbError("not_found");
    Object.assign(r, patch, { updated_at: new Date().toISOString() });
    return { ...r } as T;
  }
  async remove(table: string, id: string): Promise<void> { const rows = this.t(table), i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); }
  async setting<T>(key: string): Promise<T | null> { return (this.settings[key] as T) ?? null; }
  async saveSetting(key: string, value: unknown): Promise<void> { this.settings[key] = value; }
}
