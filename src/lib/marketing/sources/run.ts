import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { systemDb } from "../crm-server";
import type { Db } from "../db";
import { teamForSystem } from "../team-system";
import { applyAll, emptyStats, type IngestStats } from "./ingest";
import { iclosedAdapter } from "./iclosed";
import type { SourceAdapter, SourceCursor } from "./types";

/** L'outil de réservation branché. Pour en changer : écrire un autre adaptateur et le renvoyer ici. */
export function bookingSource(): SourceAdapter { return iclosedAdapter(); }

export interface SourceState { cursor: SourceCursor; last_run_at: string | null; last_ok: boolean | null; last_error: string | null; last_stats: Partial<IngestStats> | null; more: boolean }
export interface SourceRun { ran: boolean; reason?: string; ok: boolean; stats: IngestStats; more: boolean; requests: number }
const EMPTY_STATE: SourceState = { cursor: {}, last_run_at: null, last_ok: null, last_error: null, last_stats: null, more: false };
const stateKey = (a: SourceAdapter) => `source:${a.source}`;
export const SYNC_EVERY_MS = 5 * 60_000;

export async function sourceState(db: Db, a: SourceAdapter = bookingSource()): Promise<SourceState> { return { ...EMPTY_STATE, ...((await db.setting<SourceState>(stateKey(a))) ?? {}) }; }

async function journal(mode: "api" | "webhook" | "manuel", a: SourceAdapter, ok: boolean, stats: IngestStats, error: string | null, startedAt: string) {
  if (!isSupabaseConfigured()) return;
  const admin = createAdminClient(); if (!admin) return;
  // On ne garde pas une ligne par passage « rien de nouveau » : seulement ce qui a changé quelque chose, ou échoué.
  if (ok && !stats.created && !stats.updated && !stats.leads && mode === "api") return;
  await admin.from("marketing_source_runs").insert({ source: a.source, mode, ok, stats, error, started_at: startedAt, finished_at: new Date().toISOString() });
}

/**
 * Synchronisation par l'API. Rejouable : relancer ne crée aucun doublon. `force` : lancer même si le dernier
 * passage date de moins de cinq minutes (bouton « Synchroniser maintenant »).
 */
export async function runBookingSync(opts: { force?: boolean; budgetMs?: number; mode?: "api" | "manuel" } = {}): Promise<SourceRun> {
  const a = bookingSource(), none: SourceRun = { ran: false, ok: true, stats: emptyStats(), more: false, requests: 0 };
  if (!a.configured()) return { ...none, reason: "ICLOSED_API_KEY manquante" };
  const db = systemDb(); if (!db) return { ...none, reason: "SUPABASE_SERVICE_ROLE_KEY manquante" };
  const state = await sourceState(db, a);
  const due = !state.last_run_at || state.more || Date.now() - Date.parse(state.last_run_at) >= SYNC_EVERY_MS;
  if (!opts.force && !due) return { ...none, reason: "pas encore l'heure" };

  const startedAt = new Date().toISOString();
  try {
    const pulled = await a.pull(state.cursor, Date.now() + (opts.budgetMs ?? 25_000));
    const stats = await applyAll(db, { source: a.source, label: a.label, members: await teamForSystem() }, pulled.bookings, pulled.leads);
    const ok = stats.errors.length === 0;
    // Si des lignes ont échoué, on ne déplace pas le repère : elles seront relues au prochain passage.
    await db.saveSetting(stateKey(a), { cursor: ok ? pulled.cursor : state.cursor, last_run_at: startedAt, last_ok: ok, last_error: ok ? null : stats.errors.slice(0, 3).join(" · "), last_stats: stats, more: ok ? pulled.more : true } satisfies SourceState);
    await journal(opts.mode ?? "api", a, ok, stats, ok ? null : stats.errors.slice(0, 5).join(" · "), startedAt);
    return { ran: true, ok, stats, more: pulled.more, requests: pulled.requests };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await db.saveSetting(stateKey(a), { ...state, last_run_at: startedAt, last_ok: false, last_error: message } satisfies SourceState).catch(() => {});
    await journal(opts.mode ?? "api", a, false, emptyStats(), message, startedAt);
    return { ran: true, ok: false, stats: { ...emptyStats(), errors: [message] }, more: state.more, requests: 0 };
  }
}

/** Notification reçue de l'outil : on ne croit pas son contenu, on relit par l'API les rendez-vous qu'elle désigne. */
export async function runBookingWebhook(body: unknown): Promise<SourceRun> {
  const a = bookingSource(), none: SourceRun = { ran: false, ok: true, stats: emptyStats(), more: false, requests: 0 };
  if (!a.configured()) return { ...none, reason: "ICLOSED_API_KEY manquante" };
  const db = systemDb(); if (!db) return { ...none, reason: "SUPABASE_SERVICE_ROLE_KEY manquante" };
  const { bookingIds, refresh } = a.parseWebhook(body);
  if (refresh || !bookingIds.length) return runBookingSync({ force: true, budgetMs: 4000, mode: "api" });
  const startedAt = new Date().toISOString();
  try {
    const stats = await applyAll(db, { source: a.source, label: a.label, members: await teamForSystem() }, await a.fetchBookings(bookingIds), []);
    await journal("webhook", a, stats.errors.length === 0, stats, stats.errors.slice(0, 5).join(" · ") || null, startedAt);
    return { ran: true, ok: stats.errors.length === 0, stats, more: false, requests: 1 };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await journal("webhook", a, false, emptyStats(), message, startedAt);
    return { ran: true, ok: false, stats: { ...emptyStats(), errors: [message] }, more: false, requests: 0 };
  }
}
