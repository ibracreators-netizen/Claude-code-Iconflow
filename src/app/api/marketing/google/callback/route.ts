import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/permissions";
import { exchangeCode, googleConfig, listCalendars } from "@/lib/marketing/google/api";
import { GOOGLE_SCOPE } from "@/lib/marketing/google/core";
import { hasEncryptionKey, readState } from "@/lib/marketing/google/crypto";
import { saveGoogleConnection, syncMyGoogle } from "@/lib/marketing/google/sync";

export const dynamic = "force-dynamic";
const COOKIE = "iconflow_google_state";

/** Retour de Google : on vérifie l'état, on échange le code, on chiffre le jeton de renouvellement, on lit les agendas. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") || url.origin;
  const done = (reason: string) => { const res = NextResponse.redirect(`${base}/marketing/calendrier?google=${reason}`); res.cookies.set(COOKIE, "", { path: "/api/marketing/google", maxAge: 0 }); return res; };

  const session = await getSession();
  if (!session) return NextResponse.redirect(`${base}/login?next=${encodeURIComponent("/marketing/calendrier")}`);
  if (!canAccess(session.profile, "marketing_calendrier")) return done("droits");
  if (url.searchParams.get("error")) return done("refuse");
  const cfg = googleConfig();
  if (!cfg || !hasEncryptionKey()) return done("config");

  const state = readState(url.searchParams.get("state") ?? "");
  const nonce = request.cookies.get(COOKIE)?.value ?? "";
  // L'état doit avoir été émis pour CE membre, dans CE navigateur, il y a moins de dix minutes.
  if (!state || state.u !== session.user.id || !nonce || state.n !== nonce) return done("etat");
  const code = url.searchParams.get("code");
  if (!code) return done("refuse");

  try {
    const tokens = await exchangeCode(cfg, code);
    if (!tokens.scope.split(" ").includes(GOOGLE_SCOPE)) return done("portee");
    // Sans jeton de renouvellement, l'accès tomberait au bout d'une heure : on refuse plutôt que de le cacher.
    if (!tokens.refreshToken) return done("sans_jeton");
    const calendars = await listCalendars(tokens.accessToken);
    const email = calendars.find((c) => c.primary)?.id ?? null;
    await saveGoogleConnection(session.user.id, { refreshToken: tokens.refreshToken, email: email && email.includes("@") ? email : null, calendars });
    await syncMyGoogle(session.user.id).catch(() => undefined);
    return done("ok");
  } catch (e) {
    console.error("[google] connexion impossible :", e instanceof Error ? e.message : e);
    return done("erreur");
  }
}
