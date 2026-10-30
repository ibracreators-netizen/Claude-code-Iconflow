import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirects";

/**
 * Retour des liens email Supabase.
 * - Lien magique demandé depuis l'app (flux PKCE) : `?code=` → échange côté serveur.
 * - Invitation ou lien renvoyé par l'agence (flux implicite) : les jetons arrivent dans le fragment
 *   d'URL (#access_token=…), invisible côté serveur → on passe la main à /auth/finish, qui les lit
 *   dans le navigateur (le fragment est conservé par la redirection).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error ? `${origin}/login?error=lien` : `${origin}${next}`);
  }
  if (searchParams.get("error")) return NextResponse.redirect(`${origin}/login?error=lien`);
  return NextResponse.redirect(`${origin}/auth/finish?next=${encodeURIComponent(next)}`);
}
