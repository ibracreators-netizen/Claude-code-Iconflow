"use server";
import { revalidatePath } from "next/cache";
import { getClientPreview, getSession, getStore, getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { ModuleKey } from "@/lib/permissions";
import type { BrandDossierData, LivrableStatus } from "@/lib/data/types";

/*
 * Actions de l'espace client. Un compte client agit dans son espace (RLS et RPC le garantissent).
 * Si un membre de l'agence appelle ces mêmes actions, le module correspondant lui est demandé,
 * exactement comme pour les actions du studio : aucune porte dérobée par le portail.
 * En aperçu (membre de l'agence qui regarde l'espace d'un client), aucune action n'est exécutée.
 */

const PREVIEW_BLOCKED = "Aperçu : les actions sont désactivées";

/** Refuse toute action pendant l'aperçu : session agence + cookie d'aperçu posé. */
async function assertNotPreview() {
  const session = await getSession();
  if (session?.profile.role === "agency" && (await getClientPreview())) throw new Error(PREVIEW_BLOCKED);
}

/** Magasin pour une action du portail : refuse l'aperçu, puis impose le module (membre agence) comme dans le studio. */
async function portalStore(module: ModuleKey) {
  await assertNotPreview();
  return getStoreFor(module);
}

export async function decideScript(id: string, decision: "valide" | "correction", comment?: string | null) {
  return run(async () => {
    const store = await portalStore("briefs");
    const brief = await store.clientDecideScript(id, decision, comment?.trim() || null);
    revalidatePath("/app"); revalidatePath("/app/briefs"); revalidatePath(`/app/briefs/${id}`); revalidatePath("/app/validations");
    return brief;
  });
}

export async function decideLivrable(id: string, next: LivrableStatus, comment?: string | null) {
  return run(async () => {
    const store = await portalStore("livrables");
    const l = await store.transitionLivrable(id, next, comment?.trim() || null);
    revalidatePath("/app"); revalidatePath("/app/livrables"); revalidatePath(`/app/livrables/${id}`); revalidatePath("/app/validations");
    return l;
  });
}

export async function addComment(livrableId: string, body: string) {
  return run(async () => {
    if (!body.trim()) throw new Error("Écris un commentaire avant d'envoyer.");
    const store = await portalStore("livrables");
    const c = await store.addLivrableComment(livrableId, body);
    revalidatePath(`/app/livrables/${livrableId}`);
    return c;
  });
}

export async function toggleAvatar(id: string) {
  return run(async () => {
    const store = await portalStore("brain");
    const a = await store.toggleAvatar(id);
    revalidatePath("/app/avatars"); revalidatePath("/app/brain");
    return a;
  });
}

export async function saveBrandDossier(clientId: string, data: BrandDossierData) {
  return run(async () => {
    const store = await portalStore("brain");
    const d = await store.saveBrandDossier(clientId, data);
    revalidatePath("/app/brain");
    return d;
  });
}

export async function sendMessage(clientId: string, body: string) {
  return run(async () => {
    if (!body.trim()) throw new Error("Écris un message avant d'envoyer.");
    const store = await portalStore("messages");
    const m = await store.sendMessage(clientId, body);
    revalidatePath("/app/messages"); revalidatePath("/app");
    return m;
  });
}

export async function registerClientFile(input: { name: string; path: string; mime: string; size: number; client_id: string }) {
  return run(async () => {
    const store = await portalStore("fichiers");
    const f = await store.registerFile({ ...input, livrable_id: null, folder: "Dépôt client", shared_with_client: true });
    revalidatePath("/app/fichiers");
    return f;
  });
}

/** Lecture seule (lien signé) : reste disponible en aperçu pour ouvrir les fichiers. */
export async function getFileUrl(path: string) {
  return run(async () => {
    const store = await getStoreFor("fichiers");
    return store.fileUrl(path);
  });
}

export async function updateProfile(input: { display_name: string; title?: string | null }) {
  return run(async () => {
    if (!input.display_name.trim()) throw new Error("Indique ton nom.");
    await assertNotPreview();
    const store = await getStore();
    const p = await store.updateProfile({ display_name: input.display_name.trim(), title: input.title?.trim() || null });
    revalidatePath("/app", "layout");
    return p;
  });
}
