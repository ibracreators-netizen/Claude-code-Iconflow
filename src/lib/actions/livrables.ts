"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Livrable, LivrableStatus } from "@/lib/data/types";
import type { Patch } from "@/lib/data/store";

function revalidate(id?: string, clientId?: string | null) {
  revalidatePath("/studio/livrables");
  revalidatePath("/studio");
  revalidatePath("/studio/inbox");
  if (id) revalidatePath(`/studio/livrables/${id}`);
  if (clientId) revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/app/livrables");
  revalidatePath("/app/validations");
}

export async function createLivrable(input: { client_id: string; month: string; kind: Livrable["kind"]; title: string; file_url?: string | null; duration_sec?: number | null; brief_id?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    if (!input.title.trim()) throw new Error("Donne un titre au livrable.");
    if (input.file_url) {
      let url: URL;
      try { url = new URL(input.file_url); } catch { throw new Error("Renseigne un lien HTTPS valide."); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Renseigne un lien HTTPS sans identifiants.");
    }
    const row = await store.createLivrable(input);
    revalidate(row.id, row.client_id);
    return row;
  });
}

export async function updateLivrable(id: string, patch: Patch<Livrable>) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const row = await store.updateLivrable(id, patch);
    revalidate(id, row.client_id);
    return row;
  });
}

export async function transitionLivrable(id: string, next: LivrableStatus, comment?: string | null) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const row = await store.transitionLivrable(id, next, comment?.trim() || null);
    revalidate(id, row.client_id);
    return row;
  });
}

export async function addLivrableComment(id: string, body: string) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    if (!body.trim()) throw new Error("Écris un commentaire avant d'envoyer.");
    const c = await store.addLivrableComment(id, body);
    revalidatePath(`/studio/livrables/${id}`);
    revalidatePath(`/app/livrables/${id}`);
    return c;
  });
}
