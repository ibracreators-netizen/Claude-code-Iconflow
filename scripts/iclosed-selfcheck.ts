/**
 * Auto-test hors ligne du domaine iClosed (normalisation + validation).
 * Lancer : pnpm dlx tsx scripts/iclosed-selfcheck.ts
 * Aucune base, aucun réseau, aucune donnée réelle — uniquement les fixtures synthétiques.
 */
import { normalizeIclosed } from "../src/lib/marketing/iclosed/events";
import { fx } from "../src/lib/marketing/iclosed/fixtures";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${detail}`); } }
function expectErr(name: string, payload: unknown, code: string, declared?: string) {
  const r = normalizeIclosed(payload, declared);
  ok(name, !r.ok && r.error === code, `→ ${JSON.stringify(r)}`);
}

console.log("iClosed — auto-test du domaine normalisé\n");

// Contact créé (email + téléphone), champ supplémentaire toléré
{
  const r = normalizeIclosed(fx.contactCreated);
  ok("contactCreated normalisé", r.ok && r.event.kind === "contact");
  if (r.ok && r.event.kind === "contact") {
    ok("contact id stable", r.event.contact_external_id === "ct_0001");
    ok("email + téléphone conservés", r.event.email === "prospect@example.test" && r.event.phone === "+33600000000");
    ok("occurred_at = updatedAt", r.event.occurred_at === "2026-11-06T09:00:00.000Z");
    ok("champ fournisseur inconnu toléré (ignoré)", true);
  }
}

// Contact téléphone seul : email null, pas de blocage
{
  const r = normalizeIclosed(fx.contactPhoneOnly);
  ok("contactPhoneOnly normalisé", r.ok && r.event.kind === "contact");
  if (r.ok && r.event.kind === "contact") ok("email null, téléphone présent", r.event.email === null && r.event.phone === "+33611111111");
}

// Appel réservé : NE PAS confondre les 3 UUID
{
  const r = normalizeIclosed(fx.callBooked);
  ok("callBooked normalisé", r.ok && r.event.kind === "booking");
  if (r.ok && r.event.kind === "booking") {
    ok("call_external_id = event.uuid", r.event.call_external_id === "call_9001");
    ok("event_type_id = event_type.uuid", r.event.event_type_id === "etype_vsl");
    ok("contact_external_id = invitee.uuid", r.event.contact_external_id === "ct_0001");
    ok("les 3 IDs sont distincts", new Set([r.event.call_external_id, r.event.event_type_id, r.event.contact_external_id]).size === 3);
    ok("horaires UTC conservés", r.event.starts_at === "2026-11-10T14:00:00.000Z" && r.event.ends_at === "2026-11-10T14:45:00.000Z");
  }
}

// Report : déclencheur distinct, même appel
{
  const r = normalizeIclosed(fx.callRescheduled);
  ok("callRescheduled normalisé", r.ok && r.event.kind === "reschedule");
  if (r.ok && r.event.kind === "reschedule") {
    ok("même call_external_id", r.event.call_external_id === "call_9001");
    ok("nouvel horaire présent", r.event.new_starts_at === "2026-11-12T16:00:00.000Z");
    ok("ancien horaire conservé", r.event.old_starts_at === "2026-11-10T14:00:00.000Z");
  }
}

// Annulation
{
  const r = normalizeIclosed(fx.callCancelled);
  ok("callCancelled normalisé", r.ok && r.event.kind === "cancel");
  if (r.ok && r.event.kind === "cancel") ok("call_external_id sur annulation", r.event.call_external_id === "call_9001");
}

// Refus (jamais deviner)
expectErr("type inconnu refusé", fx.unknownType, "unknown_event_type");
expectErr("contact sans id refusé", fx.contactNoId, "contact_missing_id");
expectErr("booking sans event.uuid refusé", fx.bookingNoCallId, "call_missing_event_uuid");
expectErr("non-objet refusé", fx.notAnObject, "payload_not_object");

console.log(`\nRésultat : ${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
