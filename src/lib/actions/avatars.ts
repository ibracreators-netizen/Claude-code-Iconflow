"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";

/** L'agence propose / retire des avatars (casting) dans l'espace d'un client. Le client, lui, « retient » ceux qui lui vont. */
function revalidate(clientId: string) {
  revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/app/avatars");
  revalidatePath("/app/brain");
}

/** Lien d'image HTTPS sans identifiants (chaîne vide → null). */
function checkImage(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { throw new Error("Renseigne un lien d'image HTTPS valide."); }
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("Renseigne un lien d'image HTTPS sans identifiants.");
  return u.href;
}

export async function addAvatar(clientId: string, input: { name: string; preview_url?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const name = input.name.trim();
    if (!name) throw new Error("Donne un nom à l'avatar (ex. « Femme 25-34 · lifestyle »).");
    const a = await store.createAvatar({ client_id: clientId, name, preview_url: checkImage(input.preview_url) });
    revalidate(clientId);
    return a;
  });
}

export async function removeAvatar(id: string, clientId: string) {
  return run(async () => {
    const store = await getStoreFor("clients");
    await store.deleteAvatar(id);
    revalidate(clientId);
    return { id };
  });
}

/** Partage public du casting (avatars) d'un client : crée (ou renvoie) le lien actif. */
export async function shareCasting(clientId: string) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const link = await store.publishCasting(clientId);
    revalidate(clientId);
    return link;
  });
}

/** Coupe un lien de partage (brief ou casting) et le marque révoqué dans l'historique. */
export async function revokeShare(id: string, clientId: string) {
  return run(async () => {
    const store = await getStoreFor("clients");
    await store.revokeShareLink(id);
    revalidate(clientId);
    return { id };
  });
}
