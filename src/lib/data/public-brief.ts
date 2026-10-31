import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Brief, BriefConcept } from "@/lib/data/types";

export interface PublicBrief {
  brief: Brief;
  concepts: BriefConcept[];
  client: { name: string; logo_url: string | null } | null;
}

/** Jeton de partage : chaîne URL-safe raisonnable (évite toute requête sur une valeur absurde). */
const validToken = (t: string) => /^[A-Za-z0-9_-]{8,128}$/.test(t);

/**
 * Lecture d'un brief par son jeton public, sans session.
 * En production : clé service, requête filtrée sur le jeton (aucune politique anonyme ouverte sur briefs).
 * En démo : lecture du magasin en mémoire. Renvoie null si le jeton est inconnu ou le brief archivé.
 */
export async function getPublicBrief(token: string): Promise<PublicBrief | null> {
  if (!validToken(token)) return null;
  if (!isSupabaseConfigured()) {
    const { demoPublicBrief } = await import("@/lib/data/demo-store");
    return demoPublicBrief(token);
  }
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: brief } = await admin.from("briefs").select("*").eq("public_token", token).neq("status", "archived").maybeSingle();
  if (!brief) return null;
  const [{ data: concepts }, { data: client }] = await Promise.all([
    admin.from("brief_concepts").select("*").eq("brief_id", brief.id).order("position"),
    admin.from("clients").select("name, logo_url").eq("id", brief.client_id).maybeSingle(),
  ]);
  return { brief: brief as Brief, concepts: (concepts ?? []) as BriefConcept[], client: client ?? null };
}
