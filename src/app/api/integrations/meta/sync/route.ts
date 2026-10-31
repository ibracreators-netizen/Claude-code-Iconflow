import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { adminSink, metaConfig, syncMetaIntegration } from "@/lib/integrations/meta";
import { constantTimeEqual } from "@/lib/integrations/meta-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IntegrationRow { id: string; client_id: string; account_id: string; access_token: string; token_expires_at: string | null }

/**
 * Synchronisation planifiée de toutes les connexions Meta (cron Vercel quotidien, voir vercel.json).
 * Authentification : `Authorization: Bearer <CRON_SECRET>` — Vercel ajoute cet en-tête lui-même à chaque exécution
 * dès que la variable CRON_SECRET existe sur le projet. Sans clé service, la route répond 503 en l'expliquant.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET manquant : définis cette variable sur l'hébergeur ; Vercel l'envoie en en-tête Authorization à chaque cron." }, { status: 503 });
  if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const cfg = metaConfig();
  if (!cfg) return NextResponse.json({ error: "Connexion Meta non configurée : META_APP_ID et META_APP_SECRET manquent." }, { status: 503 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase n'est pas configuré (mode démo) : rien à synchroniser." }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante : la synchronisation planifiée lit les jetons avec la clé service." }, { status: 503 });

  const { data, error } = await admin.from("integrations").select("id,client_id,account_id,access_token,token_expires_at").eq("provider", "meta");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sink = adminSink(admin);
  const now = new Date();
  const results: Array<{ client_id: string; ok: boolean; weeks?: number; error?: string }> = [];
  for (const row of (data ?? []) as IntegrationRow[]) {
    if (row.token_expires_at && new Date(row.token_expires_at).getTime() < now.getTime()) {
      await sink.updateIntegration(row.id, { last_error: "La connexion Meta a expiré. Reconnecte le compte publicitaire." }).catch(() => undefined);
      results.push({ client_id: row.client_id, ok: false, error: "jeton expiré" });
      continue;
    }
    try {
      const r = await syncMetaIntegration(cfg, row, row.access_token, sink, now);
      results.push({ client_id: row.client_id, ok: true, weeks: r.weeks });
    } catch (e) {
      results.push({ client_id: row.client_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const synced = results.filter((r) => r.ok).length;
  return NextResponse.json({ at: now.toISOString(), total: results.length, synced, failed: results.length - synced, results });
}
