import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runBookingWebhook } from "@/lib/marketing/sources/run";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Notifications de l'outil de réservation (iClosed). Éteinte tant que ICLOSED_WEBHOOK_SECRET n'est pas posée.
 *
 * iClosed ne signe pas encore ses notifications (signature annoncée, pas livrée). Deux protections à la place :
 *   1. l'adresse contient un secret (`?cle=…`), comparé en temps constant ;
 *   2. le contenu reçu n'est jamais cru : il sert seulement à savoir quel rendez-vous relire par l'API.
 * Quelqu'un qui devinerait l'adresse ne pourrait donc que déclencher une relecture des vraies données.
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.ICLOSED_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "Notifications non activées." }, { status: 404 });
  const given = Buffer.from(req.nextUrl.searchParams.get("cle") ?? ""), expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  const body = await req.json().catch(() => null);
  // iClosed attend une réponse en moins de 5 secondes : on répond vite, il réessaie sinon (le traitement est rejouable).
  const run = await runBookingWebhook(body);
  return NextResponse.json({ ok: run.ok }, { status: 200 });
}
