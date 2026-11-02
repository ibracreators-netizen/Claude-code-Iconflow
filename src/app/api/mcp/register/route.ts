import crypto from "node:crypto";

// Enregistrement dynamique de client (RFC 7591), sans état : client public PKCE.
// On n'impose pas de secret ; la sécurité repose sur la connexion agence (authorize) + PKCE.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* corps vide accepté */ }
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  return Response.json(
    {
      client_id: `iconflow-mcp-${crypto.randomUUID()}`,
      redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      client_name: typeof body.client_name === "string" ? body.client_name : "Claude",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 },
  );
}
