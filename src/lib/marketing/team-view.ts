import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SALES_ROLE_MODULES } from "@/lib/permissions";
import { members } from "./crm-server";
import { salesTeam, type SalesMember } from "./team";

/**
 * Membres de l'espace Marketing pour les pages Équipe. Avec une base : les vrais comptes (clé service).
 * Sans base : la session et les trois identités d'essai, pour pouvoir parcourir les écrans.
 */
export async function teamForPages(): Promise<SalesMember[]> {
  if (isSupabaseConfigured()) return salesTeam();
  return (await members()).map((m) => ({ id: m.id, name: m.name, email: m.email, kind: m.admin ? "admin" as const : m.marketing_role ? "commercial" as const : "agence" as const, role: m.marketing_role, disabled: false, google: null,
    created_at: new Date(0).toISOString(), permissions: m.marketing_role ? SALES_ROLE_MODULES[m.marketing_role] : [], avatar: null }));
}
export const KIND_LABEL: Record<SalesMember["kind"], string> = { admin: "Administrateur", agence: "Membre de l'agence", commercial: "Commercial" };
