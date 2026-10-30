import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { DEMO_COOKIE, isSupabaseConfigured } from "@/lib/supabase/env";

const PROTECTED = [/^\/studio(\/|$)/, /^\/app(\/|$)/];

/**
 * Garde de routes (UI uniquement — la RLS Supabase reste l'autorité sur les données).
 * - Rafraîchit la session Supabase à chaque requête.
 * - Redirige vers /login si une route protégée est demandée sans session.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((r) => r.test(pathname));

  if (!isSupabaseConfigured()) {
    const demo = request.cookies.get(DEMO_COOKIE)?.value;
    if (isProtected && !demo) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
    if (pathname === "/login" && demo) return NextResponse.redirect(new URL(demo === "client" ? "/app" : "/studio", request.url));
    // Un persona démo désactivé ou inconnu est renvoyé vers /login par les pages (session nulle) : on évite la boucle ici.
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  if (isProtected && !user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Un utilisateur connecté qui arrive sur /login est pris en charge par la page (redirection ou état « accès retiré »).
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
