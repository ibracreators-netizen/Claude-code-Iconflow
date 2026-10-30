"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { BrandDossierData, LivrableStatus } from "@/lib/data/types";

export async function decideScript(id: string, decision: "valide" | "correction", comment?: string | null) {
  return run(async () => {
    const store = await getStore();
    const brief = await store.clientDecideScript(id, decision, comment?.trim() || null);
    revalidatePath("/app"); revalidatePath("/app/briefs"); revalidatePath(`/app/briefs/${id}`); revalidatePath("/app/validations");
    return brief;
  });
}

export async function decideLivrable(id: string, next: LivrableStatus, comment?: string | null) {
  return run(async () => {
    const store = await getStore();
    const l = await store.transitionLivrable(id, next, comment?.trim() || null);
    revalidatePath("/app"); revalidatePath("/app/livrables"); revalidatePath(`/app/livrables/${id}`); revalidatePath("/app/validations");
    return l;
  });
}

export async function addComment(livrableId: string, body: string) {
  return run(async () => {
    if (!body.trim()) throw new Error("Écris un commentaire avant d'envoyer.");
    const store = await getStore();
    const c = await store.addLivrableComment(livrableId, body);
    revalidatePath(`/app/livrables/${livrableId}`);
    return c;
  });
}

export async function toggleAvatar(id: string) {
  return run(async () => {
    const store = await getStore();
    const a = await store.toggleAvatar(id);
    revalidatePath("/app/avatars"); revalidatePath("/app/brain");
    return a;
  });
}

export async function saveBrandDossier(clientId: string, data: BrandDossierData) {
  return run(async () => {
    const store = await getStore();
    const d = await store.saveBrandDossier(clientId, data);
    revalidatePath("/app/brain");
    return d;
  });
}

export async function sendMessage(clientId: string, body: string) {
  return run(async () => {
    if (!body.trim()) throw new Error("Écris un message avant d'envoyer.");
    const store = await getStore();
    const m = await store.sendMessage(clientId, body);
    revalidatePath("/app/messages"); revalidatePath("/app");
    return m;
  });
}

export async function registerClientFile(input: { name: string; path: string; mime: string; size: number; client_id: string }) {
  return run(async () => {
    const store = await getStore();
    const f = await store.registerFile({ ...input, livrable_id: null, folder: "Dépôt client", shared_with_client: true });
    revalidatePath("/app/fichiers");
    return f;
  });
}

export async function getFileUrl(path: string) {
  return run(async () => {
    const store = await getStore();
    return store.fileUrl(path);
  });
}

export async function updateProfile(input: { display_name: string; title?: string | null }) {
  return run(async () => {
    if (!input.display_name.trim()) throw new Error("Indique ton nom.");
    const store = await getStore();
    const p = await store.updateProfile({ display_name: input.display_name.trim(), title: input.title?.trim() || null });
    revalidatePath("/app", "layout");
    return p;
  });
}
