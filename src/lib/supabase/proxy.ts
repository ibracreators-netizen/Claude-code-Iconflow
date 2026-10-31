import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, USER_HEADER } from "./env";

/**
 * Rafraîchit la session Supabase et renvoie l'utilisateur courant (ou null).
 * L'identité vérifiée ici est transmise au rendu serveur dans un en-tête de requête interne :
 * les pages n'ont plus à réinterroger Supabase Auth à chaque navigation (un aller-retour de moins).
 * L'en-tête est toujours réécrit par le proxy (jamais hérité du navigateur), et le rendu serveur ne le croit
 * que s'il désigne le même compte que le jeton du cookie (voir getSession).
 */
export async function updateSession(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pending.push(...cookiesToSet);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const headers = new Headers(request.headers);
  headers.delete(USER_HEADER);
  if (user) headers.set(USER_HEADER, `${user.id}|${user.email ?? ""}`);
  const response = NextResponse.next({ request: { headers } });
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return { response, user };
}
