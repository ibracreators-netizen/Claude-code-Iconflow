"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { FileAsset } from "@/lib/data/types";

const refresh = () => { revalidatePath("/studio/fichiers"); revalidatePath("/app/fichiers"); };

export async function registerFile(input: Omit<FileAsset, "id" | "created_at" | "uploaded_by">) {
  return run(async () => { const s = await getStore(); const r = await s.registerFile(input); refresh(); return r; });
}
export async function updateFile(id: string, patch: Partial<Pick<FileAsset, "name" | "folder" | "shared_with_client" | "client_id">>) {
  return run(async () => { const s = await getStore(); const r = await s.updateFile(id, patch); refresh(); return r; });
}
export async function deleteFile(id: string) {
  return run(async () => { const s = await getStore(); await s.deleteFile(id); refresh(); });
}
export async function getFileUrl(path: string) {
  return run(async () => { const s = await getStore(); return s.fileUrl(path); });
}
