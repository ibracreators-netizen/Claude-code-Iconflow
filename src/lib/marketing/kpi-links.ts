/**
 * Liens de saisie des KPI (migration 0028) : un lien personnel et permanent par commercial, sans compte.
 * La personne ouvre /kpi/<jeton> sur son téléphone et saisit ses chiffres du jour ; ils arrivent dans
 * KPI › Suivi du jour et dans le Tableau de bord, à côté de ceux des membres.
 *
 * Ici : le jeton (tiré par crypto), la validation des champs (zod), la fenêtre des jours, et les lectures et
 * écritures contre l'interface `Db` (base en production, mémoire sans base). Aucune dépendance serveur :
 * ce module sert aux server actions, aux pages et au script de vérification hors ligne.
 */
import { z } from "zod";
import type { Db } from "./db";
import { cleanText } from "./payments";
import { KPI_FIELDS, KPI_MAX_COUNT, kpiValueError, type KpiField } from "./types";

export type KpiLinkRole = "setter" | "closer";
export const KPI_LINK_ROLE: Record<KpiLinkRole, string> = { setter: "Setter", closer: "Closer" };
/** Personne autorisée à saisir ses KPI par un lien. Le jeton n'est lu que par qui gère l'espace. */
export interface KpiPerson {
  id: string; name: string; email: string | null; phone: string | null; role: KpiLinkRole; token: string; active: boolean;
  created_by: string | null; created_at: string; updated_at: string; last_entry_at: string | null;
}
/** Ce que les KPI et le tableau de bord affichent d'une personne : jamais le jeton ni les coordonnées. */
export interface KpiLinkName { id: string; name: string; role: KpiLinkRole; active: boolean; last_entry_at: string | null }
/** Une saisie par personne et par jour. */
export interface KpiPersonEntry { id: string; person_id: string; day: string; metrics: Record<string, number>; note: string | null; created_at: string; updated_at: string }
/** Ce que la page du lien reçoit de ses propres saisies : le jour, les chiffres, la remarque. */
export type OwnEntry = Pick<KpiPersonEntry, "day" | "metrics" | "note">;

export const PEOPLE_TABLE = "marketing_kpi_people";
export const ENTRIES_TABLE = "marketing_kpi_person_entries";
/** Plus grand nombre accepté pour un indicateur compté (un montant en euros va jusqu'à KPI_MAX_EURO, voir types.ts). */
export const KPI_LINK_MAX = KPI_MAX_COUNT;
/** Jours que l'on peut encore saisir ou corriger : aujourd'hui, hier… jusqu'à 7 jours en arrière. */
export const KPI_LINK_DAYS_BACK = 7;
/** Jeton : 32 à 128 caractères sûrs dans une adresse (la base vérifie la même règle). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/* ─────────────────────────── Jeton ─────────────────────────── */

/** 32 octets aléatoires (Web Crypto), écrits en base64url : 43 caractères, impossibles à deviner. */
export function newKpiToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const isKpiToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);
/** Chemin public du lien. L'adresse complète se construit avec l'origine du site, comme les liens de partage de Studio. */
export const kpiLinkPath = (token: string) => `/kpi/${token}`;

/* ─────────────────────────── Personne : validation ─────────────────────────── */

const optionalText = (max: number, message: string) => z.string().nullish()
  .transform((v) => cleanText(v ?? "") || null)
  .refine((v) => v === null || v.length <= max, message);
const personSchema = z.object({
  name: z.string({ error: "Donne un nom." }).transform((s) => cleanText(s))
    .refine((s) => s.length >= 1, "Donne un nom.").refine((s) => s.length <= 120, "Le nom fait 120 caractères au plus."),
  role: z.enum(["setter", "closer"], { error: "Choisis Setter ou Closer." }),
  email: optionalText(254, "L'e-mail est trop long.").refine((v) => v === null || z.email().safeParse(v).success, "Cette adresse e-mail n'est pas valide."),
  phone: optionalText(40, "Le téléphone fait 40 caractères au plus.").refine((v) => v === null || /^[+0-9 ().-]{4,40}$/.test(v), "Le téléphone ne doit contenir que des chiffres, des espaces et « + »."),
});
export type PersonInput = z.infer<typeof personSchema>;
/** Nom, rôle, e-mail et téléphone d'une personne, nettoyés. Lève une erreur en français au premier champ invalide. */
export function parsePersonInput(raw: unknown): PersonInput {
  const r = personSchema.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Vérifie les champs.");
  return { ...r.data, email: r.data.email?.toLowerCase() ?? null };
}
/** Prénom affiché (« Bonjour Julie », « Envoie ce lien à Julie »). */
export const firstName = (name: string) => cleanText(name).split(" ")[0] || cleanText(name);

/* ─────────────────────────── Jours ─────────────────────────── */

/** Jour civil (AAAA-MM-JJ) dans un fuseau. Fuseau inconnu : Europe/Paris. */
export function todayIn(timezone: string, now = new Date()): string {
  try { return new Intl.DateTimeFormat("fr-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
}
/** Décale un jour civil de `delta` jours (calcul sur la date seule, sans heure ni fuseau). */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
/** Jours proposés, du plus récent au plus ancien : aujourd'hui, hier… jusqu'à 7 jours en arrière. */
export const entryWindow = (today: string, back = KPI_LINK_DAYS_BACK) => Array.from({ length: back + 1 }, (_, i) => shiftDay(today, -i));
/** « Aujourd'hui », « Hier », puis « Lun. 17 nov. ». */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  if (day === shiftDay(today, -1)) return "Hier";
  const t = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** « pour aujourd'hui », « pour hier », « pour le lundi 17 novembre ». */
export function forDay(day: string, today: string): string {
  if (day === today) return "pour aujourd'hui";
  if (day === shiftDay(today, -1)) return "pour hier";
  return `pour le ${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}`;
}

/** Dernière saisie : « jamais », « à l'instant », « il y a 2 h », « il y a 3 j », puis la date courte. */
export function sinceLabel(iso: string | null | undefined, timezone: string, now = Date.now()): string {
  if (!iso) return "jamais";
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(min)) return "jamais";
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  try { return `le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: timezone }).format(new Date(iso))}`; }
  catch { return `le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(iso))}`; }
}

/* ─────────────────────────── Saisie : validation stricte ─────────────────────────── */

export const kpiFieldsFor = (role: KpiLinkRole): KpiField[] => KPI_FIELDS[role];
/** Une valeur d'indicateur : même règle que la saisie d'un membre (kpiValueError, types.ts). */
const valueOf = (f: KpiField) => z.unknown().superRefine((v, ctx) => { const e = kpiValueError(f, v); if (e) ctx.addIssue({ code: "custom", message: e }); }).transform((v) => v as number);
export interface EntryInput { day: string; metrics: Record<string, number>; note: string | null }
/**
 * Saisie envoyée depuis le lien : le jour doit être dans la fenêtre ; seuls les indicateurs du rôle sont acceptés
 * (un champ inconnu fait refuser l'envoi) ; chaque valeur est un entier de 0 à 10 000, ou un montant en euros entiers
 * de 0 à 1 000 000 ; au-delà, l'envoi est refusé avec un message clair. Une case laissée vide vaut 0.
 */
export function parseEntryInput(role: KpiLinkRole, raw: unknown, window: string[]): EntryInput {
  const fields = kpiFieldsFor(role);
  const schema = z.strictObject({
    day: z.string({ error: "Choisis un jour." }).refine((d) => window.includes(d), "Ce jour ne peut plus être saisi : choisis un jour de la semaine passée."),
    metrics: z.strictObject(Object.fromEntries(fields.map((f) => [f.key, valueOf(f).optional()])), "Un indicateur inconnu a été envoyé. Recharge la page."),
    note: z.string().nullish().transform((v) => cleanText(v ?? "", true) || null)
      .refine((v) => v === null || v.length <= 1000, "La remarque fait 1000 caractères au plus."),
  }, "Envoi invalide. Recharge la page.");
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Vérifie les chiffres saisis.");
  const m = r.data.metrics as Record<string, number | undefined>;
  return { day: r.data.day, note: r.data.note, metrics: Object.fromEntries(fields.map((f) => [f.key, m[f.key] ?? 0])) };
}

/* ─────────────────────────── Base : lectures et écritures ─────────────────────────── */

/** Table absente (migration 0028 non appliquée) : message clair plutôt qu'une erreur technique. */
export function isMissingTable(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e), code = (e as { code?: string })?.code;
  return code === "42P01" || code === "PGRST205" || code === "42883" || code === "PGRST202" || /does not exist|Could not find the (table|function)/i.test(m);
}
export const MISSING_MIGRATION = "Les liens de saisie demandent la migration 0028 de la base. Demande à l'administrateur de la passer.";
const friendly = (e: unknown): never => { if (isMissingTable(e)) throw new Error(MISSING_MIGRATION); throw e; };
const isDuplicate = (e: unknown) => /23505|duplicate key/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as { message?: string })?.message ?? e}`);

export async function listPeople(db: Db): Promise<KpiPerson[]> {
  return db.list<KpiPerson>(PEOPLE_TABLE, { order: ["created_at", "asc"], limit: 500 }).catch(friendly);
}
export async function createPerson(db: Db, raw: unknown, actor: string | null): Promise<KpiPerson> {
  const input = parsePersonInput(raw);
  // Un jeton déjà pris est hautement improbable (2^256 tirages) : on retire une fois, par principe.
  for (let i = 0; ; i++) {
    try { return await db.insert<KpiPerson>(PEOPLE_TABLE, { ...input, token: newKpiToken(), active: true, created_by: actor }); }
    catch (e) { if (i === 0 && isDuplicate(e)) continue; return friendly(e); }
  }
}
export async function updatePerson(db: Db, id: string, raw: unknown): Promise<KpiPerson> {
  const input = parsePersonInput(raw);
  return db.update<KpiPerson>(PEOPLE_TABLE, id, { ...input, updated_at: new Date().toISOString() }).catch(friendly);
}
/** Nouveau lien : un nouveau jeton remplace l'ancien, qui cesse aussitôt de marcher. */
export async function renewToken(db: Db, id: string): Promise<KpiPerson> {
  return db.update<KpiPerson>(PEOPLE_TABLE, id, { token: newKpiToken(), updated_at: new Date().toISOString() }).catch(friendly);
}
export async function setPersonActive(db: Db, id: string, active: boolean): Promise<KpiPerson> {
  return db.update<KpiPerson>(PEOPLE_TABLE, id, { active, updated_at: new Date().toISOString() }).catch(friendly);
}
/** Supprime la personne et ses saisies (la base le fait aussi, en cascade). */
export async function deletePerson(db: Db, id: string): Promise<void> {
  await db.removeWhere(ENTRIES_TABLE, [["eq", "person_id", id]]).catch(friendly);
  await db.remove(PEOPLE_TABLE, id).catch(friendly);
}

/**
 * Supprime une saisie faite par lien, puis recalcule la « dernière saisie » de la personne (la plus récente qui reste).
 * Renvoie false si la saisie n'existe plus.
 */
export async function deletePersonEntry(db: Db, entryId: string): Promise<boolean> {
  const row = await db.get<KpiPersonEntry>(ENTRIES_TABLE, entryId).catch(friendly);
  if (!row) return false;
  await db.remove(ENTRIES_TABLE, entryId).catch(friendly);
  const [latest] = await db.list<KpiPersonEntry>(ENTRIES_TABLE, { where: [["eq", "person_id", row.person_id]], order: ["updated_at", "desc"], limit: 1 }).catch(friendly);
  await db.update<KpiPerson>(PEOPLE_TABLE, row.person_id, { last_entry_at: latest?.updated_at ?? null }).catch(() => null);
  return true;
}

/** Personne active qui porte ce jeton, ou null (jeton mal formé, inconnu ou désactivé : même réponse). */
export async function activePersonByToken(db: Db, token: unknown): Promise<KpiPerson | null> {
  if (!isKpiToken(token)) return null;
  const [p] = await db.list<KpiPerson>(PEOPLE_TABLE, { where: [["eq", "token", token]], limit: 1 });
  // Comparaison exacte en plus du filtre : jamais une autre ligne que celle de ce jeton.
  return p && p.token === token && p.active && (p.role === "setter" || p.role === "closer") ? p : null;
}
/** Saisies d'une personne, du jour `fromDay` à aujourd'hui (les siennes seulement). */
export async function personEntries(db: Db, personId: string, fromDay: string): Promise<KpiPersonEntry[]> {
  return db.list<KpiPersonEntry>(ENTRIES_TABLE, { where: [["eq", "person_id", personId], ["gte", "day", fromDay]], order: ["day", "desc"], limit: 60 });
}
/** Enregistre (ou remplace) la saisie du jour, puis la date de dernière saisie de la personne. */
export async function saveLinkEntry(db: Db, person: KpiPerson, input: EntryInput, now = new Date()): Promise<KpiPersonEntry> {
  const stamp = now.toISOString();
  const find = async () => (await db.list<KpiPersonEntry>(ENTRIES_TABLE, { where: [["eq", "person_id", person.id], ["eq", "day", input.day]], limit: 1 }))[0] ?? null;
  const patch = { metrics: input.metrics, note: input.note, updated_at: stamp };
  let existing = await find(), row: KpiPersonEntry;
  if (existing) row = await db.update<KpiPersonEntry>(ENTRIES_TABLE, existing.id, patch);
  else {
    try { row = await db.insert<KpiPersonEntry>(ENTRIES_TABLE, { person_id: person.id, day: input.day, ...patch }); }
    catch (e) {
      // Deux envois au même instant (double appui) : le second met à jour la ligne que le premier vient de créer.
      if (!isDuplicate(e) || !(existing = await find())) throw e;
      row = await db.update<KpiPersonEntry>(ENTRIES_TABLE, existing.id, patch);
    }
  }
  await db.update(PEOPLE_TABLE, person.id, { last_entry_at: stamp });
  return row;
}

/* ─────────────────────────── Tableau de bord ─────────────────────────── */

/** Indicateurs déclarés, setters puis closers (même ordre que les formulaires de saisie). */
export const DECLARED_FIELDS: KpiField[] = [...KPI_FIELDS.setter, ...KPI_FIELDS.closer];
/** Somme de chaque indicateur sur des saisies (membres et liens). Les valeurs non numériques sont ignorées. */
export function declaredTotals(entries: Array<{ metrics: Record<string, unknown> | null }>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(DECLARED_FIELDS.map((f) => [f.key, 0]));
  for (const e of entries) for (const f of DECLARED_FIELDS) { const n = Number(e.metrics?.[f.key]); if (Number.isFinite(n) && n > 0) out[f.key] += Math.round(n); }
  return out;
}
