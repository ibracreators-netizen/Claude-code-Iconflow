"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { describeExtractError, importSite, normalizeUrl, type ImportOutcome } from "@/lib/brain/extract";
import { dossierImages, dossierProposal, mergeImages, type ImportProposal } from "@/lib/brain/dossier-extras";
import type { BrandDossierData } from "@/lib/data/types";

/*
 * Import Brain depuis un site : lecture du site côté serveur, fiches créées avec origin "import",
 * images ajoutées à la galerie du dossier et proposition de dossier à appliquer en un clic.
 * Toutes les actions passent par getStoreFor("brain") : le module est exigé, la RLS reste l'autorité.
 */

const refresh = () => { revalidatePath("/studio/brain"); revalidatePath("/app/brain"); revalidatePath("/app"); };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface ImportSummary {
  import_id: string; created: number; pages: number; mode: "ia" | "simple"; ai_error: string | null; images: number; proposal: ImportProposal;
}

/** Lit le site de la marque et nourrit le Brain du client. Renvoie un résumé ; la proposition de dossier est rangée dans le dossier. */
export async function importBrainFromUrl(clientId: string, rawUrl: string) {
  return run(async (): Promise<ImportSummary> => {
    const s = await getStoreFor("brain");
    let url: URL;
    try { url = normalizeUrl(rawUrl); } catch (e) { throw new Error(describeExtractError(e)); }
    if (!(await s.client(clientId))) throw new Error("client_not_available");
    const imp = await s.createBrainImport({ client_id: clientId, url: url.href, status: "pending" });
    try {
      const out: ImportOutcome = await importSite(url);
      await Promise.all(out.entries.map((e, i) => s.createBrainEntry({
        client_id: clientId, section: e.section, kind: e.kind, title: e.title, content: e.content, source_url: e.source_url,
        origin: "import", import_id: imp.id, position: i + 1,
      })));
      const current: BrandDossierData = (await s.brandDossier(clientId))?.data ?? {};
      const images = mergeImages(dossierImages(current), out.images.map((i) => ({ url: i.url, alt: i.alt, source: i.source })));
      const proposal: ImportProposal = { import_id: imp.id, url: url.href, mode: out.mode, created_at: new Date().toISOString(), ...out.dossier };
      await s.saveBrandDossier(clientId, { ...current, images, import_proposal: proposal });
      await s.updateBrainImport(imp.id, { status: "done", pages_lues: out.pages.length, tokens_in: out.usage?.tokens_in ?? null, tokens_out: out.usage?.tokens_out ?? null, cost_usd: out.usage?.cost_usd ?? null });
      refresh();
      return { import_id: imp.id, created: out.entries.length, pages: out.pages.length, mode: out.mode, ai_error: out.ai_error, images: out.images.length, proposal };
    } catch (e) {
      await s.updateBrainImport(imp.id, { status: "error" }).catch(() => {});
      refresh();
      throw new Error(describeExtractError(e));
    }
  });
}

/** Applique la proposition au dossier : promesse et ton remplacés, personas et concurrents fusionnés. */
export async function applyImportProposal(clientId: string) {
  return run(async () => {
    const s = await getStoreFor("brain");
    const data: BrandDossierData = (await s.brandDossier(clientId))?.data ?? {};
    const p = dossierProposal(data);
    if (!p) throw new Error("Aucune proposition à appliquer : lance d'abord un import.");
    const personas = [...(Array.isArray(data.personas) ? data.personas : [])];
    for (const np of p.personas) if (!personas.some((x) => norm(x.nom) === norm(np.nom))) personas.push(np);
    const concurrents = [...new Set([...(Array.isArray(data.concurrents) ? data.concurrents : []), ...p.concurrents])];
    const next: BrandDossierData = { ...data, promesse: p.promesse || data.promesse, ton: p.ton || data.ton, personas, concurrents };
    delete next.import_proposal;
    const d = await s.saveBrandDossier(clientId, next);
    refresh();
    return d;
  });
}

export async function dismissImportProposal(clientId: string) {
  return run(async () => {
    const s = await getStoreFor("brain");
    const data: BrandDossierData = { ...((await s.brandDossier(clientId))?.data ?? {}) };
    delete data.import_proposal;
    const d = await s.saveBrandDossier(clientId, data);
    refresh();
    return d;
  });
}

/** Retire toutes les fiches créées par un import (les images restent), et le marque annulé. */
export async function undoBrainImport(clientId: string, importId: string) {
  return run(async () => {
    const s = await getStoreFor("brain");
    const entries = (await s.brainEntries(clientId)).filter((e) => e.import_id === importId);
    await Promise.all(entries.map((e) => s.deleteBrainEntry(e.id)));
    const data: BrandDossierData = { ...((await s.brandDossier(clientId))?.data ?? {}) };
    if (dossierProposal(data)?.import_id === importId) { delete data.import_proposal; await s.saveBrandDossier(clientId, data); }
    await s.updateBrainImport(importId, { status: "annule" });
    refresh();
    return entries.length;
  });
}

export async function removeDossierImage(clientId: string, url: string) {
  return run(async () => {
    const s = await getStoreFor("brain");
    const data: BrandDossierData = (await s.brandDossier(clientId))?.data ?? {};
    const d = await s.saveBrandDossier(clientId, { ...data, images: dossierImages(data).filter((i) => i.url !== url) });
    refresh();
    return d;
  });
}
