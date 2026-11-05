/**
 * Auto-test hors ligne du cœur de réconciliation iClosed (dédup, désordre, revue).
 * Lancer : pnpm dlx tsx scripts/iclosed-reconcile-selfcheck.ts
 * Aucune base, aucun réseau, aucune donnée réelle.
 */
import { normalizeIclosed, type NormalizedEvent } from "../src/lib/marketing/iclosed/events";
import { planIclosed, type KnownEntity } from "../src/lib/marketing/iclosed/reconcile";
import { fx } from "../src/lib/marketing/iclosed/fixtures";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${detail}`); } }
function norm(payload: unknown): NormalizedEvent { const r = normalizeIclosed(payload); if (!r.ok) throw new Error("fixture invalide: " + r.error); return r.event; }

const known = (last: string | null): KnownEntity => ({ exists: true, last_occurred_at: last });
const unknown: KnownEntity | null = null;

console.log("iClosed — auto-test de la réconciliation\n");

// 1. Livraison dupliquée → dedupe
{
  const p = planIclosed({ event: norm(fx.callBooked), alreadySeen: true, known: unknown });
  ok("livraison déjà vue → dedupe", p.action === "dedupe", JSON.stringify(p));
}
// 2. Réservation nouvelle → apply book + blocage relance
{
  const p = planIclosed({ event: norm(fx.callBooked), alreadySeen: false, known: unknown });
  ok("booking nouveau → apply/book + block_relance", p.action === "apply" && p.effect === "book" && p.block_relance === true, JSON.stringify(p));
}
// 3. Désordre : booking plus ancien que l'état connu → ignore_stale
{
  const p = planIclosed({ event: norm(fx.callBooked), alreadySeen: false, known: known("2026-11-30T00:00:00.000Z") });
  ok("booking plus ancien que connu → ignore_stale", p.action === "ignore_stale", JSON.stringify(p));
}
// 4. Report d'un appel connu → apply reschedule
{
  const p = planIclosed({ event: norm(fx.callRescheduled), alreadySeen: false, known: known("2026-11-06T11:00:00.000Z") });
  ok("report d'appel connu → apply/reschedule", p.action === "apply" && p.effect === "reschedule" && p.block_relance === true, JSON.stringify(p));
}
// 5. Report d'un appel INCONNU → needs_review (pas de fusion aveugle)
{
  const p = planIclosed({ event: norm(fx.callRescheduled), alreadySeen: false, known: unknown });
  ok("report d'appel inconnu → needs_review", p.action === "needs_review" && p.block_relance === true, JSON.stringify(p));
}
// 6. Annulation d'un appel INCONNU → needs_review
{
  const p = planIclosed({ event: norm(fx.callCancelled), alreadySeen: false, known: unknown });
  ok("annulation d'appel inconnu → needs_review", p.action === "needs_review", JSON.stringify(p));
}
// 7. Annulation d'un appel connu → apply cancel
{
  const p = planIclosed({ event: norm(fx.callCancelled), alreadySeen: false, known: known("2026-11-07T08:00:00.000Z") });
  ok("annulation d'appel connu → apply/cancel", p.action === "apply" && p.effect === "cancel", JSON.stringify(p));
}
// 8. Contact téléphone seul → upsert sans email
{
  const p = planIclosed({ event: norm(fx.contactPhoneOnly), alreadySeen: false, known: unknown });
  ok("contact téléphone seul → upsert, PAS d'email", p.action === "apply" && p.effect === "upsert_contact" && p.may_schedule_email === false, JSON.stringify(p));
}
// 9. Contact avec email → upsert + email autorisé
{
  const p = planIclosed({ event: norm(fx.contactCreated), alreadySeen: false, known: unknown });
  ok("contact avec email → upsert + email autorisé", p.action === "apply" && p.effect === "upsert_contact" && p.may_schedule_email === true, JSON.stringify(p));
}
// 10. Ordre indéterminé sur un appel (pas d'occurred_at) alors qu'on connaît l'entité → needs_review + block
{
  const noTime = { ...(fx.callBooked as Record<string, unknown>) }; delete noTime.occurred_at;
  const p = planIclosed({ event: norm(noTime), alreadySeen: false, known: known("2026-11-06T11:00:00.000Z") });
  ok("ordre indéterminé (appel) → needs_review + block_relance", p.action === "needs_review" && p.block_relance === true, JSON.stringify(p));
}

console.log(`\nRésultat : ${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
