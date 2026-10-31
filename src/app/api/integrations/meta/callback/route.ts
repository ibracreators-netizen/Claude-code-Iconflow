import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession, getStore } from "@/lib/auth/session";
import { hasFullAccess } from "@/lib/permissions";
import {
  META_COOKIE_PATH, META_STATE_COOKIE, MetaApiError, exchangeCode, exchangeLongLived, listAdAccounts, metaConfig, stateSigner, storeSink, syncMetaIntegration, tokenExpiry,
} from "@/lib/integrations/meta";
import { META_SCOPES, decodeState } from "@/lib/integrations/meta-mapping";

export const dynamic = "force-dynamic";

/**
 * Retour de Facebook après autorisation. Vérifie l'état (signature, fraîcheur, cookie, même administrateur),
 * échange le code contre un jeton puis un jeton longue durée, lit les comptes publicitaires et enregistre l'intégration
 * (premier compte à la première connexion, compte déjà relié conservé à la reconnexion ; les autres sont proposés dans
 * l'interface). Le jeton n'apparaît jamais dans une URL ni dans la réponse.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const done = (query: string) => {
    const res = NextResponse.redirect(`${origin}/studio?meta=${query}`);
    res.cookies.set(META_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: META_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const cfg = metaConfig();
  if (!cfg) return done("erreur=config");
  const denied = searchParams.get("error");
  if (denied) return done(denied === "access_denied" ? "erreur=annule" : "erreur=refus");

  const cookie = (await cookies()).get(META_STATE_COOKIE)?.value ?? null;
  const verdict = decodeState(searchParams.get("state"), stateSigner(cfg.appSecret), { cookie });
  if (!verdict.ok) return done("erreur=etat");

  const session = await getSession();
  if (!session) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/studio")}`);
  if (session.profile.role !== "agency" || !hasFullAccess(session.profile) || session.user.id !== verdict.payload.u) return done("erreur=droits");

  const code = searchParams.get("code");
  if (!code) return done("erreur=code");
  const clientId = verdict.payload.c;

  let token: string, expiresAt: string | null, accounts: Awaited<ReturnType<typeof listAdAccounts>>;
  try {
    const short = await exchangeCode(cfg, code);
    const long = await exchangeLongLived(cfg, short.access_token);
    token = long.access_token; expiresAt = tokenExpiry(long.expires_in);
    accounts = await listAdAccounts(cfg, token);
  } catch (e) {
    console.error("[iconflow] meta callback", e instanceof Error ? e.message : e);
    return done("erreur=jeton");
  }
  if (!accounts.length) return done("erreur=compte");

  try {
    const store = await getStore();
    if (!(await store.client(clientId))) return done("erreur=client");
    // Reconnexion : le compte publicitaire déjà relié au client est conservé s'il reste visible (sinon la synchronisation
    // écrirait les chiffres d'un autre compte dans ses métriques) ; première connexion : le premier compte de la liste.
    const current = (await store.integrations(clientId)).find((i) => i.provider === "meta");
    const chosen = (current && accounts.find((a) => a.account_id === current.account_id)) ?? accounts[0];
    const integration = await store.saveIntegration({ client_id: clientId, provider: "meta", account_id: chosen.account_id, account_name: chosen.name ?? null, access_token: token, token_expires_at: expiresAt, scopes: [...META_SCOPES] });
    // Première lecture immédiate : un échec est consigné dans last_error et visible sur la carte, sans bloquer le retour.
    await syncMetaIntegration(cfg, integration, token, storeSink(store)).catch(() => undefined);
    return done(`ok&client=${encodeURIComponent(clientId)}${accounts.length > 1 ? `&comptes=${accounts.length}` : ""}`);
  } catch (e) {
    console.error("[iconflow] meta callback (enregistrement)", e instanceof MetaApiError ? e.message : e);
    return done("erreur=enregistrement");
  }
}
