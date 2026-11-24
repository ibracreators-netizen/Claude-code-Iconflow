import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { MarketingRole, Member } from "./types";

/** Membres de l'équipe, lus avec la clé service (le planificateur et les sources n'ont pas de session). */
export async function teamForSystem(): Promise<Member[]> {
  if (!isSupabaseConfigured()) return [];
  const a = createAdminClient(); if (!a) return [];
  const { data } = await a.from("profiles").select("*").in("role", ["agency", "marketing"]).is("disabled_at", null);
  return ((data ?? []) as Array<{ id: string; display_name: string | null; email: string | null; role: string; permissions: unknown; marketing_role?: string | null }>).map((p) => ({
    id: p.id, name: p.display_name?.trim() || p.email || "Membre", email: p.email, admin: p.role === "agency" && p.permissions == null, sales: p.role === "marketing",
    marketing_role: (["setter", "closer", "media_buyer"].includes(p.marketing_role ?? "") ? p.marketing_role : null) as MarketingRole | null,
  }));
}

