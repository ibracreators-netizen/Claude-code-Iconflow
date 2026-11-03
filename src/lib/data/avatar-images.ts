import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_SIGN_SECONDS, isAvatarFolder, isAvatarImageMime, isClientImagePath } from "@/lib/avatar-image";

/**
 * Signe (1 h), avec la clé service, des images d'avatars rangées dans les Fichiers d'un client.
 * Garde-fous (preview_url est modifiable par le client sur ses propres avatars) : le fichier doit être
 * enregistré pour CE client, lui être partagé, être une image et se trouver dans le dossier Avatars.
 * Sert au casting public (sans session) et de repli à l'espace client tant que la migration 0011
 * (correctif de la politique de lecture du stockage) n'est pas passée.
 */
export async function signSharedClientImages(admin: SupabaseClient, items: Array<{ clientId: string; path: string }>): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const valid = items.filter((i) => isClientImagePath(i.clientId, i.path));
  if (!valid.length) return urls;
  const { data: rows } = await admin.from("files").select("path, client_id, mime, folder").eq("shared_with_client", true).in("path", [...new Set(valid.map((i) => i.path))]);
  const allowed = [...new Set(((rows ?? []) as Array<{ path: string; client_id: string | null; mime: string | null; folder: string | null }>)
    .filter((f) => isAvatarImageMime(f.mime) && isAvatarFolder(f.folder) && valid.some((i) => i.path === f.path && i.clientId === f.client_id))
    .map((f) => f.path))];
  if (!allowed.length) return urls;
  const { data } = await admin.storage.from("studio").createSignedUrls(allowed, AVATAR_SIGN_SECONDS);
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  return urls;
}
