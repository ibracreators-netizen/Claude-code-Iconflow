import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Client Supabase avec la clé service (contourne la RLS). Réservé aux opérations
 * d'administration des comptes (invitations, retrait d'accès). Jamais exposé au navigateur.
 */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createSupabaseClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
