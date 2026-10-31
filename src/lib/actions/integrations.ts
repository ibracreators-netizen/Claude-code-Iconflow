"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor, getStoreForAny } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { StoreError, type DataStore } from "@/lib/data/store";
import { hasFullAccess } from "@/lib/permissions";
import { listAdAccounts, metaConfig, storeSink, syncMetaIntegration, type MetaConfig } from "@/lib/integrations/meta";
import { normalizeDashboardUrl } from "@/lib/integrations/dashboard-url";
import type { MetaAdAccount } from "@/lib/integrations/meta-mapping";

/*
 * Intégrations Meta Ads et tableaux de bord clients. Les jetons restent côté serveur : les actions ne renvoient
 * que des identifiants, des noms de compte et des compteurs.
 */

function revalidatePerformance(clientId?: string) {
  revalidatePath("/studio"); revalidatePath("/studio/performance"); revalidatePath("/app/performance");
  if (clientId) revalidatePath(`/studio/clients/${clientId}`);
}

/** Administrateur à accès complet + app Meta configurée. */
async function adminWithMeta(): Promise<{ store: DataStore; cfg: MetaConfig }> {
  const store = await getStoreFor("performance");
  if (!hasFullAccess(store.session.profile)) throw new StoreError("admin_only");
  const cfg = metaConfig();
  if (!cfg) throw new StoreError("La connexion Meta n'est pas configurée sur l'hébergeur (META_APP_ID, META_APP_SECRET).");
  return { store, cfg };
}

async function metaIntegration(store: DataStore, id: string) {
  const integration = (await store.integrations()).find((i) => i.id === id && i.provider === "meta");
  if (!integration) throw new StoreError("Ce compte Meta n'est plus connecté.");
  const token = await store.integrationToken(integration.id);
  if (!token) throw new StoreError("Jeton Meta introuvable : reconnecte le compte.");
  return { integration, token };
}

/** Lit 13 semaines d'insights du compte publicitaire relié au client et met les métriques à jour. */
export async function syncMetaInsights(clientId: string) {
  return run(async () => {
    const { store, cfg } = await adminWithMeta();
    const integration = (await store.integrations(clientId)).find((i) => i.provider === "meta");
    if (!integration) throw new StoreError("Aucun compte Meta n'est connecté pour ce client.");
    const token = await store.integrationToken(integration.id);
    if (!token) throw new StoreError("Jeton Meta introuvable : reconnecte le compte.");
    const result = await syncMetaIntegration(cfg, integration, token, storeSink(store));
    revalidatePerformance(clientId);
    return result;
  });
}

/** Comptes publicitaires visibles depuis le compte Meta connecté (pour changer celui qui est relié au client). */
export async function listMetaAdAccounts(integrationId: string): Promise<{ ok: true; data: MetaAdAccount[] } | { ok: false; error: string }> {
  return run(async () => {
    const { store, cfg } = await adminWithMeta();
    const { token } = await metaIntegration(store, integrationId);
    return (await listAdAccounts(cfg, token)).map((a) => ({ id: a.id, account_id: a.account_id, name: a.name, currency: a.currency }));
  });
}

/** Relie un autre compte publicitaire au client (même connexion Meta), puis synchronise. */
export async function setMetaAccount(integrationId: string, account: { account_id: string; name?: string | null }) {
  return run(async () => {
    const { store, cfg } = await adminWithMeta();
    const { token } = await metaIntegration(store, integrationId);
    const accountId = account.account_id.trim().replace(/^act_/, "");
    if (!/^\d{3,32}$/.test(accountId)) throw new StoreError("Identifiant de compte publicitaire invalide.");
    const updated = await store.updateIntegration(integrationId, { account_id: accountId, account_name: account.name?.trim().slice(0, 120) || null, last_error: null });
    // Première synchronisation avec le nouveau compte : une erreur est consignée dans last_error, pas renvoyée.
    await syncMetaIntegration(cfg, updated, token, storeSink(store)).catch(() => undefined);
    revalidatePerformance(updated.client_id);
    return updated;
  });
}

/** Retire la connexion (le jeton est effacé). Les métriques déjà enregistrées sont conservées. */
export async function disconnectMeta(integrationId: string) {
  return run(async () => {
    const store = await getStoreFor("performance");
    if (!hasFullAccess(store.session.profile)) throw new StoreError("admin_only");
    const integration = (await store.integrations()).find((i) => i.id === integrationId);
    if (!integration) throw new StoreError("Ce compte Meta n'est plus connecté.");
    await store.deleteIntegration(integrationId);
    revalidatePerformance(integration.client_id);
  });
}

/** URL du tableau de bord externe d'un client (Looker Studio, Meta…). Vide = retirer. */
export async function saveDashboardUrl(clientId: string, url: string | null) {
  return run(async () => {
    // L'URL est une propriété de la fiche client : écriture soumise au module Clients ou Pipeline (comme la RLS).
    const store = await getStoreForAny(["clients", "pipeline"]);
    const trimmed = (url ?? "").trim();
    const normalized = normalizeDashboardUrl(trimmed);
    if (trimmed && !normalized) throw new StoreError("Indique une adresse complète commençant par https://.");
    const client = await store.updateClient(clientId, { dashboard_url: normalized });
    revalidatePerformance(clientId);
    return client.dashboard_url;
  });
}
