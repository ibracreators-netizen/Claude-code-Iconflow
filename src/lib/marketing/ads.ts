import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { metaConfig } from "@/lib/integrations/meta";
import { humanMetaError, type MetaGraphError } from "@/lib/integrations/meta-mapping";
import type { AdInsight } from "./funnel";
import { campaignInsightsUrl, mapInsight, type MetaCampaignRow } from "./ads-core";

/**
 * Publicité : le compte Meta Ads de l'agence. La connexion Meta existante (espace Studio) est réutilisée :
 * l'administrateur désigne lequel des comptes déjà connectés est celui de l'agence. On lit ensuite sa dépense
 * par campagne et par jour. Lecture seule côté Meta ; rien n'est modifié côté Studio.
 */
export interface AdsState { integration_id: string | null; account_id: string | null; account_name: string | null; last_sync_at: string | null; last_error: string | null }
const EMPTY: AdsState = { integration_id: null, account_id: null, account_name: null, last_sync_at: null, last_error: null };
export const ADS_SYNC_EVERY_MS = 6 * 3_600_000, ADS_WINDOW_DAYS = 120;

export async function adsState(): Promise<AdsState> {
  if (!isSupabaseConfigured()) return EMPTY;
  const a = createAdminClient(); if (!a) return EMPTY;
  const { data } = await a.from("marketing_settings").select("value").eq("key", "ads").maybeSingle();
  return { ...EMPTY, ...((data?.value as Partial<AdsState> | undefined) ?? {}) };
}
async function saveState(patch: Partial<AdsState>) {
  const a = createAdminClient(); if (!a) return;
  await a.from("marketing_settings").upsert({ key: "ads", value: { ...(await adsState()), ...patch }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Comptes Meta déjà connectés dans l'app, parmi lesquels choisir celui de l'agence. Jamais le jeton. */
export async function adAccountChoices(): Promise<Array<{ integration_id: string; account_id: string; account_name: string | null; client_name: string | null }>> {
  if (!isSupabaseConfigured()) return [];
  const a = createAdminClient(); if (!a) return [];
  const { data } = await a.from("integrations").select("id, account_id, account_name, client_id").eq("provider", "meta").order("created_at");
  const rows = (data ?? []) as Array<{ id: string; account_id: string; account_name: string | null; client_id: string | null }>;
  const ids = rows.map((r) => r.client_id).filter((x): x is string => !!x);
  const names = new Map((((ids.length ? (await a.from("clients").select("id, name").in("id", ids)).data : []) ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  return rows.map((r) => ({ integration_id: r.id, account_id: r.account_id, account_name: r.account_name, client_name: r.client_id ? names.get(r.client_id) ?? null : null }));
}
export async function setAgencyAdAccount(integrationId: string | null): Promise<void> {
  if (!integrationId) { await saveState({ integration_id: null, account_id: null, account_name: null, last_sync_at: null, last_error: null }); return; }
  const choice = (await adAccountChoices()).find((c) => c.integration_id === integrationId);
  if (!choice) throw new Error("Ce compte Meta n'est plus connecté.");
  await saveState({ integration_id: choice.integration_id, account_id: choice.account_id, account_name: choice.account_name, last_sync_at: null, last_error: null });
}

/** Lit la dépense par campagne et par jour du compte de l'agence, et remplace la copie locale sur la fenêtre. */
export async function syncAgencyAds(opts: { force?: boolean } = {}): Promise<{ ran: boolean; ok: boolean; rows: number; error?: string }> {
  const cfg = metaConfig(), a = createAdminClient();
  if (!isSupabaseConfigured() || !a) return { ran: false, ok: true, rows: 0 };
  const state = await adsState();
  if (!state.integration_id || !state.account_id) return { ran: false, ok: true, rows: 0 };
  if (!opts.force && state.last_sync_at && Date.now() - Date.parse(state.last_sync_at) < ADS_SYNC_EVERY_MS) return { ran: false, ok: true, rows: 0 };
  try {
    if (!cfg) throw new Error("Meta n'est pas configuré sur l'hébergeur (META_APP_ID, META_APP_SECRET).");
    const { data } = await a.from("integrations").select("access_token").eq("id", state.integration_id).maybeSingle();
    const token = (data as { access_token?: string } | null)?.access_token;
    if (!token) throw new Error("Le compte Meta choisi n'est plus connecté : reconnecte-le dans Studio, puis choisis-le à nouveau.");
    const day = (d: Date) => d.toISOString().slice(0, 10), now = new Date();
    const since = day(new Date(now.getTime() - ADS_WINDOW_DAYS * 86_400_000)), until = day(now);
    const rows: AdInsight[] = [];
    let url: string | undefined = campaignInsightsUrl({ version: cfg.version, accountId: state.account_id, since, until });
    for (let page = 0; url && page < 40; page++) {
      const res: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const body = (await res.json().catch(() => null)) as ({ data?: MetaCampaignRow[]; paging?: { next?: string } } & MetaGraphError) | null;
      if (!res.ok || body?.error) throw new Error(humanMetaError(body, res.status));
      for (const r of body?.data ?? []) { const m = mapInsight(r); if (m) rows.push(m); }
      url = body?.paging?.next;
    }
    await a.from("marketing_ad_insights").delete().eq("account_id", state.account_id).gte("day", since);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await a.from("marketing_ad_insights").insert(rows.slice(i, i + 500).map((r) => ({ ...r, account_id: state.account_id })));
      if (error) throw new Error(error.message);
    }
    await saveState({ last_sync_at: new Date().toISOString(), last_error: null });
    return { ran: true, ok: true, rows: rows.length };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await saveState({ last_sync_at: new Date().toISOString(), last_error: message });
    return { ran: true, ok: false, rows: 0, error: message };
  }
}
