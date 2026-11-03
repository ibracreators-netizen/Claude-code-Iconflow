import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isClientImagePath, isStoredImagePath } from "@/lib/avatar-image";
import { signSharedClientImages } from "@/lib/data/avatar-images";
import type { Avatar } from "@/lib/data/types";

export interface PublicCasting {
  client: { name: string; logo_url: string | null } | null;
  avatars: Avatar[];
}

/** Jeton de partage : chaîne URL-safe raisonnable. */
const validToken = (t: string) => /^[A-Za-z0-9_-]{8,128}$/.test(t);

/**
 * Lecture publique d'un casting (avatars d'un client) par son jeton, sans session.
 * Prod : clé service, filtré sur un lien de partage actif (kind='casting', non révoqué).
 * Démo : magasin en mémoire. Renvoie null si le jeton est inconnu ou révoqué.
 * Mémoïsée par requête (métadonnées + page) : une seule lecture et une seule signature des images.
 */
export const getPublicCasting = cache(async (token: string): Promise<PublicCasting | null> => {
  if (!validToken(token)) return null;
  if (!isSupabaseConfigured()) {
    const { demoPublicCasting } = await import("@/lib/data/demo-store");
    return demoPublicCasting(token);
  }
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: link } = await admin.from("share_links").select("client_id").eq("token", token).eq("kind", "casting").is("revoked_at", null).maybeSingle();
  if (!link) return null;
  const [{ data: client }, { data: avatars }] = await Promise.all([
    admin.from("clients").select("name, logo_url").eq("id", link.client_id).maybeSingle(),
    admin.from("avatars").select("*").eq("client_id", link.client_id).order("created_at"),
  ]);
  return { client: client ?? null, avatars: await signPublicImages(admin, link.client_id, (avatars ?? []) as Avatar[]) };
});

/**
 * Images prises dans les Fichiers : la page publique les signe (1 h) avec la clé service, mais seulement
 * pour une image du dossier Avatars, enregistrée pour le client du lien et partagée avec lui.
 * Tout autre chemin (autre fichier, autre client, document) reste sans aperçu.
 */
async function signPublicImages(admin: SupabaseClient, clientId: string, rows: Avatar[]): Promise<Avatar[]> {
  const items = rows.filter((a) => isClientImagePath(clientId, a.preview_url)).map((a) => ({ clientId, path: a.preview_url as string }));
  const urls = await signSharedClientImages(admin, items);
  return rows.map((a) => (isStoredImagePath(a.preview_url) ? { ...a, image_path: a.preview_url, preview_url: urls.get(a.preview_url) ?? null } : { ...a, image_path: null }));
}
