import { NextResponse, type NextRequest } from "next/server";
import { ingestOptin } from "@/lib/marketing/public";

export const dynamic = "force-dynamic";

/** Webhook d'opt-in : secret partagé obligatoire (en-tête x-marketing-secret ou Authorization Bearer). */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-marketing-secret") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ?? null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  const body = await req.json().catch(() => null);
  const res = await ingestOptin(secret, body, ip);
  return NextResponse.json(res, { status: res.ok ? 200 : res.code ?? 400 });
}
