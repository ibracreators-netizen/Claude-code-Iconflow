import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/permissions";
import { googleConfig } from "@/lib/marketing/google/api";
import { authUrl } from "@/lib/marketing/google/core";
import { hasEncryptionKey, signState } from "@/lib/marketing/google/crypto";

export const dynamic = "force-dynamic";
const GOOGLE_STATE_COOKIE = "iconflow_google_state";

/**
 * Départ de la connexion Google d'un membre. Demande UNIQUEMENT la lecture des agendas, avec un accès
 * hors ligne (jeton de renouvellement). État signé + cookie httpOnly de dix minutes.
 */
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") || new URL(request.url).origin;
  const back = (reason: string) => NextResponse.redirect(`${base}/marketing/calendrier?google=${reason}`);
  const session = await getSession();
  if (!session) return NextResponse.redirect(`${base}/login?next=${encodeURIComponent("/marketing/calendrier")}`);
  if (!canAccess(session.profile, "marketing_calendrier")) return back("droits");
  const cfg = googleConfig();
  if (!cfg || !hasEncryptionKey()) return back("config");
  const nonce = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(authUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state: signState({ u: session.user.id, n: nonce, t: Date.now() }), loginHint: session.user.email || null }));
  res.cookies.set(GOOGLE_STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https://"), path: "/api/marketing/google", maxAge: 600 });
  return res;
}
