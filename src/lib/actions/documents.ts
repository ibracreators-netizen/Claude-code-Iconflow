"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Document } from "@/lib/data/types";

const refresh = (id?: string) => { revalidatePath("/studio/documents"); revalidatePath("/app/documents"); if (id) { revalidatePath(`/studio/documents/${id}`); revalidatePath(`/app/documents/${id}`); } };

// Bibliothèque : dossiers
export async function createFolder(input: { name: string; parent_id?: string | null; client_id?: string | null }) {
  return run(async () => { const store = await getStoreFor("documents"); const f = await store.createFolder(input); revalidatePath("/studio/documents"); return f; });
}
export async function updateFolder(id: string, patch: { name?: string; parent_id?: string | null; position?: number }) {
  return run(async () => { const store = await getStoreFor("documents"); const f = await store.updateFolder(id, patch); revalidatePath("/studio/documents"); return f; });
}
export async function deleteFolder(id: string) {
  return run(async () => { const store = await getStoreFor("documents"); await store.deleteFolder(id); revalidatePath("/studio/documents"); });
}
export async function moveDocument(id: string, folderId: string | null) {
  return run(async () => { const store = await getStoreFor("documents"); const d = await store.updateDocument(id, { folder_id: folderId }); revalidatePath("/studio/documents"); return d; });
}

export async function createDocument(input: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client" | "parent_id" | "folder_id">>) {
  return run(async () => { const s = await getStoreFor("documents"); const r = await s.createDocument(input); refresh(); return r; });
}
export async function updateDocument(id: string, patch: Partial<Pick<Document, "title" | "icon" | "kind" | "content" | "client_id" | "shared_with_client" | "folder_id">>) {
  return run(async () => { const s = await getStoreFor("documents"); const r = await s.updateDocument(id, patch); refresh(id); return r; });
}
export async function archiveDocument(id: string, archived: boolean) {
  return run(async () => { const s = await getStoreFor("documents"); const r = await s.archiveDocument(id, archived); refresh(id); return r; });
}
