import { verifyCode, pkceOk, issueAccessToken } from "@/lib/mcp/auth";

// Échange du code d'autorisation contre un jeton d'accès (PKCE). Client public (pas de secret).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_TTL = 90 * 24 * 3600;

async function readForm(req: Request): Promise<URLSearchParams> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

function fail(error: string, description?: string): Response {
  return Response.json({ error, error_description: description }, { status: 400, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const form = await readForm(req);
  if (form.get("grant_type") !== "authorization_code") return fail("unsupported_grant_type");
  const payload = verifyCode(form.get("code") ?? "");
  if (!payload) return fail("invalid_grant", "Code invalide ou expiré.");
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== payload.redirect_uri) return fail("invalid_grant", "redirect_uri ne correspond pas.");
  if (!pkceOk(form.get("code_verifier") ?? "", payload.challenge)) return fail("invalid_grant", "Vérification PKCE échouée.");
  const access = issueAccessToken(payload.sub, payload.scope);
  return Response.json(
    { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, scope: payload.scope },
    { headers: { "cache-control": "no-store" } },
  );
}
