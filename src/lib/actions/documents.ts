"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Document } from "@/lib/data/types";

const refresh = (id?: string) => { revalidatePath("/studio/documents"); revalidatePath("/app/documents"); if (id) { revalidatePath(`/studio/documents/${id}`); revalidatePath(`/app/documents/${id}`); } };

export async function createDocument(input: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client" | "parent_id">>) {
  return run(async () => { const s = await getStore(); const r = await s.createDocument(input); refresh(); return r; });
}
export async function updateDocument(id: string, patch: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client">>) {
  return run(async () => { const s = await getStore(); const r = await s.updateDocument(id, patch); refresh(id); return r; });
}
export async function archiveDocument(id: string, archived: boolean) {
  return run(async () => { const s = await getStore(); const r = await s.archiveDocument(id, archived); refresh(id); return r; });
}
