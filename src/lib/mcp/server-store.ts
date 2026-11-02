import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoStore, demoSession } from "@/lib/data/demo-store";
import { SupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore, Session } from "@/lib/data/store";
import { sanitizePermissions } from "@/lib/permissions";
import type { Profile } from "@/lib/data/types";

/**
 * Magasin « agence » pour le serveur MCP (aucune session cookie : l'appel vient du cloud d'Anthropic).
 * - Démo (Supabase non configuré) : DemoStore avec la session agence, pour tester en local.
 * - Prod : client admin (clé service, hors RLS) + une session agence réelle à incarner, pour
 *   que les actions soient attribuées à un vrai compte et que la logique de création (concepts,
 *   statut « rédaction », journal) soit identique à celle de l'app.
 *
 * Le compte agence incarné est `MCP_AGENCY_USER_ID` si défini, sinon le premier agence en accès complet.
 */
export async function mcpAgencyStore(): Promise<DataStore> {
  if (!isSupabaseConfigured()) {
    const session = demoSession("agency");
    if (!session) throw new Error("Session démo agence indisponible.");
    return new DemoStore(session);
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant : le serveur MCP ne peut pas écrire en base.");
  const wanted = process.env.MCP_AGENCY_USER_ID?.trim();
  const base = admin.from("profiles").select("*").eq("role", "agency");
  const { data, error } = wanted
    ? await base.eq("id", wanted).limit(1)
    : await base.is("permissions", null).order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  const profile = data?.[0] as Profile | undefined;
  if (!profile) throw new Error("Aucun compte agence trouvé pour le serveur MCP (définis MCP_AGENCY_USER_ID).");
  const full: Profile = {
    ...profile,
    permissions: sanitizePermissions(profile.permissions),
    disabled_at: profile.disabled_at ?? null,
    invited_by: profile.invited_by ?? null,
  };
  const session: Session = { user: { id: profile.id, email: profile.email ?? "" }, profile: full, demo: false };
  return new SupabaseStore(admin, session);
}
