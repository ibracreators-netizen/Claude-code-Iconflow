import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { IaPlan } from "@/lib/data/types";

const validToken = (t: string) => /^[A-Za-z0-9_-]{8,128}$/.test(t);

/** Lecture publique (lecture seule) d'un plan IA par son jeton, sans session. Prod : clé service. Démo : mémoire. */
export async function getPublicIaPlan(token: string): Promise<IaPlan | null> {
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
  return { ...(data as object), data: { parts: Array.isArray(d.parts) ? d.parts : [], edit_notes: d.edit_notes ?? { texts: [], overlays: "", music: "", mentions: "" }, prompts_validated: !!d.prompts_validated } } as IaPlan;
}
