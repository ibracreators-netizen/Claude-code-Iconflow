import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL } from "@/lib/supabase/env";
import type { DataStore } from "@/lib/data/store";
import type { Integration } from "@/lib/data/types";
import {
  DEFAULT_GRAPH_VERSION, adAccountsUrl, humanMetaError, insightsUrl, longLivedTokenUrl, metricsFromInsights, mondayWindow, tokenExchangeUrl,
  type MetaAdAccount, type MetaGraphError, type MetaInsightRow, type MetaInsightsResponse, type Signer, type WeeklyMetric,
} from "./meta-mapping";

/**
 * Meta Ads côté serveur : configuration, appels à la Graph API, synchronisation des insights.
 * Le jeton d'accès ne quitte jamais ce module autrement que vers la base (saveIntegration) ; rien n'est renvoyé au navigateur.
 */

/** Cookie court (10 min, httpOnly) qui double l'état OAuth signé. */
export const META_STATE_COOKIE = "iconflow_meta_state";
export const META_COOKIE_PATH = "/api/integrations/meta";

export interface MetaConfig { appId: string; appSecret: string; redirectUri: string; version: string }

/** Configuration lue dans l'environnement, ou null si l'app Meta n'est pas renseignée (la carte du tableau de bord l'explique). */
export function metaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const envVersion = process.env.META_GRAPH_VERSION?.trim() ?? "";
  const version = /^v\d{1,2}\.\d{1,2}$/.test(envVersion) ? envVersion : DEFAULT_GRAPH_VERSION;
  const redirectUri = process.env.META_REDIRECT_URL?.trim() || `${APP_URL.replace(/\/+$/, "")}/api/integrations/meta/callback`;
  return { appId, appSecret, redirectUri, version };
}

export const isMetaConfigured = () => metaConfig() !== null;

/** Signature HMAC-SHA256 de l'état OAuth avec le secret de l'app (hex). */
export function stateSigner(secret: string): Signer {
  return (data) => createHmac("sha256", secret).update(data).digest("hex");
}

export class MetaApiError extends Error {
  constructor(message: string, public status?: number, public code?: number) { super(message); this.name = "MetaApiError"; }
}

/** Appel Graph : jeton en en-tête (jamais dans l'URL ni les journaux), délai borné, erreurs traduites. */
async function graph<T>(url: string, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : undefined, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch (e) {
    throw new MetaApiError(/abort|timeout/i.test(String(e)) ? "Meta ne répond pas (délai dépassé)." : "Impossible de joindre Meta (réseau).");
  }
  const body = (await res.json().catch(() => null)) as (T & MetaGraphError) | null;
  if (!res.ok || body?.error) throw new MetaApiError(humanMetaError(body, res.status), res.status, body?.error?.code);
  if (!body) throw new MetaApiError("Réponse vide de Meta.");
  return body;
}

interface TokenResponse { access_token: string; token_type?: string; expires_in?: number }

/** Code d'autorisation → jeton court (≈ 1 h). */
export function exchangeCode(cfg: MetaConfig, code: string): Promise<TokenResponse> {
  return graph<TokenResponse>(tokenExchangeUrl({ ...cfg, code }));
}

/** Jeton court → jeton longue durée (≈ 60 jours), renouvelable tant qu'il est valide. */
export function exchangeLongLived(cfg: MetaConfig, token: string): Promise<TokenResponse> {
  return graph<TokenResponse>(longLivedTokenUrl({ ...cfg, token }));
}

/** Date d'expiration ISO à partir de `expires_in` (secondes), ou null si Meta ne la donne pas. */
export function tokenExpiry(expiresIn: number | undefined, now = Date.now()): string | null {
  return typeof expiresIn === "number" && expiresIn > 0 ? new Date(now + expiresIn * 1000).toISOString() : null;
}

/** Comptes publicitaires visibles par le compte connecté (toutes les pages, au plus 5 × 100). */
export async function listAdAccounts(cfg: MetaConfig, token: string): Promise<MetaAdAccount[]> {
  const out: MetaAdAccount[] = [];
  let url: string | undefined = adAccountsUrl(cfg.version);
  for (let page = 0; url && page < 5; page++) {
    const body: { data?: MetaAdAccount[]; paging?: { next?: string } } = await graph(url, token);
    out.push(...(body.data ?? []).filter((a) => typeof a?.account_id === "string"));
    url = body.paging?.next;
  }
  return out;
}

/** Insights hebdomadaires d'un compte sur la fenêtre donnée (pagination suivie). */
export async function fetchInsights(cfg: MetaConfig, token: string, accountId: string, window: { since: string; until: string }): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  let url: string | undefined = insightsUrl({ version: cfg.version, accountId, ...window });
  for (let page = 0; url && page < 10; page++) {
    const body: MetaInsightsResponse = await graph(url, token);
    rows.push(...(body.data ?? []));
    url = body.paging?.next;
  }
  return rows;
}

/** Où écrire le résultat d'une synchronisation : le magasin de la session (action) ou la clé service (cron). */
export interface MetricsSink {
  upsertMetric(row: WeeklyMetric): Promise<unknown>;
  updateIntegration(id: string, patch: { last_sync_at?: string | null; last_error?: string | null }): Promise<unknown>;
}

export interface SyncResult { weeks: number; since: string; until: string }

/**
 * Lit 13 semaines d'insights (semaine en cours comprise) et enregistre une métrique « compte entier » par lundi.
 * Succès : last_sync_at mis à jour et last_error effacé ; échec : last_error renseigné puis l'erreur est relancée.
 */
export async function syncMetaIntegration(cfg: MetaConfig, integration: Pick<Integration, "id" | "client_id" | "account_id">, token: string, sink: MetricsSink, now = new Date()): Promise<SyncResult> {
  const window = mondayWindow(now, 13);
  try {
    const rows = await fetchInsights(cfg, token, integration.account_id, window);
    const metrics = metricsFromInsights(rows, integration.client_id);
    for (const m of metrics) await sink.upsertMetric(m);
    await sink.updateIntegration(integration.id, { last_sync_at: now.toISOString(), last_error: null });
    return { weeks: metrics.length, ...window };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sink.updateIntegration(integration.id, { last_error: message.slice(0, 300) }).catch(() => undefined);
    throw e;
  }
}

/** Écritures via le magasin de la session (RLS : administrateur à accès complet). */
export function storeSink(store: DataStore): MetricsSink {
  return { upsertMetric: (row) => store.upsertMetric(row), updateIntegration: (id, patch) => store.updateIntegration(id, patch) };
}

/**
 * Écritures via la clé service (synchronisation planifiée, sans session).
 * Pour Postgres, deux NULL sont distincts dans une contrainte unique : la ligne « compte entier » de la semaine est donc
 * retrouvée à la main avant d'être mise à jour, afin qu'une synchronisation quotidienne n'empile jamais de doublons.
 */
export function adminSink(admin: SupabaseClient): MetricsSink {
  const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  return {
    async upsertMetric(row) {
      const { data: existing, error } = await admin.from("metrics").select("id").eq("client_id", row.client_id).eq("period_start", row.period_start).is("livrable_id", null).limit(1).maybeSingle();
      fail(error);
      const res = existing?.id ? await admin.from("metrics").update(row).eq("id", existing.id) : await admin.from("metrics").insert(row);
      fail(res.error);
    },
    async updateIntegration(id, patch) {
      const { error } = await admin.from("integrations").update(patch).eq("id", id);
      fail(error);
    },
  };
}

/** Raisons d'échec du parcours OAuth (paramètre `?meta=erreur=<raison>` du tableau de bord) → phrase affichée. */
export const META_FLOW_ERRORS: Record<string, string> = {
  config: "La connexion Meta n'est pas configurée : renseigne META_APP_ID et META_APP_SECRET sur l'hébergeur.",
  droits: "Seul un administrateur à accès complet peut connecter un compte Meta.",
  client: "Client introuvable : la connexion n'a pas été lancée.",
  annule: "Connexion annulée sur Meta. Rien n'a été modifié.",
  refus: "Meta a refusé la connexion. Vérifie que ton compte a accès à l'app et réessaie.",
  etat: "Le lien de retour n'est plus valide (il expire après 10 minutes). Relance la connexion depuis le tableau de bord.",
  code: "Meta n'a pas renvoyé de code d'autorisation. Réessaie.",
  jeton: "Impossible d'obtenir le jeton Meta. Vérifie l'identifiant et le secret de l'app, puis réessaie.",
  compte: "Aucun compte publicitaire n'est visible depuis ce compte Meta. Demande un rôle sur le compte publicitaire du client puis réessaie.",
  enregistrement: "Le compte Meta a été autorisé mais n'a pas pu être enregistré. Réessaie dans un instant.",
};
