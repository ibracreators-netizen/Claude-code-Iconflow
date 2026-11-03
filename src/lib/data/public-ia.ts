import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { IaPlan } from "@/lib/data/types";

export interface PublicIa {
  plan: IaPlan;
  client: { name: string; logo_url: string | null } | null;
}

const validToken = (t: string) => /^[A-Za-z0-9_-]{8,128}$/.test(t);

/** Lecture publique (lecture seule) d'un dossier IA par son jeton, sans session. Prod : clé service. Démo : mémoire. */
export async function getPublicIaPlan(token: string): Promise<PublicIa | null> {
  if (!validToken(token)) return null;
  if (!isSupabaseConfigured()) {
    const { demoPublicIaPlan } = await import("@/lib/data/demo-store");
    return demoPublicIaPlan(token);
  }
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("ia_plans").select("*").eq("public_token", token).maybeSingle();
  if (!data) return null;
  const d = (data.data && typeof data.data === "object" ? data.data : {}) as Record<string, unknown>;
  const plan = { ...(data as object), data: { concepts: Array.isArray(d.concepts) ? d.concepts : [] } } as IaPlan;
  const { data: client } = await admin.from("clients").select("name, logo_url").eq("id", plan.client_id).maybeSingle();
  return { plan, client: client ?? null };
}
