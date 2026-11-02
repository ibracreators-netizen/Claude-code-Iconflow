import { getSession } from "@/lib/auth/session";
import { issueCode } from "@/lib/mcp/auth";
import { APP_URL } from "@/lib/supabase/env";

// Endpoint d'autorisation OAuth. L'agence s'authentifie via sa session studio existante (cookie) :
// si elle est connectée en agence, on émet un code ; sinon on la renvoie vers /login puis ici.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** N'autorise que les redirections vers Claude (ou localhost en test). */
function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    if (u.protocol !== "https:") return false;
    return ["claude.ai", "claude.com", "anthropic.com"].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function errorBack(redirectUri: string, state: string, code: string): Response {
  try {
    const u = new URL(redirectUri);
    u.searchParams.set("error", code);
    if (state) u.searchParams.set("state", state);
    return Response.redirect(u.toString(), 302);
  } catch {
    return new Response(code, { status: 400 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const state = searchParams.get("state") ?? "";
  const challenge = searchParams.get("code_challenge") ?? "";
  const challengeMethod = searchParams.get("code_challenge_method") ?? "";
  const scope = searchParams.get("scope") ?? "briefs";

  if (!allowedRedirect(redirectUri)) return new Response("redirect_uri non autorisé.", { status: 400 });
  if (searchParams.get("response_type") !== "code") return errorBack(redirectUri, state, "unsupported_response_type");
  if (challengeMethod !== "S256" || !challenge) return errorBack(redirectUri, state, "invalid_request");

  const session = await getSession();
  if (!session || session.profile.role !== "agency") {
    const here = `/api/mcp/authorize${new URL(req.url).search}`;
    return Response.redirect(`${APP_URL}/login?next=${encodeURIComponent(here)}`, 302);
  }

  const code = issueCode({ sub: session.user.id, scope: scope.split(" ").includes("briefs") ? "briefs" : scope, redirect_uri: redirectUri, challenge });
  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return Response.redirect(back.toString(), 302);
}
