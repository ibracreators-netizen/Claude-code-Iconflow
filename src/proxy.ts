import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { DEMO_COOKIE, isSupabaseConfigured } from "@/lib/supabase/env";

const PROTECTED = [/^\/studio(\/|$)/, /^\/app(\/|$)/, /^\/print(\/|$)/];

/**
 * Garde de routes (UI uniquement — la RLS Supabase reste l'autorité sur les données).
 * - Rafraîchit la session Supabase à chaque requête.
 * - Redirige vers /login si une route protégée est demandée sans session.
 * - Un utilisateur déjà connecté qui arrive sur /login est pris en charge par la page elle-même
 *   (redirection vers son espace, ou écran « accès retiré » / « persona de démo retiré »), jamais ici :
 *   une redirection aveugle créerait une boucle quand la session n'est plus valide.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((r) => r.test(pathname));

  if (!isSupabaseConfigured()) {
    const demo = request.cookies.get(DEMO_COOKIE)?.value;
    if (isProtected && !demo) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  if (isProtected && !user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

/**
 * Le proxy traite toute URL sauf les fichiers statiques réels : build Next, logos (/brand/) et fichiers à la racine
 * (favicon, robots.txt…). Une URL de page qui finit par « .png » (ex. /studio/clients/x.png) passe bien par le proxy :
 * l'en-tête d'identité interne est ainsi toujours réécrit, jamais hérité du navigateur.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|webmanifest)$).*)"],
};
