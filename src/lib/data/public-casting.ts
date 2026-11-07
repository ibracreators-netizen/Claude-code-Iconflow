import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isClientImagePath, isStoredImagePath } from "@/lib/avatar-image";
import { signSharedClientImages } from "@/lib/data/avatar-images";
import { AVATAR_ARCHIVE_DAYS, type Avatar } from "@/lib/data/types";

export type CastingAction = "choose" | "archive" | "restore";
export type PublicAvatarResult = { ok: true } | { ok: false; error: string };

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
  // Purge des avatars écartés dépassant le délai (best-effort ; ignoré avant la migration 0014).
  const cutoff = new Date(Date.now() - AVATAR_ARCHIVE_DAYS * 86400000).toISOString();
  await admin.from("avatars").delete().eq("client_id", link.client_id).not("archived_at", "is", null).lt("archived_at", cutoff);
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

// Limiteur de débit simple (par instance) pour le choix public.
const hits = new Map<string, number[]>();
function rateLimited(token: string, max = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(token) ?? []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(token, arr);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}
const isMissingArchivedCol = (m: string) => /archived_at|42703|PGRST204|does not exist/i.test(m);

/**
 * Choix d'un avatar depuis le LIEN PARTAGÉ (sans session). Le jeton autorise à agir sur les avatars
 * du client du lien, et uniquement eux : on vérifie le lien casting actif et l'appartenance de l'avatar.
 */
export async function publicSetAvatar(token: string, avatarId: string, action: CastingAction): Promise<PublicAvatarResult> {
  if (!validToken(token)) return { ok: false, error: "Lien invalide." };
  if (typeof avatarId !== "string" || avatarId.length < 2 || avatarId.length > 64) return { ok: false, error: "Avatar invalide." };
  if (rateLimited(token)) return { ok: false, error: "Trop d'actions. Réessaie dans une minute." };
  if (!isSupabaseConfigured()) {
    const { demoPublicSetAvatar } = await import("@/lib/data/demo-store");
    return demoPublicSetAvatar(token, avatarId, action);
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data: link } = await admin.from("share_links").select("client_id").eq("token", token).eq("kind", "casting").is("revoked_at", null).maybeSingle();
  if (!link) return { ok: false, error: "Lien expiré ou révoqué." };
  const { data: av } = await admin.from("avatars").select("id, client_id").eq("id", avatarId).maybeSingle();
  if (!av || av.client_id !== link.client_id) return { ok: false, error: "Avatar introuvable." };
  const patch = action === "choose" ? { chosen: true, archived_at: null } : action === "archive" ? { archived_at: new Date().toISOString(), chosen: false } : { archived_at: null };
  const { error } = await admin.from("avatars").update(patch).eq("id", avatarId);
  if (error) {
    if (isMissingArchivedCol(error.message)) {
      if (action === "choose") { await admin.from("avatars").update({ chosen: true }).eq("id", avatarId); return { ok: true }; }
      return { ok: false, error: "L'archivage des avatars n'est pas encore activé (migration 0014)." };
    }
    return { ok: false, error: "Action impossible. Réessaie." };
  }
  return { ok: true };
}
