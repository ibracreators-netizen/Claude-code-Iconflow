import { NextResponse, type NextRequest } from "next/server";
import { runOutbox } from "@/lib/marketing/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Worker de la file d'emails. Protégé par CRON_SECRET (Bearer), comme la synchro Meta. DRY RUN tant que l'envoi réel n'est pas activé. */
async function handle(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET non configuré." }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (given !== secret) return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  const summary = await runOutbox({ limit: 100, worker: "cron" });
  return NextResponse.json(summary, { status: summary.ran ? 200 : 503 });
}
export const POST = handle;
export const GET = handle;
