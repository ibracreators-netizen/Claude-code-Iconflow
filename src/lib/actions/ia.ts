"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { BrandDossierData, IaBrandSettings, IaPlanData, IaStatus } from "@/lib/data/types";
import { emptyIaPlanData } from "@/lib/data/types";

function revalidate(id?: string) { revalidatePath("/studio/ia"); revalidatePath("/studio", "layout"); if (id) revalidatePath(`/studio/ia/${id}`); }

export async function createIaPlan(input: { client_id: string; code: string; title: string; concept_id?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    if (!input.client_id) throw new Error("Choisis un client.");
    if (!input.title.trim()) throw new Error("Donne un titre au concept.");
    const p = await store.createIaPlan({ client_id: input.client_id, code: input.code.trim() || "V01", title: input.title.trim(), concept_id: input.concept_id ?? null });
    revalidate(p.id);
    return p;
  });
}

export async function updateIaPlan(id: string, patch: { title?: string; code?: string; status?: IaStatus; data?: IaPlanData }) {
  return run(async () => { const store = await getStoreFor("briefs"); const p = await store.updateIaPlan(id, patch); revalidate(id); return p; });
}

export async function deleteIaPlan(id: string) {
  return run(async () => { const store = await getStoreFor("briefs"); await store.deleteIaPlan(id); revalidate(); return { id }; });
}

export async function publishIaPlan(id: string) {
  return run(async () => { const store = await getStoreFor("briefs"); const p = await store.publishIaPlan(id); revalidate(id); return p; });
}
export async function unpublishIaPlan(id: string) {
  return run(async () => { const store = await getStoreFor("briefs"); const p = await store.unpublishIaPlan(id); revalidate(id); return p; });
}

/** Import : on colle un bloc JSON (export complet {data:{…}} ou le document {parts,…}) et la Production se remplit. */
export async function importIaPlan(id: string, json: string) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { throw new Error("JSON invalide : vérifie le bloc collé."); }
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const raw = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
    const base = emptyIaPlanData();
    const data: IaPlanData = {
      parts: Array.isArray(raw.parts) ? (raw.parts as IaPlanData["parts"]) : base.parts,
      edit_notes: (raw.edit_notes && typeof raw.edit_notes === "object" ? (raw.edit_notes as IaPlanData["edit_notes"]) : base.edit_notes),
      prompts_validated: !!raw.prompts_validated,
    };
    const patch: { title?: string; code?: string; data: IaPlanData } = { data };
    if (typeof obj.title === "string" && obj.title.trim()) patch.title = obj.title.trim();
    if (typeof obj.code === "string" && obj.code.trim()) patch.code = obj.code.trim();
    const p = await store.updateIaPlan(id, patch);
    revalidate(id);
    return p;
  });
}

/** Réglages IA au niveau de la marque (rangés dans le Brain du client), réutilisés par tous ses concepts. */
export async function saveIaBrand(clientId: string, settings: IaBrandSettings) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const cur = await store.brandDossier(clientId);
    const data = { ...((cur?.data as Record<string, unknown>) ?? {}), ia: settings } as unknown as BrandDossierData;
    await store.saveBrandDossier(clientId, data);
    revalidate();
    return { ok: true };
  });
}
