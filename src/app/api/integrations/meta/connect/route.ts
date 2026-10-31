import { NextResponse, type NextRequest } from "next/server";
import { getSession, getStore } from "@/lib/auth/session";
import { hasFullAccess } from "@/lib/permissions";
import { META_COOKIE_PATH, META_STATE_COOKIE, metaConfig, stateSigner } from "@/lib/integrations/meta";
import { authorizeUrl, encodeState } from "@/lib/integrations/meta-mapping";

export const dynamic = "force-dynamic";

/**
 * Départ de la connexion Meta d'un client : `/api/integrations/meta/connect?client=<id>`.
 * Réservé à un administrateur à accès complet. Pose un état signé (HMAC, client + compte + horodatage),
 * doublé d'un cookie httpOnly de 10 minutes, puis envoie vers la boîte de dialogue OAuth de Facebook.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const back = (reason: string) => NextResponse.redirect(`${origin}/studio?meta=erreur=${reason}`);

  const session = await getSession();
  if (!session) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/studio")}`);
  if (session.profile.role !== "agency" || !hasFullAccess(session.profile)) return back("droits");

  const cfg = metaConfig();
  if (!cfg) return back("config");

  const clientId = searchParams.get("client") ?? "";
  if (!/^[0-9a-zA-Z_-]{1,64}$/.test(clientId)) return back("client");
  const client = await (await getStore()).client(clientId);
  if (!client) return back("client");

  const state = encodeState({ c: clientId, u: session.user.id, t: Date.now() }, stateSigner(cfg.appSecret));
  const res = NextResponse.redirect(authorizeUrl({ version: cfg.version, appId: cfg.appId, redirectUri: cfg.redirectUri, state }));
  res.cookies.set(META_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: META_COOKIE_PATH, maxAge: 600 });
  return res;
}
