"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { BrandDossierData, BrainEntry, Knowledge } from "@/lib/data/types";

const refresh = () => { revalidatePath("/studio/brain"); revalidatePath("/app/brain"); };

export async function saveBrandDossier(clientId: string, data: BrandDossierData) {
  return run(async () => { const s = await getStore(); const r = await s.saveBrandDossier(clientId, data); refresh(); return r; });
}
export async function createBrainEntry(input: { client_id: string; section: string; kind: BrainEntry["kind"]; title: string; content: string; source_url?: string | null }) {
  return run(async () => { const s = await getStore(); const r = await s.createBrainEntry(input); refresh(); return r; });
}
export async function updateBrainEntry(id: string, patch: Partial<Pick<BrainEntry, "section" | "kind" | "title" | "content" | "source_url">>) {
  return run(async () => { const s = await getStore(); const r = await s.updateBrainEntry(id, patch); refresh(); return r; });
}
export async function deleteBrainEntry(id: string) {
  return run(async () => { const s = await getStore(); await s.deleteBrainEntry(id); refresh(); });
}
export async function createKnowledge(input: Pick<Knowledge, "title" | "category" | "body"> & Partial<Pick<Knowledge, "tags" | "segment" | "score" | "pinned">>) {
  return run(async () => { const s = await getStore(); const r = await s.createKnowledge(input); refresh(); return r; });
}
export async function updateKnowledge(id: string, patch: Partial<Pick<Knowledge, "title" | "category" | "body" | "tags" | "segment" | "score" | "pinned">>) {
  return run(async () => { const s = await getStore(); const r = await s.updateKnowledge(id, patch); refresh(); return r; });
}
export async function deleteKnowledge(id: string) {
  return run(async () => { const s = await getStore(); await s.deleteKnowledge(id); refresh(); });
}
export async function togglePinKnowledge(id: string, pinned: boolean) {
  return run(async () => { const s = await getStore(); const r = await s.updateKnowledge(id, { pinned }); refresh(); return r; });
}
