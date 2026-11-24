import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { canAccess } from "@/lib/permissions";
import { salesRole, systemDb, type Crm } from "./crm-server";
import { publicMarketingSettings, rateLimited } from "./public";
import { DEFAULT_MARKETING_SETTINGS } from "./types";
import {
  activePersonByToken, entryWindow, ENTRIES_TABLE, firstName, forDay, isKpiToken, isMissingTable, listPeople, MISSING_MIGRATION, parseEntryInput, PEOPLE_TABLE,
  personEntries, saveLinkEntry, todayIn, type KpiLinkName, type KpiLinkRole, type KpiPerson, type KpiPersonEntry, type OwnEntry,
} from "./kpi-links";

/*
 * Liens de saisie des KPI, côté serveur : qui gère, qui lit, et la page publique /kpi/<jeton>.
 * La logique (jeton, validation, écriture) est dans kpi-links.ts ; ici, les droits et l'accès aux données.
 */

/** Qui gère les liens (et voit les jetons) : un membre de l'agence avec « Réglages marketing », comme la base l'exige (0028). */
export const canManageKpiLinks = (crm: Crm) => !salesRole(crm.session) && crm.session.profile.role === "agency" && canAccess(crm.session.profile, "marketing_reglages");
/** Qui voit les saisies faites par lien : un membre de l'agence avec le droit KPI (comme le suivi quotidien de l'équipe). */
export const canSeeKpiLinkEntries = (crm: Crm) => !salesRole(crm.session) && crm.session.profile.role === "agency" && canAccess(crm.session.profile, "marketing_classement");

const missing = (e: unknown) => isMissingTable(e) || (e instanceof Error && e.message === MISSING_MIGRATION);

/** Personnes autorisées, avec leur jeton, pour la carte de gestion. `null` : la migration 0028 n'est pas appliquée. */
export async function managedKpiPeople(crm: Crm): Promise<KpiPerson[] | null> {
  if (!canManageKpiLinks(crm)) return [];
  try { return await listPeople(crm.db); } catch (e) { if (missing(e)) return null; throw e; }
}

/** Noms et rôles des personnes (sans jeton ni coordonnées). En production : la fonction marketing_kpi_link_people (0028). */
async function linkNames(crm: Crm): Promise<KpiLinkName[]> {
  if (crm.demo || !isSupabaseConfigured()) {
    return (await crm.db.list<KpiPerson>(PEOPLE_TABLE)).map(({ id, name, role, active, last_entry_at }) => ({ id, name, role, active, last_entry_at }));
  }
  const { data, error } = await (await createClient()).rpc("marketing_kpi_link_people");
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []) as KpiLinkName[];
}

/**
 * Saisies faites par lien depuis `fromDay`, avec le nom de chaque personne. Liste vide pour qui n'a pas le droit de les
 * voir (un commercial, un membre sans le droit KPI) ; `null` si la migration 0028 n'est pas appliquée.
 */
export async function kpiLinkData(crm: Crm, fromDay: string, limit = 2000): Promise<{ names: KpiLinkName[]; entries: KpiPersonEntry[] } | null> {
  if (!canSeeKpiLinkEntries(crm)) return { names: [], entries: [] };
  try {
    const [entries, names] = await Promise.all([
      crm.db.list<KpiPersonEntry>(ENTRIES_TABLE, { where: [["gte", "day", fromDay]], order: ["day", "desc"], limit }),
      linkNames(crm),
    ]);
    return { names, entries };
  } catch (e) { if (missing(e)) return null; throw e; }
}

/* ─────────────────────────── Page publique /kpi/<jeton> ─────────────────────────── */

export const GONE_MESSAGE = "Ce lien n'est plus actif. Demande un nouveau lien à ton responsable.";
const UNAVAILABLE = "La saisie n'est pas disponible pour le moment. Réessaie un peu plus tard.";
export type PublicKpiState =
  | { state: "ok"; firstName: string; role: KpiLinkRole; today: string; days: string[]; entries: OwnEntry[] }
  | { state: "gone" } | { state: "unavailable" };
export type PublicKpiResult = { ok: true; day: string; today: string; days: string[]; message: string; entries: OwnEntry[] } | { ok: false; error: string; gone?: boolean };

const own = (rows: KpiPersonEntry[]): OwnEntry[] => rows.map((r) => ({ day: r.day, metrics: r.metrics ?? {}, note: r.note ?? null }));
async function timezone(): Promise<string> { return (await publicMarketingSettings().catch(() => DEFAULT_MARKETING_SETTINGS)).timezone || DEFAULT_MARKETING_SETTINGS.timezone; }

/**
 * Données de la page du lien. Jeton mal formé, inconnu ou désactivé : la même réponse « plus actif », rien d'autre.
 * Lecture par la clé service (la personne n'a pas de compte), réduite à SES saisies des 8 derniers jours.
 */
export async function publicKpiPage(token: string, ip: string): Promise<PublicKpiState> {
  if (rateLimited(`kpi-page:${ip}`, 120, 60_000)) return { state: "unavailable" };
  if (!isKpiToken(token)) return { state: "gone" };
  const db = systemDb();
  if (!db) return { state: "unavailable" };
  try {
    const person = await activePersonByToken(db, token);
    if (!person) return { state: "gone" };
    const today = todayIn(await timezone()), days = entryWindow(today);
    return { state: "ok", firstName: firstName(person.name), role: person.role, today, days, entries: own(await personEntries(db, person.id, days[days.length - 1])) };
  } catch (e) {
    console.error("[kpi lien] lecture impossible :", e instanceof Error ? e.message : e);
    return { state: "unavailable" };
  }
}

/**
 * Envoi depuis le lien. Le jeton est revérifié à CHAQUE appel (actif, rôle), le débit est limité par adresse et par
 * jeton, la saisie est validée strictement (jour dans la fenêtre, champs du rôle, entiers de 0 à 10 000, montants de 0 à
 * 1 000 000 €), puis
 * écrite par la clé service. Sans base reliée : en mémoire.
 */
export async function submitPublicKpiEntry(token: unknown, raw: unknown, ip: string): Promise<PublicKpiResult> {
  if (rateLimited(`kpi-ip:${ip}`, 30, 60_000)) return { ok: false, error: "Trop d'envois d'un coup. Réessaie dans une minute." };
  if (!isKpiToken(token)) return { ok: false, gone: true, error: GONE_MESSAGE };
  if (rateLimited(`kpi-token:${token}`, 12, 60_000)) return { ok: false, error: "Trop d'envois d'un coup. Réessaie dans une minute." };
  const db = systemDb();
  if (!db) return { ok: false, error: UNAVAILABLE };
  try {
    const person = await activePersonByToken(db, token);
    if (!person) return { ok: false, gone: true, error: GONE_MESSAGE };
    const today = todayIn(await timezone()), days = entryWindow(today);
    let input;
    try { input = parseEntryInput(person.role, raw, days); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Vérifie les chiffres saisis." }; }
    await saveLinkEntry(db, person, input);
    return { ok: true, day: input.day, today, days, message: `C'est enregistré ${forDay(input.day, today)}.`, entries: own(await personEntries(db, person.id, days[days.length - 1])) };
  } catch (e) {
    console.error("[kpi lien] enregistrement impossible :", e instanceof Error ? e.message : e);
    return { ok: false, error: missing(e) ? UNAVAILABLE : "Enregistrement impossible pour le moment. Réessaie dans un instant." };
  }
}
