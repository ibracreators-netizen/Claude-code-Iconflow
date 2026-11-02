import { handleRpc, type RpcMessage } from "@/lib/mcp/protocol";
import { authorizeRequest } from "@/lib/mcp/auth";
import { APP_URL } from "@/lib/supabase/env";

// Node (crypto, client admin Supabase) ; jamais mis en cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 401 + indication de découverte OAuth (RFC 9728) pour que claude.ai lance le flux d'autorisation. */
function unauthorized() {
  const resource = `${APP_URL}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ error: "unauthorized", error_description: "Jeton d'accès requis." }), {
    status: 401,
    headers: { "content-type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${resource}"` },
  });
}

export async function POST(req: Request) {
  const auth = authorizeRequest(req);
  if (!auth.ok) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide." } }, { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m as RpcMessage)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handleRpc(body as RpcMessage);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
