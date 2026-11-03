"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { uid } from "@/lib/utils";
import type { BrandDossierData, IaBrandSettings, IaComment, IaConcept, IaEditNotes, IaGeneration, IaMediaTag, IaPart, IaPlanData, IaPromptRev, IaStatus } from "@/lib/data/types";

function revalidate(id?: string) { revalidatePath("/studio/ia"); revalidatePath("/studio", "layout"); if (id) revalidatePath(`/studio/ia/${id}`); }

export async function createIaPlan(input: { client_id: string; title: string }) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    if (!input.client_id) throw new Error("Choisis un client.");
    if (!input.title.trim()) throw new Error("Donne un nom au dossier.");
    const p = await store.createIaPlan({ client_id: input.client_id, title: input.title.trim() });
    revalidate(p.id);
    return p;
  });
}

export async function updateIaPlan(id: string, patch: { title?: string; data?: IaPlanData }) {
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

/* ── Normalisation d'un import JSON (robuste : on garantit la forme attendue par l'éditeur et la page publique) ── */
const STATUSES: IaStatus[] = ["brouillon", "prompts_valides", "en_generation", "livre"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function normPart(raw: unknown, i: number): IaPart {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: typeof p.id === "string" && p.id ? p.id : `P${i + 1}`,
    number: num(p.number) ?? i + 1,
    duration: num(p.duration),
    text_start: str(p.text_start), text_end: str(p.text_end),
    word_count: num(p.word_count),
    ref_on: !!p.ref_on, ref_excerpt: str(p.ref_excerpt), ref_reason: str(p.ref_reason),
    media: Array.isArray(p.media) ? (p.media as IaMediaTag[]) : [],
    prompt: str(p.prompt),
    model: str(p.model) || "wan-3.0",
    resolution: str(p.resolution) || "1080p",
    tries: num(p.tries) ?? 2,
    validated: !!p.validated,
    generations: Array.isArray(p.generations) ? (p.generations as IaGeneration[]) : [] as IaGeneration[],
    prompt_history: Array.isArray(p.prompt_history) ? (p.prompt_history as IaPromptRev[]) : [] as IaPromptRev[],
    comments: Array.isArray(p.comments) ? (p.comments as IaComment[]) : [] as IaComment[],
  };
}

function normEditNotes(raw: unknown): IaEditNotes {
  const n = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { texts: Array.isArray(n.texts) ? (n.texts as IaEditNotes["texts"]) : [], overlays: str(n.overlays), music: str(n.music), mentions: str(n.mentions) };
}

function normConcept(raw: unknown, i: number): IaConcept {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const parts = Array.isArray(c.parts) ? c.parts : [];
  return {
    id: typeof c.id === "string" && c.id ? c.id : uid("ic"),
    code: typeof c.code === "string" && c.code.trim() ? c.code.trim() : `V${String(i + 1).padStart(2, "0")}`,
    title: typeof c.title === "string" && c.title.trim() ? c.title.trim() : `Concept ${i + 1}`,
    status: (STATUSES.includes(c.status as IaStatus) ? c.status : "brouillon") as IaStatus,
    prompts_validated: !!c.prompts_validated,
    parts: parts.map((p, j) => normPart(p, j)),
    edit_notes: normEditNotes(c.edit_notes),
  };
}

/**
 * Import : on colle un bloc JSON et les concepts du dossier sont remplacés.
 * Accepte l'export complet d'un dossier ({ title, data: { concepts } }), un document { concepts: [...] },
 * ou un plan d'un seul concept ({ code, title, parts, edit_notes }) qui devient l'unique concept.
 */
export async function importIaPlan(id: string, json: string) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { throw new Error("JSON invalide : vérifie le bloc collé."); }
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const root = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
    let rawConcepts: unknown[];
    if (Array.isArray(root.concepts)) rawConcepts = root.concepts;
    else if (Array.isArray(root.parts)) rawConcepts = [root];
    else rawConcepts = [];
    const concepts = rawConcepts.map((c, i) => normConcept(c, i));
    if (!concepts.length) throw new Error("Aucun concept trouvé dans le JSON (clé « concepts » ou « parts » attendue).");
    const patch: { title?: string; data: IaPlanData } = { data: { concepts } };
    if (typeof obj.title === "string" && obj.title.trim()) patch.title = obj.title.trim();
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
