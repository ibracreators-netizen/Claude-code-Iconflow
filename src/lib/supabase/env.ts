export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Vrai quand l'app est reliée à Supabase. Sinon, mode démo (données en mémoire). */
export function isSupabaseConfigured() {
  return /^https:\/\/.+\.supabase\.(co|in)/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const DEMO_COOKIE = "iconflow_demo_session";
