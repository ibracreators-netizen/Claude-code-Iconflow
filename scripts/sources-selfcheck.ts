/**
 * Vérification hors ligne de la couche d'ingestion et de l'adaptateur iClosed. Aucune base, aucun réseau :
 * l'API est remplacée par de fausses réponses reprenant les exemples de la documentation.
 * Lancer : pnpm dlx tsx scripts/sources-selfcheck.ts
 */
import { MemoryDb, type MemoryTables } from "../src/lib/marketing/db";
import { closeTask, ensureStages, upsertLead } from "../src/lib/marketing/crm";
import { applyAll, applyBooking, applyLead } from "../src/lib/marketing/sources/ingest";
import { iclosedAdapter, mapCall, mapContact } from "../src/lib/marketing/sources/iclosed";
import type { Contact, MarketingTask, Member, Prospect } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

// Exemple de la documentation (GET /v1/eventCalls), puis variantes.
const CALL = { id: 4, eventId: 2, dateTime: "2025-12-16 10:15:00.000", userId: 5, cancelReason: null, rescheduledBy: null, cancelledBy: null, callType: "STRATEGY_EVENT", duration: 30, durationUnit: "MINUTES",
  createdAt: "2025-12-10T13:53:59.235Z", updatedAt: "2025-12-10T13:54:00.951Z", contactId: 2, user: { id: 5, firstName: "Alex", lastName: "Closer", email: "closer@example.com" },
  deals: [{ id: 3, value: "123", transactionType: "WON" }], task: [{ id: 4, completed: true, outcome: "WON", noSaleReason: null, notes: "<!DOCTYPE quill-output-html><p>hello</p>" }],
  inviteTimeZone: "America/New_York", dateTimeUTC: "2025-12-16T15:15:00.000Z", inviteeEmail: "jane.doe@example.com", inviteeName: "Jane Doe", phoneNumber: "+15551234567",
  utm: [{ utmKey: "utm_source", utmValue: "google" }, { utmKey: "utm_medium", utmValue: "cpc" }], contact: { email: "jane.doe@example.com", phoneNumber: "+15551234567" }, event: { name: "Phone Call", duration: 30, durationUnit: "MINUTES" } };
const upcoming = (over: Record<string, unknown> = {}) => ({ ...CALL, id: 10, contactId: 20, task: [], deals: [], inviteeEmail: "paul@exemple.fr", inviteeName: "Paul Martin", phoneNumber: "+33611223344", contact: {}, dateTimeUTC: "2026-12-01T09:00:00.000Z", ...over });

(async () => {
  console.log("Traduction d'un rendez-vous iClosed");
  const won = mapCall(CALL)!;
  ok("identifiant, horaire UTC, fin calculée sur la durée", won.external_id === "4" && won.starts_at === "2025-12-16T15:15:00.000Z" && won.ends_at === "2025-12-16T15:45:00.000Z");
  ok("contact : identifiant, email, téléphone, nom, campagne", won.contact.external_id === "2" && won.contact.email === "jane.doe@example.com" && won.contact.utm?.utm_source === "google");
  ok("closer reconnu par son email", won.closer?.email === "closer@example.com" && won.closer?.name === "Alex Closer");
  ok("WON → présent, signé, montant du deal", won.result === "present" && won.outcome === "signe" && won.amount === 123);
  ok("note d'appel sans balises", won.note === "hello");
  ok("à venir : aucun résultat", mapCall(upcoming())!.result === "a_venir" && mapCall(upcoming())!.outcome === null);
  ok("absent (NO_SHOW)", mapCall(upcoming({ task: [{ completed: true, outcome: "NO_SALE", noSaleReason: "NO_SHOW" }] }))!.result === "absent");
  ok("annulé (cancelledBy)", mapCall(upcoming({ cancelledBy: "INVITEE" }))!.cancelled && mapCall(upcoming({ cancelledBy: "INVITEE" }))!.result === "annule");
  const follow = mapCall(upcoming({ task: [{ completed: true, outcome: "NO_SALE", noSaleReason: "FOLLOW_UP_SCHEDULE" }] }))!;
  ok("NO_SALE + suivi prévu → présent, en réflexion", follow.result === "present" && follow.outcome === "en_reflexion");
  ok("NO_SALE simple → présent, non signé", mapCall(upcoming({ task: [{ completed: true, outcome: "NO_SALE", noSaleReason: "NOT_INTERESTED" }] }))!.outcome === "non_signe");
  ok("setter lu dans le champ « set-by »", mapCall(upcoming({ secondaryAnswers: [{ customFieldIdentifier: "set-by", answer: [{ inputType: "USER", user: { firstName: "Sam", lastName: "Setter" } }] }] }))!.setter?.name === "Sam Setter");
  ok("objet inexploitable : ignoré", mapCall({}) === null && mapCall({ id: 1 }) === null);
  ok("contact sans rendez-vous : à appeler", mapContact({ id: 7, email: "lead@exemple.fr", firstName: "Léa", status: "POTENTIAL" })!.callable === true);
  ok("contact disqualifié : gardé, sans tâche, étiqueté", mapContact({ id: 8, email: "x@exemple.fr", status: "DISQUALIFIED" })!.callable === false && !!mapContact({ id: 8, email: "x@exemple.fr", status: "DISQUALIFIED" })!.tag);
  ok("contact qui a un rendez-vous : pas un cas 2", mapContact({ id: 9, email: "y@exemple.fr", status: "STRATEGY_CALL_BOOKED" }) === null);

  const tables: MemoryTables = {};
  const db = new MemoryDb(tables, null);
  const stages = await ensureStages(db);
  const key = (p: Prospect) => stages.find((s) => s.id === p.stage_id)?.key;
  const all = <T>(t: string) => (tables[t] ?? []) as unknown as T[];
  const members: Member[] = [{ id: "m-closer", name: "Alex Closer", email: "closer@example.com", marketing_role: "closer", admin: false }, { id: "m-sam", name: "Sam Setter", email: null, marketing_role: "setter", admin: false }];
  const ctx = { source: "iclosed", label: "iClosed", members };

  console.log("Cas 2 : contact sans rendez-vous");
  const lead = mapContact({ id: 20, email: "Paul@Exemple.fr", firstName: "Paul", lastName: "Martin", phoneNumber: "06 11 22 33 44", status: "QUALIFIED" })!;
  await applyLead(db, ctx, lead);
  let p = all<Prospect>("marketing_prospects")[0];
  ok("prospect en « Nouveau lead »", all<Prospect>("marketing_prospects").length === 1 && key(p) === "nouveau_lead" && p.source === "iClosed");
  ok("tâche « À appeler » créée, origine notée", all<MarketingTask>("marketing_tasks").length === 1 && all<MarketingTask>("marketing_tasks")[0].kind === "a_appeler" && all<MarketingTask>("marketing_tasks")[0].origin === "source");
  await applyLead(db, ctx, lead);
  ok("même contact relu : ni doublon, ni seconde tâche", all<Contact>("marketing_contacts").length === 1 && all<Prospect>("marketing_prospects").length === 1 && all<MarketingTask>("marketing_tasks").length === 1);

  console.log("Cas 1 : le rendez-vous arrive ensuite pour le même email");
  await applyBooking(db, ctx, mapCall(upcoming())!);
  p = all<Prospect>("marketing_prospects")[0];
  ok("même contact (pas de doublon), prospect en « Audit réservé »", all<Contact>("marketing_contacts").length === 1 && all<Prospect>("marketing_prospects").length === 1 && key(p) === "audit_reserve");
  ok("la tâche « À appeler » s'est fermée", all<MarketingTask>("marketing_tasks")[0].status === "faite");
  const appt = all<{ prospect_id: string; source: string; external_id: string; closer_id: string | null; result: string; status: string; starts_at: string }>("marketing_appointments")[0];
  ok("rendez-vous rattaché au prospect, closer reconnu", appt.prospect_id === p.id && appt.source === "iclosed" && appt.external_id === "10" && appt.closer_id === "m-closer" && p.closer_id === "m-closer");
  await applyBooking(db, ctx, mapCall(upcoming())!);
  ok("même rendez-vous relu : aucun doublon", all("marketing_appointments").length === 1);
  await applyLead(db, ctx, lead);
  ok("le contact relu après le rendez-vous : pas de nouvelle tâche", all<MarketingTask>("marketing_tasks").length === 1);

  console.log("Vie du rendez-vous");
  await applyBooking(db, ctx, mapCall(upcoming({ dateTimeUTC: "2026-12-02T10:00:00.000Z" }))!);
  ok("déplacé : même rendez-vous, nouvel horaire", all("marketing_appointments").length === 1 && all<typeof appt>("marketing_appointments")[0].starts_at === "2026-12-02T10:00:00.000Z");
  await applyBooking(db, ctx, mapCall(upcoming({ dateTimeUTC: "2026-12-02T10:00:00.000Z", task: [{ completed: true, outcome: "NO_SALE", noSaleReason: "NO_SHOW" }] }))!);
  p = all<Prospect>("marketing_prospects")[0];
  ok("absent : résultat reporté sur le rendez-vous et le prospect", all<typeof appt>("marketing_appointments")[0].result === "absent" && p.call_result === "absent" && key(p) === "audit_reserve");
  await applyBooking(db, ctx, mapCall(upcoming({ dateTimeUTC: "2026-12-02T10:00:00.000Z", task: [{ completed: true, outcome: "WON" }], deals: [{ value: "4000", transactionType: "WON" }] }))!);
  p = all<Prospect>("marketing_prospects")[0];
  ok("présent et signé : étape « Audit effectué », issue et montant reportés", key(p) === "audit_effectue" && p.call_result === "present" && p.outcome === "signe" && p.signed_amount === 4000);
  await applyBooking(db, ctx, mapCall(upcoming({ id: 11, contactId: 21, inviteeEmail: "zoe@exemple.fr", inviteeName: "Zoé", phoneNumber: null, cancelledBy: "INVITEE" }))!);
  const zoe = all<Prospect>("marketing_prospects").find((x) => x.name === "Zoé")!;
  ok("rendez-vous annulé d'un nouveau contact : gardé, prospect resté en « Nouveau lead »", key(zoe) === "nouveau_lead" && all<typeof appt>("marketing_appointments").find((a) => a.external_id === "11")!.status === "annule");

  console.log("Une seule fiche entre le site, l'import et iClosed");
  await upsertLead(db, { email: "site@exemple.fr", name: "Venu du site", phone: "07 00 00 00 01", source: "iconflow.fr/optin" }, { kind: "cree", label: "Formulaire du site" });
  const before = all<Contact>("marketing_contacts").length;
  await applyBooking(db, ctx, mapCall(upcoming({ id: 12, contactId: 22, inviteeEmail: "SITE@exemple.fr", inviteeName: "Autre nom", phoneNumber: null }))!);
  const site = all<Prospect>("marketing_prospects").find((x) => x.source === "iconflow.fr/optin")!;
  ok("rendez-vous iClosed d'un contact venu du site : même fiche, même affaire", all<Contact>("marketing_contacts").length === before && key(site) === "audit_reserve" && all<Contact>("marketing_contacts").find((c) => c.email === "site@exemple.fr")!.name === "Venu du site");

  console.log("Lot complet et tâche déjà terminée");
  const t2: MemoryTables = {}; const db2 = new MemoryDb(t2, null); await ensureStages(db2);
  const stats = await applyAll(db2, ctx, [mapCall(upcoming())!], [lead, mapContact({ id: 30, email: "seul@exemple.fr", status: "POTENTIAL" })!, mapContact({ id: 31, email: "disq@exemple.fr", status: "DISQUALIFIED" })!]);
  ok("un contact qui a un rendez-vous dans le même lot ne reçoit pas de tâche", stats.tasks === 1 && (t2.marketing_tasks ?? []).length === 1 && stats.created === 1 && stats.leads === 2);
  ok("disqualifié : prospect créé, étiqueté, sans tâche", (t2.marketing_contacts as unknown as Contact[]).find((c) => c.email === "disq@exemple.fr")!.tags.includes("disqualifié (iClosed)"));
  await closeTask(db2, (t2.marketing_tasks as unknown as MarketingTask[])[0].id, "faite");
  await applyAll(db2, ctx, [], [mapContact({ id: 30, email: "seul@exemple.fr", status: "POTENTIAL" })!]);
  ok("tâche terminée par le setter : un nouveau passage ne la recrée pas", (t2.marketing_tasks ?? []).length === 1);

  console.log("Lecture de l'API (fausses réponses)");
  const seen: string[] = [];
  const pages: Record<string, unknown[]> = { "createdAt:0": Array.from({ length: 100 }, (_, i) => upcoming({ id: 100 + i, contactId: 100 + i, inviteeEmail: `c${i}@exemple.fr` })), "createdAt:1": [upcoming({ id: 300, contactId: 300, inviteeEmail: "dernier@exemple.fr" })],
    "updatedAt:0": [upcoming({ id: 301, updatedAt: new Date().toISOString() }), upcoming({ id: 302, updatedAt: "2020-01-01T00:00:00.000Z" })] };
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); seen.push(`${url.pathname}?${url.searchParams.get("orderColumn")}:${url.searchParams.get("page")}|${(init?.headers as Record<string, string>).Authorization}`);
    const body = url.pathname.endsWith("/contacts") ? { data: { count: 1, contacts: [{ id: 400, email: "sansrdv@exemple.fr", status: "POTENTIAL" }] } } : { data: { eventCalls: pages[`${url.searchParams.get("orderColumn")}:${url.searchParams.get("page")}`] ?? [], count: 0 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const adapter = iclosedAdapter({ key: "iclosed_test", fetchImpl: fakeFetch });
  ok("clé posée : adaptateur prêt ; sans clé : éteint", adapter.configured() && !iclosedAdapter({ key: " " }).configured());
  const first = await adapter.pull({}, Date.now() + 30_000);
  ok("premier passage : tout l'historique, page après page", first.bookings.length === 101 && first.cursor.backfill_done === true && first.leads.length === 1 && !first.more, `${first.bookings.length}`);
  ok("clé envoyée en « Bearer »", seen.every((s) => s.endsWith("|Bearer iclosed_test")));
  const next = await adapter.pull(first.cursor, Date.now() + 30_000);
  ok("passages suivants : seulement ce qui a changé depuis", next.bookings.length === 1 && next.bookings[0].external_id === "301");
  const hook = adapter.parseWebhook({ hookType: "Call booked", event: { uuid: 158 }, invitee: { email: "inconnu@exemple.fr" } });
  ok("notification : on n'en retient que l'identifiant du rendez-vous à relire", hook.bookingIds.length === 1 && hook.bookingIds[0] === "158" && !hook.refresh);
  ok("notification sans identifiant : simple relecture", adapter.parseWebhook({ hookType: "Contact created" }).refresh === true);

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
