"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { isAvatarFolder, isAvatarImageMime, isClientImagePath } from "@/lib/avatar-image";

/** L'agence propose / retire des avatars (casting) dans l'espace d'un client. Le client, lui, « retient » ceux qui lui vont. */
function revalidate(clientId: string) {
  revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/studio/avatars");
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

/**
 * Image prise dans les Fichiers du client (bucket privé « studio »). Elle doit y être enregistrée et être une image ;
 * elle est partagée avec le client pour qu'il la voie dans son casting (la RLS du stockage ne lui montre que les fichiers partagés).
 * Aucun lien public : l'image est signée à chaque affichage.
 */
async function attachClientImage(clientId: string, path: string): Promise<string> {
  if (!isClientImagePath(clientId, path)) throw new Error("Cette image n'est pas dans les fichiers de ce client.");
  const store = await getStoreFor("fichiers");
  const file = (await store.files({ clientId })).find((f) => f.path === path);
  if (!file) throw new Error("Image introuvable dans les fichiers du client.");
  if (!isAvatarImageMime(file.mime)) throw new Error("Choisis une image PNG, JPEG ou WebP.");
  if (!file.shared_with_client) {
    await store.updateFile(file.id, { shared_with_client: true });
    revalidatePath("/studio/fichiers");
    revalidatePath("/app/fichiers");
  }
  return path;
}

export async function addAvatar(clientId: string, input: { name: string; preview_url?: string | null; image_path?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const name = input.name.trim();
    if (!name) throw new Error("Donne un nom à l'avatar (ex. « Femme 25-34 · lifestyle »).");
    const preview_url = input.image_path ? await attachClientImage(clientId, input.image_path) : checkImage(input.preview_url);
    const a = await store.createAvatar({ client_id: clientId, name, preview_url });
    revalidate(clientId);
    return a;
  });
}

/** Images du dossier « Avatars » d'un client, avec un aperçu signé (1 h), pour le sélecteur du formulaire d'ajout. */
export async function listAvatarImages(clientId: string) {
  return run(async () => {
    const store = await getStoreFor("fichiers");
    const files = (await store.files({ clientId })).filter((f) => isAvatarFolder(f.folder) && isAvatarImageMime(f.mime));
    const urls = await Promise.all(files.map((f) => store.fileUrl(f.path).catch(() => null)));
    return files.map((f, i) => ({ id: f.id, name: f.name, path: f.path, url: urls[i] }));
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
