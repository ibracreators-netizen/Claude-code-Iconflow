"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Brief, BriefKind, BriefStatus } from "@/lib/data/types";
import type { Patch } from "@/lib/data/store";

function revalidate(id?: string, clientId?: string | null) {
  revalidatePath("/studio/briefs");
  revalidatePath("/studio");
  revalidatePath("/studio/inbox");
  if (id) revalidatePath(`/studio/briefs/${id}`);
  if (clientId) revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/app/briefs");
  revalidatePath("/app/validations");
}

export async function createBrief(input: { client_id: string; month: string; kind: BriefKind; title: string }) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    if (!input.title.trim()) throw new Error("Donne un titre au brief.");
    if (!/^\d{4}-(0[1-9]|1[0-2])/.test(input.month)) throw new Error("Choisis un mois valide.");
    const brief = await store.createBrief(input);
    revalidate(brief.id, brief.client_id);
    return brief;
  });
}

export async function updateBrief(id: string, patch: Patch<Brief>) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.updateBrief(id, patch);
    revalidate(id, brief.client_id);
    return brief;
  });
}

export async function transitionBrief(id: string, next: BriefStatus) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.transitionBrief(id, next);
    revalidate(id, brief.client_id);
    return brief;
  });
}

// Concepts (pages) d'un brief
export async function createConcept(briefId: string, input?: { title?: string; content?: Record<string, unknown> }) {
  return run(async () => { const store = await getStoreFor("briefs"); const c = await store.createConcept(briefId, input); revalidatePath(`/studio/briefs/${briefId}`); return c; });
}
export async function updateConcept(id: string, patch: { title?: string; content?: Record<string, unknown> }) {
  return run(async () => { const store = await getStoreFor("briefs"); const c = await store.updateConcept(id, patch); revalidatePath(`/studio/briefs/${c.brief_id}`); revalidatePath(`/app/briefs/${c.brief_id}`); return c; });
}
export async function reorderConcepts(briefId: string, ids: string[]) {
  return run(async () => { const store = await getStoreFor("briefs"); await store.reorderConcepts(briefId, ids); revalidatePath(`/studio/briefs/${briefId}`); });
}
export async function deleteConcept(id: string, briefId: string) {
  return run(async () => { const store = await getStoreFor("briefs"); await store.deleteConcept(id); revalidatePath(`/studio/briefs/${briefId}`); });
}

export async function reorderBriefs(ids: string[]) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    await store.reorderBriefs(ids);
    revalidate();
    ids.forEach((id) => revalidatePath(`/studio/briefs/${id}`));
  });
}

/** Partage public : pose (ou renvoie) le lien, puis révalide la page du brief. */
export async function publishBrief(id: string) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.publishBrief(id);
    revalidate(id, brief.client_id);
    return brief;
  });
}
export async function unpublishBrief(id: string) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.unpublishBrief(id);
    revalidate(id, brief.client_id);
    return brief;
  });
}

/** Actions en masse depuis la liste : corbeille, restauration, suppression définitive. */
export async function archiveBriefs(ids: string[]) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    for (const id of ids) await store.transitionBrief(id, "archived");
    revalidate();
    return { count: ids.length };
  });
}
export async function restoreBriefs(ids: string[]) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    for (const id of ids) await store.transitionBrief(id, "redaction");
    revalidate();
    return { count: ids.length };
  });
}
export async function deleteBriefs(ids: string[]) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    for (const id of ids) await store.deleteBrief(id);
    revalidate();
    return { count: ids.length };
  });
}
