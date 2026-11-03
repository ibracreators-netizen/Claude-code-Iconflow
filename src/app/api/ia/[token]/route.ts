import { getPublicIaPlan } from "@/lib/data/public-ia";

// Export JSON public en lecture seule d'un dossier IA (concepts + parties, liens médias directs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicIaPlan(token);
  if (!pub) return Response.json({ error: "not_found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  const { plan } = pub;
  const out = {
    id: plan.id, title: plan.title,
    client_id: plan.client_id, updated_at: plan.updated_at,
    data: plan.data,
  };
  return Response.json(out, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
