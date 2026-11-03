import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_SIGN_SECONDS, isClientImagePath } from "@/lib/avatar-image";

/**
 * Signe (1 h), avec la clé service, des images d'avatars rangées dans les Fichiers d'un client —
 * seulement si le fichier appartient à ce client ET lui est partagé : c'est exactement ce que son espace
 * a le droit de voir (politique studio_client_read). Sert au casting public (sans session) et de repli
 * à l'espace client tant que la migration 0011 (correctif de cette politique) n'est pas passée.
 */
export async function signSharedClientImages(admin: SupabaseClient, items: Array<{ clientId: string; path: string }>): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const valid = items.filter((i) => isClientImagePath(i.clientId, i.path));
  if (!valid.length) return urls;
  const { data: shared } = await admin.from("files").select("path, client_id").eq("shared_with_client", true).in("path", [...new Set(valid.map((i) => i.path))]);
  const allowed = [...new Set(((shared ?? []) as Array<{ path: string; client_id: string | null }>)
    .filter((f) => valid.some((i) => i.path === f.path && i.clientId === f.client_id))
    .map((f) => f.path))];
  if (!allowed.length) return urls;
  const { data } = await admin.storage.from("studio").createSignedUrls(allowed, AVATAR_SIGN_SECONDS);
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  return urls;
}
