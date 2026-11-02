import { APP_URL } from "@/lib/supabase/env";

// Métadonnées de ressource protégée (RFC 9728), servies sur /.well-known/oauth-protected-resource via rewrite.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    resource: `${APP_URL}/api/mcp`,
    authorization_servers: [APP_URL],
    bearer_methods_supported: ["header"],
    scopes_supported: ["briefs"],
  });
}
