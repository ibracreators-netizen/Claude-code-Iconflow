import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hasFullAccess, type ModuleKey } from "@/lib/permissions";
import type { Session } from "@/lib/data/store";
import { MemoryDb, scopeDb, type Db } from "./db";
import { SupabaseDb } from "./db-supabase";
import { demoBag, demoTables } from "./demo-store";
import { getMarketingStoreFor, requireMarketing } from "./session";
import { ensureStages, listStages } from "./crm";
import type { MarketingStore } from "./store";
import type { Contact, MarketingRole, MarketingTask, Member, Prospect, Stage } from "./types";
import type { AdInsight, FactAppointment, FactProspect, FactTask } from "./funnel";

export interface Crm { db: Db; session: Session; store: MarketingStore; demo: boolean }

/** Rôle commercial de la session (null pour un membre agence, qui voit tout dans la limite de ses modules). */
export const salesRole = (session: Session): MarketingRole | null => (session.profile.role === "marketing" ? (session.profile.marketing_role ?? null) : null);

async function dbFor(store: MarketingStore): Promise<Db> {
  if (store.demo || !isSupabaseConfigured()) {
    const mem = new MemoryDb(demoTables(), store.session.user.id, demoBag()), role = salesRole(store.session);
    return role ? scopeDb(mem, { id: store.session.user.id, role }, demoTables()) : mem;
  }
  return new SupabaseDb(await createClient(), store.session.user.id);
}
/** Page : vérifie le droit au module (sinon redirige), puis donne l'accès aux données sous RLS. */
export async function crmPage(module: ModuleKey): Promise<Crm> {
  const store = await requireMarketing(module);
  return { db: await dbFor(store), session: store.session, store, demo: store.demo };
}
/** Server action : refuse si le module n'est pas accordé. */
export async function crmAction(module: ModuleKey): Promise<Crm> {
  const store = await getMarketingStoreFor(module);
  return { db: await dbFor(store), session: store.session, store, demo: store.demo };
}
/** Accès « système » (planificateur, sources externes, réception) : clé service, hors RLS, sans auteur. */
export function systemDb(): Db | null {
  if (!isSupabaseConfigured()) return new MemoryDb(demoTables(), null, demoBag());
  const admin = createAdminClient();
  return admin ? new SupabaseDb(admin, null) : null;
}

/** Étapes actives, dans l'ordre. Sans base, les sept étapes d'origine sont posées au premier accès. */
export async function stagesFor(crm: Crm): Promise<Stage[]> { return crm.demo ? ensureStages(crm.db) : listStages(crm.db); }

interface ProfileRow { id: string; role: string; display_name: string | null; email: string | null; permissions: unknown; disabled_at: string | null; marketing_role?: string | null }
const memberOf = (p: ProfileRow): Member => ({
  id: p.id, name: p.display_name?.trim() || p.email || "Membre", email: p.email ?? null,
  marketing_role: (["setter", "closer", "media_buyer"].includes(p.marketing_role ?? "") ? p.marketing_role : null) as MarketingRole | null,
  admin: p.role === "agency" && p.permissions == null,
});
/**
 * Membres de l'équipe à qui l'on peut attribuer un prospect ou une tâche, et dont le nom s'affiche
 * dans la chronologie. Lu par la fonction `marketing_members` quand elle existe (migration 0022),
 * sinon directement dans les profils.
 */
export const members = cache(async (): Promise<Member[]> => {
  const store = await getMarketingStoreFor("marketing_dashboard").catch(() => null);
  if (!isSupabaseConfigured()) {
    // Sans base : la session courante, plus les identités d'essai des trois rôles commerciaux (pour vérifier l'attribution).
    const s = store?.session, me = s ? [memberOf({ ...(s.profile as unknown as ProfileRow), email: s.user.email })] : [];
    const trial = (["setter", "closer", "media_buyer"] as const).map((r) => memberOf({ id: `demo-${r}`, role: "marketing", display_name: `${r === "setter" ? "Setter" : r === "closer" ? "Closer" : "Media buyer"} (essai)`, email: `${r}@demo.invalid`, permissions: [], disabled_at: null, marketing_role: r }));
    return [...me, ...trial.filter((t) => !me.some((m) => m.id === t.id))];
  }
  const sb = await createClient();
  const rpc = await sb.rpc("marketing_members");
  if (!rpc.error && Array.isArray(rpc.data)) return (rpc.data as ProfileRow[]).map(memberOf).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const { data } = await sb.from("profiles").select("*").eq("role", "agency").is("disabled_at", null);
  return ((data ?? []) as ProfileRow[]).filter((p) => p.permissions == null || (Array.isArray(p.permissions) && p.permissions.some((m) => String(m).startsWith("marketing_")))).map(memberOf).sort((a, b) => a.name.localeCompare(b.name, "fr"));
});
export const memberNames = async (): Promise<Record<string, string>> => Object.fromEntries((await members()).map((m) => [m.id, m.name]));
export const isAdmin = (session: Session) => hasFullAccess(session.profile);

/* ─────────────────────────── Lectures composées pour les écrans ─────────────────────────── */

export interface ProspectRow extends Prospect { contact: Contact | null; stage: Stage | null; openTasks: number; nextTaskDue: string | null }

export async function prospectRows(crm: Crm): Promise<{ rows: ProspectRow[]; stages: Stage[]; contacts: Contact[] }> {
  const [prospects, contacts, stages, tasks] = await Promise.all([
    crm.db.list<Prospect>("marketing_prospects", { order: ["created_at", "desc"] }),
    crm.db.list<Contact>("marketing_contacts"),
    crm.demo ? ensureStages(crm.db).then(() => listStages(crm.db, { includeInactive: true })) : listStages(crm.db, { includeInactive: true }),
    crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "status", "ouverte"]] }),
  ]);
  const byContact = new Map(contacts.map((c) => [c.id, c])), byStage = new Map(stages.map((s) => [s.id, s]));
  const open = new Map<string, { n: number; due: string | null }>();
  for (const t of tasks) { if (!t.prospect_id) continue; const o = open.get(t.prospect_id) ?? { n: 0, due: null }; o.n++; if (t.due_at && (!o.due || t.due_at < o.due)) o.due = t.due_at; open.set(t.prospect_id, o); }
  return {
    rows: prospects.map((p) => ({ ...p, contact: p.contact_id ? byContact.get(p.contact_id) ?? null : null, stage: p.stage_id ? byStage.get(p.stage_id) ?? null : null, openTasks: open.get(p.id)?.n ?? 0, nextTaskDue: open.get(p.id)?.due ?? null })),
    stages: stages.filter((s) => s.active), contacts,
  };
}

/* ─────────────────────────── Bandeau de l'espace : tâches à faire, base à jour ─────────────────────────── */

/** Version de schéma attendue par ce code (dernière migration Marketing). */
export const REQUIRED_SCHEMA = 23;
const MIGRATIONS: Record<number, string> = { 18: "0018_marketing_contacts_pipeline.sql", 19: "0019_marketing_import.sql", 20: "0020_marketing_sources.sql", 21: "0021_marketing_google_calendar.sql", 22: "0022_marketing_roles.sql", 23: "0023_marketing_ads.sql" };

export async function shellInfo(store: MarketingStore): Promise<{ myTasks: number; missing: string[] }> {
  if (store.demo || !isSupabaseConfigured()) {
    const db = await dbFor(store);
    const mine = await db.list<MarketingTask>("marketing_tasks", { where: [["eq", "status", "ouverte"], ["eq", "assignee_id", store.session.user.id]] });
    return { myTasks: mine.length, missing: [] };
  }
  const sb = await createClient();
  const [schema, tasks] = await Promise.all([
    sb.from("marketing_settings").select("value").eq("key", "schema").maybeSingle(),
    sb.from("marketing_tasks").select("id", { count: "exact", head: true }).eq("status", "ouverte").eq("assignee_id", store.session.user.id),
  ]);
  const version = Number((schema.data?.value as { version?: number } | undefined)?.version ?? 17);
  const missing = Object.entries(MIGRATIONS).filter(([v]) => Number(v) > version).map(([, file]) => file);
  return { myTasks: tasks.error ? 0 : tasks.count ?? 0, missing };
}

/* ─────────────────────────── Faits sans coordonnées (entonnoir, publicité, classement) ─────────────────────────── */

export interface Facts { prospects: FactProspect[]; appointments: FactAppointment[]; tasks: FactTask[]; insights: AdInsight[]; stages: Stage[] }
/**
 * Les faits dont l'entonnoir et le classement ont besoin. En production, ils viennent de fonctions de la base
 * qui ne renvoient ni nom, ni email, ni téléphone (migration 0022) : un media buyer peut donc les lire sans
 * jamais recevoir une coordonnée. Sans base reliée, ils sont dérivés de la mémoire, réduits aux mêmes colonnes.
 */
export async function facts(crm: Crm, opts: { tasks?: boolean } = {}): Promise<Facts> {
  if (crm.demo || !isSupabaseConfigured()) {
    const mem = new MemoryDb(demoTables(), null, demoBag());
    const [p, a, t, stages] = await Promise.all([mem.list<Prospect>("marketing_prospects"), mem.list<FactAppointment>("marketing_appointments"), mem.list<FactTask>("marketing_tasks"), ensureStages(mem).then(() => listStages(mem, { includeInactive: true }))]);
    return {
      prospects: p.map((x) => ({ id: x.id, created_at: x.created_at, opted_in_at: x.opted_in_at, source: x.source, site: x.site ?? null, landing_page: (x.landing_page ?? "").split("?")[0] || null, utm: x.utm, stage_id: x.stage_id ?? null, stage_changed_at: x.stage_changed_at ?? null,
        call_result: x.call_result ?? null, outcome: x.outcome ?? null, signed_amount: x.signed_amount ?? null, value: x.value ?? null, setter_id: x.setter_id ?? null, closer_id: x.closer_id ?? null })),
      appointments: a.map((x) => ({ id: x.id, prospect_id: x.prospect_id, starts_at: x.starts_at, created_at: x.created_at, status: x.status, result: x.result ?? null, source: x.source ?? null, setter_id: x.setter_id ?? null, closer_id: x.closer_id ?? null })),
      tasks: opts.tasks ? t.map((x) => ({ id: x.id, prospect_id: x.prospect_id, kind: x.kind, status: x.status, assignee_id: x.assignee_id, done_by: x.done_by, done_at: x.done_at, created_at: x.created_at })) : [],
      insights: [], stages,
    };
  }
  const sb = await createClient();
  const all = async <T,>(fn: string): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; from < 20_000; from += 1000) { const { data, error } = await sb.rpc(fn).range(from, from + 999); if (error) throw new Error(error.message); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break; }
    return out;
  };
  const [prospects, appointments, tasks, insights, stages] = await Promise.all([
    all<FactProspect>("marketing_funnel_prospects"), all<FactAppointment>("marketing_funnel_appointments"),
    opts.tasks ? all<FactTask>("marketing_funnel_tasks") : Promise.resolve([] as FactTask[]),
    crm.db.list<AdInsight>("marketing_ad_insights", { order: ["day", "asc"] }).catch(() => [] as AdInsight[]),
    listStages(crm.db, { includeInactive: true }),
  ]);
  return { prospects, appointments, tasks, insights: insights.map((i) => ({ ...i, spend: Number(i.spend) || 0 })), stages };
}
