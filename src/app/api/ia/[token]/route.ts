import { getPublicIaPlan } from "@/lib/data/public-ia";

// Export JSON public en lecture seule d'un plan IA (concept + parties, liens médias directs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await getPublicIaPlan(token);
  if (!plan) return Response.json({ error: "not_found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  const out = {
    id: plan.id, code: plan.code, title: plan.title, status: plan.status,
    client_id: plan.client_id, concept_id: plan.concept_id, updated_at: plan.updated_at,
    data: plan.data,
  };
  return Response.json(out, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
