/**
 * Meta Ads — fonctions pures (aucune dépendance d'exécution) : conversion des « insights » de la Marketing API
 * en métriques hebdomadaires, construction des URL Graph et codage de l'état OAuth.
 *
 * Testable directement avec Node : `node --experimental-strip-types --test src/lib/integrations/meta-mapping.test.mjs`.
 * Les imports sont de type uniquement (effacés par Node) : ce fichier ne doit rien importer d'exécutable.
 */
import type { Metric } from "../data/types";

/** Version de la Marketing API utilisée par défaut (surchargeable par META_GRAPH_VERSION). */
export const DEFAULT_GRAPH_VERSION = "v21.0";
/** Permissions demandées à la connexion : lecture des comptes publicitaires et de leurs résultats. */
export const META_SCOPES = ["ads_read", "business_management"] as const;
/** Champs d'insights lus chaque semaine. */
export const INSIGHT_FIELDS = ["spend", "impressions", "clicks", "actions", "action_values", "video_thruplay_watched_actions"] as const;
/** Durée de validité d'un état OAuth (10 minutes). */
export const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/* ─── Types de la Graph API (sous-ensemble utilisé) ─────────────────────── */

export interface MetaActionValue { action_type: string; value: string | number }
export interface MetaInsightRow {
  date_start: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  video_thruplay_watched_actions?: MetaActionValue[];
}
export interface MetaInsightsResponse { data?: MetaInsightRow[]; paging?: { next?: string; cursors?: { after?: string } } }
export interface MetaAdAccount { id: string; account_id: string; name?: string; currency?: string }
export interface MetaGraphError { error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string } }

export type WeeklyMetric = Omit<Metric, "id">;

/* ─── Dates ─────────────────────────────────────────────────────────────── */

/** Date ISO (AAAA-MM-JJ) → lundi de sa semaine (ISO 8601), sans dépendre du fuseau du serveur. */
export function weekStart(dateIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso);
  if (!m) throw new Error(`Date invalide : ${dateIso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const offset = (d.getUTCDay() + 6) % 7; // lundi = 0 … dimanche = 6
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

/**
 * Fenêtre de synchronisation alignée sur les lundis : `weeks` semaines (la semaine en cours comprise) jusqu'à aujourd'hui.
 * Avec `time_increment=7`, Meta découpe alors exactement en semaines du lundi au dimanche.
 */
export function mondayWindow(today: Date, weeks = 13): { since: string; until: string } {
  const until = isoDate(today);
  const thisMonday = weekStart(until);
  const d = new Date(`${thisMonday}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 7 * Math.max(0, weeks - 1));
  return { since: isoDate(d), until };
}

/* ─── Conversion insights → métriques ───────────────────────────────────── */

const num = (v: string | number | undefined | null) => { const n = typeof v === "number" ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

/**
 * Achats : Meta renvoie souvent plusieurs types pour un même achat (omni_purchase agrège les canaux, purchase est la
 * variante historique, offsite_conversion.fb_pixel_purchase le pixel seul). Pour ne jamais compter deux fois,
 * on prend le premier type présent dans cet ordre de préférence.
 */
export const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"] as const;

/** Première valeur présente parmi `types` (ordre de préférence), 0 sinon. */
export function pickAction(list: MetaActionValue[] | undefined, types: readonly string[]): number {
  if (!Array.isArray(list)) return 0;
  for (const type of types) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return num(hit.value);
  }
  return 0;
}

/** Somme de toutes les valeurs d'une liste d'actions (ex. thruplays, un seul type `video_view`). */
export function sumActions(list: MetaActionValue[] | undefined): number {
  return Array.isArray(list) ? list.reduce((a, x) => a + num(x.value), 0) : 0;
}

/** Une ligne d'insights → les champs numériques d'une métrique (sans client ni période). */
export function rowToFigures(row: MetaInsightRow) {
  return {
    spend: num(row.spend),
    impressions: Math.round(num(row.impressions)),
    clicks: Math.round(num(row.clicks)),
    thruplays_3s: Math.round(sumActions(row.video_thruplay_watched_actions)),
    purchases: Math.round(pickAction(row.actions, PURCHASE_TYPES)),
    revenue: pickAction(row.action_values, PURCHASE_TYPES),
  };
}

/**
 * Réponse insights (une ligne par fenêtre de 7 jours) → métriques « compte entier » par semaine (period_start = lundi).
 * Deux lignes tombant dans la même semaine sont additionnées ; le résultat est trié par semaine.
 */
export function metricsFromInsights(rows: MetaInsightRow[] | MetaInsightsResponse, clientId: string): WeeklyMetric[] {
  const list = Array.isArray(rows) ? rows : rows.data ?? [];
  const byWeek = new Map<string, WeeklyMetric>();
  for (const row of list) {
    if (!row || typeof row.date_start !== "string") continue;
    const period_start = weekStart(row.date_start);
    const f = rowToFigures(row);
    const cur = byWeek.get(period_start) ?? { client_id: clientId, livrable_id: null, period_start, spend: 0, impressions: 0, clicks: 0, thruplays_3s: 0, purchases: 0, revenue: 0 };
    cur.spend = round2(cur.spend + f.spend); cur.impressions += f.impressions; cur.clicks += f.clicks;
    cur.thruplays_3s += f.thruplays_3s; cur.purchases += f.purchases; cur.revenue = round2(cur.revenue + f.revenue);
    byWeek.set(period_start, cur);
  }
  return [...byWeek.values()].sort((a, b) => a.period_start.localeCompare(b.period_start));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─── URL Graph API ─────────────────────────────────────────────────────── */

export const graphBase = (version: string) => `https://graph.facebook.com/${version}`;

export function authorizeUrl(p: { version: string; appId: string; redirectUri: string; state: string; scopes?: readonly string[] }) {
  const u = new URL(`https://www.facebook.com/${p.version}/dialog/oauth`);
  u.searchParams.set("client_id", p.appId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (p.scopes ?? META_SCOPES).join(","));
  return u.toString();
}

export function tokenExchangeUrl(p: { version: string; appId: string; appSecret: string; redirectUri: string; code: string }) {
  const u = new URL(`${graphBase(p.version)}/oauth/access_token`);
  u.searchParams.set("client_id", p.appId);
  u.searchParams.set("client_secret", p.appSecret);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("code", p.code);
  return u.toString();
}

export function longLivedTokenUrl(p: { version: string; appId: string; appSecret: string; token: string }) {
  const u = new URL(`${graphBase(p.version)}/oauth/access_token`);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", p.appId);
  u.searchParams.set("client_secret", p.appSecret);
  u.searchParams.set("fb_exchange_token", p.token);
  return u.toString();
}

export function adAccountsUrl(version: string) {
  const u = new URL(`${graphBase(version)}/me/adaccounts`);
  u.searchParams.set("fields", "name,account_id,currency");
  u.searchParams.set("limit", "100");
  return u.toString();
}

/** Insights hebdomadaires d'un compte (`accountId` sans le préfixe act_, accepté quand même). */
export function insightsUrl(p: { version: string; accountId: string; since: string; until: string }) {
  const id = p.accountId.startsWith("act_") ? p.accountId : `act_${p.accountId}`;
  const u = new URL(`${graphBase(p.version)}/${id}/insights`);
  u.searchParams.set("fields", INSIGHT_FIELDS.join(","));
  u.searchParams.set("level", "account");
  u.searchParams.set("time_increment", "7");
  u.searchParams.set("time_range", JSON.stringify({ since: p.since, until: p.until }));
  u.searchParams.set("limit", "100");
  return u.toString();
}

/** Message français d'une erreur Graph (jeton expiré, permission manquante, compte inaccessible…). */
export function humanMetaError(body: MetaGraphError | null | undefined, status?: number): string {
  const e = body?.error;
  if (e?.code === 190) return "La connexion Meta a expiré. Reconnecte le compte publicitaire.";
  if (e?.code === 10 || e?.code === 200 || e?.code === 294) return "Meta refuse l'accès : vérifie que le compte connecté a un rôle sur ce compte publicitaire et que l'app a la permission ads_read.";
  if (e?.code === 4 || e?.code === 17 || e?.code === 32 || e?.code === 613) return "Meta limite temporairement les appels. Réessaie dans quelques minutes.";
  if (e?.error_user_msg) return e.error_user_msg;
  if (e?.message) return `Meta : ${e.message}`;
  if (status && status >= 500) return "Meta est momentanément indisponible. Réessaie plus tard.";
  return "Réponse inattendue de Meta.";
}

/* ─── État OAuth signé ──────────────────────────────────────────────────── */

export interface OAuthStatePayload { c: string; u: string; t: number }
export type Signer = (data: string) => string;

const b64url = {
  encode: (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode: (s: string) => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

/** État = payload base64url + "." + signature. `sign` est un HMAC fourni par le serveur (secret de l'app Meta). */
export function encodeState(payload: OAuthStatePayload, sign: Signer): string {
  const body = b64url.encode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Vérifie signature, fraîcheur et, si fourni, l'égalité avec la valeur posée en cookie (double contrôle).
 * Retourne le payload ou la raison du refus.
 */
export function decodeState(state: string | null | undefined, sign: Signer, opts: { now?: number; cookie?: string | null; maxAgeMs?: number } = {}): { ok: true; payload: OAuthStatePayload } | { ok: false; reason: "absent" | "forme" | "signature" | "expire" | "cookie" } {
  if (!state) return { ok: false, reason: "absent" };
  const dot = state.indexOf(".");
  if (dot <= 0 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state)) return { ok: false, reason: "forme" };
  const body = state.slice(0, dot), sig = state.slice(dot + 1);
  if (!constantTimeEqual(sign(body), sig)) return { ok: false, reason: "signature" };
  if (opts.cookie !== undefined && (!opts.cookie || !constantTimeEqual(opts.cookie, state))) return { ok: false, reason: "cookie" };
  let payload: OAuthStatePayload;
  try { payload = JSON.parse(b64url.decode(body)) as OAuthStatePayload; } catch { return { ok: false, reason: "forme" }; }
  if (typeof payload?.c !== "string" || typeof payload.u !== "string" || typeof payload.t !== "number") return { ok: false, reason: "forme" };
  const now = opts.now ?? Date.now();
  if (now - payload.t > (opts.maxAgeMs ?? STATE_MAX_AGE_MS) || payload.t - now > 60_000) return { ok: false, reason: "expire" };
  return { ok: true, payload };
}

/** Comparaison sans court-circuit (les deux chaînes sont parcourues entièrement). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
