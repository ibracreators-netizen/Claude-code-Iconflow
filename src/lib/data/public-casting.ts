import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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
 */
export async function getPublicCasting(token: string): Promise<PublicCasting | null> {
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
  return { client: client ?? null, avatars: (avatars ?? []) as Avatar[] };
}
