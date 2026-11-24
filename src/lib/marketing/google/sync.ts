import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SupabaseDb } from "../db-supabase";
import type { MarketingRole, Member } from "../types";
import { GoogleAuthError, googleConfig, listCalendars, listEvents, refreshAccess } from "./api";
import { calendarRows, emptyGoogleCallStats, GOOGLE_SOURCE, importGoogleCalls, otherToolMatches, ownerCallRole, type GoogleCallLink, type GoogleCallStats } from "./calls-to-prospects";
import type { CalendarEvent, GoogleCalendarInfo, KnownAppointment } from "./core";
import { decrypt, encrypt, hasEncryptionKey } from "./crypto";

/** Ce que le navigateur a le droit de savoir d'un compte Google connecté : jamais le jeton. */
export interface GoogleAccountView { connected: boolean; email: string | null; status: "ok" | "invalide" | null; calendars: GoogleCalendarInfo[]; lastSync: string | null; lastError: string | null }
interface AccountRow { id: string; profile_id: string; google_email: string | null; refresh_token_enc: string; status: "ok" | "invalide"; calendars: GoogleCalendarInfo[] | null; last_sync_at: string | null; last_error: string | null }
const NONE: GoogleAccountView = { connected: false, email: null, status: null, calendars: [], lastSync: null, lastError: null };
const view = (r: AccountRow | null): GoogleAccountView => (r ? { connected: true, email: r.google_email, status: r.status, calendars: r.calendars ?? [], lastSync: r.last_sync_at, lastError: r.last_error } : NONE);

export const WINDOW_BACK_DAYS = 14, WINDOW_AHEAD_DAYS = 45;
export const googleReady = () => !!googleConfig() && hasEncryptionKey() && isSupabaseConfigured();
/** Variables attendues pour Google : seulement « lue » ou « manquante », jamais la valeur. */
export function googleEnv(): Array<{ name: string; read: boolean }> {
  const has = (n: string) => !!(process.env[n] ?? "").trim();
  return [{ name: "GOOGLE_CLIENT_ID", read: has("GOOGLE_CLIENT_ID") }, { name: "GOOGLE_CLIENT_SECRET", read: has("GOOGLE_CLIENT_SECRET") }, { name: "MARKETING_ENCRYPTION_KEY", read: hasEncryptionKey() }];
}

async function row(profileId: string): Promise<AccountRow | null> {
  const a = createAdminClient(); if (!a) return null;
  const { data } = await a.from("marketing_google_accounts").select("*").eq("profile_id", profileId).maybeSingle();
  return (data as AccountRow) ?? null;
}
export async function myGoogleAccount(profileId: string): Promise<GoogleAccountView> { return isSupabaseConfigured() ? view(await row(profileId)) : NONE; }

/** Fin de la connexion : le jeton de renouvellement est chiffré avant d'être stocké. */
export async function saveGoogleConnection(profileId: string, input: { refreshToken: string; email: string | null; calendars: GoogleCalendarInfo[] }): Promise<void> {
  const a = createAdminClient(); if (!a) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  const { error } = await a.from("marketing_google_accounts").upsert({ profile_id: profileId, google_email: input.email, refresh_token_enc: encrypt(input.refreshToken), status: "ok", calendars: input.calendars, last_error: null }, { onConflict: "profile_id" });
  if (error) throw new Error(error.message);
}
export async function setGoogleCalendars(profileId: string, selected: string[]): Promise<void> {
  const a = createAdminClient(), r = await row(profileId); if (!a || !r) throw new Error("Aucun compte Google connecté.");
  const calendars = (r.calendars ?? []).map((c) => ({ ...c, selected: selected.includes(c.id) }));
  await a.from("marketing_google_accounts").update({ calendars }).eq("id", r.id);
  // Un agenda décoché disparaît tout de suite de l'affichage.
  const keep = calendars.filter((c) => c.selected).map((c) => c.id);
  let del = a.from("marketing_calendar_events").delete().eq("account_id", r.id);
  if (keep.length) del = del.not("calendar_id", "in", `(${keep.map((k) => `"${k.replace(/"/g, "")}"`).join(",")})`);
  await del;
}
export async function disconnectGoogle(profileId: string): Promise<void> {
  const a = createAdminClient(); if (!a) return;
  await a.from("marketing_google_accounts").delete().eq("profile_id", profileId);   // les événements copiés partent avec (cascade)
}

interface TeamRow { id: string; email: string | null; display_name: string | null; role: string; permissions: unknown; marketing_role: string | null; disabled_at: string | null }
export interface GoogleSyncResult { ok: boolean; events: number; error?: string; imported?: GoogleCallStats }
/** Temps laissé à l'import des appels d'un compte, par passage : le reste est repris au passage suivant (dix minutes). */
const IMPORT_BUDGET_MS = 12_000, IMPORT_MAX_CREATES = 40;

/** Journal de l'import des appels (marketing_source_runs, source « google ») : seulement ce qui a changé quelque chose, ou échoué. */
async function journalCalls(a: NonNullable<ReturnType<typeof createAdminClient>>, stats: GoogleCallStats, startedAt: string): Promise<void> {
  if (!stats.created && !stats.updated && !stats.cancelled && !stats.errors.length) return;
  const { error } = await a.from("marketing_source_runs").insert({ source: GOOGLE_SOURCE, mode: "api", ok: !stats.errors.length, stats: { ...stats, errors: stats.errors.slice(0, 5) }, error: stats.errors.length ? stats.errors.slice(0, 5).join(" · ") : null, started_at: startedAt, finished_at: new Date().toISOString() });
  if (error) console.error("[google] journal de l'import des appels :", error.message);
}

/**
 * Relit les agendas choisis d'un compte et remplace la copie locale sur la fenêtre. Lecture seule côté Google.
 * Chaque rendez-vous avec un invité extérieur devient un rendez-vous de l'app, rattaché à un prospect (voir
 * calls-to-prospects.ts) ; un échec de cet import ne fait jamais échouer la lecture de l'agenda.
 */
export async function syncGoogleAccount(r: AccountRow): Promise<GoogleSyncResult> {
  const a = createAdminClient(), cfg = googleConfig();
  if (!a || !cfg) return { ok: false, events: 0, error: "Google n'est pas configuré." };
  const now = Date.now(), window = { from: new Date(now - WINDOW_BACK_DAYS * 86_400_000).toISOString(), to: new Date(now + WINDOW_AHEAD_DAYS * 86_400_000).toISOString() };
  try {
    const access = await refreshAccess(cfg, decrypt(r.refresh_token_enc));
    const calendars = await listCalendars(access, r.calendars ?? []);
    const read = calendars.filter((x) => x.selected);
    const events: CalendarEvent[] = [];
    for (const c of read) events.push(...await listEvents(access, c, r.google_email, window));

    // Rapprochements : contact par l'email d'un invité, rendez-vous déjà reçu de l'outil de réservation.
    const emails = [...new Set(events.flatMap((e) => e.attendees))];
    const contactByEmail = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 150) {
      const { data } = await a.from("marketing_contacts").select("id, email").in("email", emails.slice(i, i + 150));
      for (const c of (data ?? []) as Array<{ id: string; email: string | null }>) if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
    }
    // L'équipe : emails des profils, et emails Google qu'ils ont reliés (un membre peut inviter depuis une autre adresse).
    const teamRes = await a.from("profiles").select("id, email, display_name, role, permissions, marketing_role, disabled_at").in("role", ["agency", "marketing"]);
    const people = (teamRes.data ?? []) as TeamRow[];
    const linked = (((await a.from("marketing_google_accounts").select("google_email")).data ?? []) as Array<{ google_email: string | null }>).map((x) => x.google_email);
    const team = new Set([...people.map((p) => p.email), ...linked].map((m) => (m ?? "").trim().toLowerCase()).filter(Boolean));
    const appts = (((await a.from("marketing_appointments").select("id, starts_at, contact_id, status").gte("starts_at", window.from).lte("starts_at", window.to).neq("source", GOOGLE_SOURCE)).data ?? []) as KnownAppointment[]);
    const matched = otherToolMatches(events, contactByEmail, team, appts);

    // Appels → Prospects. Équipe illisible : rien n'est créé (un collègue serait pris pour un invité extérieur).
    let links = new Map<string, GoogleCallLink>(), imported: GoogleCallStats | undefined;
    const startedAt = new Date().toISOString();
    try {
      const owner = people.find((p) => p.id === r.profile_id) ?? null;
      const members: Member[] = people.filter((p) => !p.disabled_at).map((p) => ({ id: p.id, name: p.display_name?.trim() || p.email || "Membre", email: p.email, admin: p.role === "agency" && p.permissions == null, sales: p.role === "marketing",
        marketing_role: (["setter", "closer", "media_buyer"].includes(p.marketing_role ?? "") ? p.marketing_role : null) as MarketingRole | null }));
      const res = await importGoogleCalls(new SupabaseDb(a, null), {
        accountId: r.id, owner: { id: r.profile_id, role: ownerCallRole(owner), active: !!owner && !owner.disabled_at }, events, teamEmails: team, matched,
        calendarsRead: read.map((c) => c.id), window, members, enabled: teamRes.error ? false : undefined, maxCreates: IMPORT_MAX_CREATES, deadline: Date.now() + IMPORT_BUDGET_MS,
      });
      links = res.links; imported = res.stats;
    } catch (e) {
      imported = { ...emptyGoogleCallStats(), errors: [`import des appels : ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`] };
    }
    if (imported.errors.length) console.error("[google] import des appels :", imported.errors.slice(0, 3).join(" · "));
    await journalCalls(a, imported, startedAt).catch(() => undefined);

    const rows = calendarRows(r, events, { contactByEmail, team, matched, links });
    await a.from("marketing_calendar_events").delete().eq("account_id", r.id);
    for (let i = 0; i < rows.length; i += 200) { const { error } = await a.from("marketing_calendar_events").insert(rows.slice(i, i + 200)); if (error) throw new Error(error.message); }
    await a.from("marketing_google_accounts").update({ calendars, status: "ok", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", r.id);
    return { ok: true, events: rows.length, imported };
  } catch (e) {
    const invalid = e instanceof GoogleAuthError && e.invalid;
    const message = invalid ? "L'accès à Google a été retiré ou a expiré : reconnecte ton compte." : (e instanceof Error ? e.message : String(e)).slice(0, 240);
    // Jeton invalide : on le dit au membre (« Reconnecter Google ») au lieu d'échouer en silence.
    await a.from("marketing_google_accounts").update({ status: invalid ? "invalide" : r.status, last_error: message }).eq("id", r.id);
    return { ok: false, events: 0, error: message };
  }
}
export async function syncMyGoogle(profileId: string): Promise<GoogleSyncResult> {
  const r = await row(profileId); if (!r) return { ok: false, events: 0, error: "Aucun compte Google connecté." };
  return syncGoogleAccount(r);
}
/** Planificateur : relit les comptes dont la copie date (dix minutes), quelques-uns par passage. */
export async function syncGoogleDue(opts: { maxAgeMs?: number; limit?: number } = {}): Promise<{ ran: number; failed: number }> {
  if (!googleReady()) return { ran: 0, failed: 0 };
  const a = createAdminClient(); if (!a) return { ran: 0, failed: 0 };
  const before = new Date(Date.now() - (opts.maxAgeMs ?? 10 * 60_000)).toISOString();
  const { data } = await a.from("marketing_google_accounts").select("*").eq("status", "ok").or(`last_sync_at.is.null,last_sync_at.lt.${before}`).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(opts.limit ?? 3);
  let failed = 0;
  for (const r of (data ?? []) as AccountRow[]) if (!(await syncGoogleAccount(r)).ok) failed++;
  return { ran: (data ?? []).length, failed };
}
/** Vue d'ensemble pour l'administrateur : qui a connecté Google, et dans quel état. */
export async function googleAccountsOverview(): Promise<Array<{ profile_id: string; email: string | null; status: string; lastSync: string | null }>> {
  if (!isSupabaseConfigured()) return [];
  const a = createAdminClient(); if (!a) return [];
  const { data } = await a.from("marketing_google_accounts").select("profile_id, google_email, status, last_sync_at");
  return ((data ?? []) as Array<{ profile_id: string; google_email: string | null; status: string; last_sync_at: string | null }>).map((r) => ({ profile_id: r.profile_id, email: r.google_email, status: r.status, lastSync: r.last_sync_at }));
}
