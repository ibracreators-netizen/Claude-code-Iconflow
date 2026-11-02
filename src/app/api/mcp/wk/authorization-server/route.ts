import { APP_URL } from "@/lib/supabase/env";

// Métadonnées du serveur d'autorisation (RFC 8414), servies sur /.well-known/oauth-authorization-server via rewrite.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/api/mcp/authorize`,
    token_endpoint: `${APP_URL}/api/mcp/token`,
    registration_endpoint: `${APP_URL}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["briefs"],
  });
}
