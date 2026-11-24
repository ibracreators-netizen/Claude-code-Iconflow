/**
 * Vérification hors ligne de l'import des appels Google Agenda dans les Prospects (calls-to-prospects.ts).
 * Aucune base, aucun réseau : la base est remplacée par la mémoire (MemoryDb) et les événements par des
 * réponses Google fabriquées. Lancer : pnpm dlx tsx scripts/google-calls-selfcheck.ts
 */
import { MemoryDb, type Db, type MemoryTables } from "../src/lib/marketing/db";
import { ensureStages, upsertContact, upsertLead } from "../src/lib/marketing/crm";
import { mapEvent, type CalendarEvent } from "../src/lib/marketing/google/core";
import {
  GOOGLE_CALLS_SETTING, bookedStage, calendarRows, importGoogleCalls, otherToolMatches, ownerCallRole, readGoogleCallsSetting,
  type CallRole, type GoogleCallsInput,
} from "../src/lib/marketing/google/calls-to-prospects";
import type { Appointment, Contact, Member, Prospect, ProspectEvent, Stage } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

type Appt = Appointment & { source: string; external_id: string | null; contact_id: string | null; setter_id: string | null; closer_id: string | null; result: string; title: string | null; calendar_event_id: string | null };
type Row = { account_id: string; google_event_id: string; calendar_id: string; starts_at: string; appointment_id: string | null; contact_id: string | null };

const HOUR = 3_600_000, DAY = 24 * HOUR, NOW = Date.now();
const at = (ms: number) => new Date(Math.floor((NOW + ms) / 60_000) * 60_000).toISOString();
const win = () => ({ from: new Date(NOW - 14 * DAY).toISOString(), to: new Date(NOW + 45 * DAY).toISOString() });

const members: Member[] = [
  { id: "m-closer", name: "Chloé Closer", email: "closer@agence.fr", marketing_role: "closer", admin: false, sales: true },
  { id: "m-setter", name: "Sam Setter", email: "setter@agence.fr", marketing_role: "setter", admin: false, sales: true },
  { id: "m-admin", name: "Ada Admin", email: "admin@agence.fr", marketing_role: null, admin: true, sales: false },
  { id: "m-admin-closer", name: "Alex Admin", email: "alex@agence.fr", marketing_role: "closer", admin: true, sales: false },
];
const TEAM = new Set(members.map((m) => m.email!));
const ACC = {
  closer: { id: "acc-closer", profile_id: "m-closer", email: "closer@agence.fr", role: "closer" as CallRole | null },
  setter: { id: "acc-setter", profile_id: "m-setter", email: "setter@agence.fr", role: "setter" as CallRole | null },
  admin: { id: "acc-admin", profile_id: "m-admin", email: "admin@agence.fr", role: null as CallRole | null },
  adminCloser: { id: "acc-admin-closer", profile_id: "m-admin-closer", email: "alex@agence.fr", role: "closer" as CallRole | null },
};
type Account = (typeof ACC)[keyof typeof ACC];

/** Un événement tel que Google le renvoie, traduit par mapEvent (agenda principal du propriétaire). */
function ev(acc: Account, id: string, startMs: number, guests: Array<{ email: string; displayName?: string }>, extra: Record<string, unknown> = {}): CalendarEvent {
  return mapEvent({
    id, summary: `Appel ${id}`, status: "confirmed", htmlLink: `https://calendar.google.com/event?eid=${id}`,
    start: { dateTime: at(startMs) }, end: { dateTime: at(startMs + 30 * 60_000) },
    attendees: [{ email: acc.email, self: true }, ...guests], ...extra,
  }, { id: acc.email, name: "Agenda principal" }, acc.email)!;
}

(async () => {
  const tables: MemoryTables = {};
  const db = new MemoryDb(tables, null);
  const stages = await ensureStages(db);
  const all = <T>(t: string) => (tables[t] ?? []) as unknown as T[];
  const stageKey = (p: Prospect | undefined) => stages.find((s) => s.id === p?.stage_id)?.key;
  const prospect = (id: string) => all<Prospect>("marketing_prospects").find((p) => p.id === id);
  const apptOf = (eventId: string) => all<Appt>("marketing_appointments").filter((a) => a.source === "google" && a.external_id === eventId);
  const timeline = (prospectId: string, kind?: string) => all<ProspectEvent>("marketing_prospect_events").filter((e) => e.prospect_id === prospectId && (!kind || e.kind === kind));
  const count = (t: string) => all(t).length;

  /** Comme syncGoogleAccount : rapprochements, import, puis remplacement des lignes du compte. */
  async function sync(acc: Account, events: CalendarEvent[], extra: Partial<GoogleCallsInput> = {}, on: Db = db) {
    const contactByEmail = new Map(all<Contact>("marketing_contacts").filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));
    const known = all<Appt>("marketing_appointments").filter((a) => a.source !== "google").map((a) => ({ id: a.id, starts_at: a.starts_at, contact_id: a.contact_id, status: a.status }));
    const matched = otherToolMatches(events, contactByEmail, TEAM, known);
    const res = await importGoogleCalls(on, { accountId: acc.id, owner: { id: acc.profile_id, role: acc.role }, events, teamEmails: TEAM, matched, calendarsRead: [acc.email], window: win(), members, ...extra });
    const rows = calendarRows(acc, events, { contactByEmail, team: TEAM, matched, links: res.links });
    await db.removeWhere("marketing_calendar_events", [["eq", "account_id", acc.id]]);
    for (const r of rows) await db.insert("marketing_calendar_events", r);
    return res;
  }
  const rowOf = (acc: Account, eventId: string) => all<Row>("marketing_calendar_events").find((r) => r.account_id === acc.id && r.google_event_id === eventId);

  console.log("Règles");
  ok("réglage allumé par défaut, éteint seulement sur demande", readGoogleCallsSetting(null) && readGoogleCallsSetting({}) && !readGoogleCallsSetting({ enabled: false }) && !readGoogleCallsSetting(false));
  ok("rôle d'appel : closer, setter, administrateur Closer, commercial sans rôle = setter", ownerCallRole({ role: "marketing", marketing_role: "closer" }) === "closer" && ownerCallRole({ role: "marketing", marketing_role: "setter" }) === "setter"
    && ownerCallRole({ role: "agency", marketing_role: "closer" }) === "closer" && ownerCallRole({ role: "marketing", marketing_role: null }) === "setter");
  ok("administrateur sans rôle d'appel, media buyer : aucune attribution", ownerCallRole({ role: "agency", marketing_role: null }) === null && ownerCallRole({ role: "marketing", marketing_role: "media_buyer" }) === null && ownerCallRole(null) === null);
  const st = (key: string, position: number, kind: Stage["kind"] = "ouvert") => ({ id: key, key, name: key, position, kind, active: true }) as Stage;
  ok("étape d'un rendez-vous : « Audit réservé » si elle existe", bookedStage(stages)?.key === "audit_reserve");
  ok("sinon la première étape ouverte après la première, sinon la première", bookedStage([st("a", 10), st("b", 20), st("c", 30)])?.key === "b" && bookedStage([st("a", 10), st("g", 20, "gagne")])?.key === "a");

  console.log("Invité inconnu");
  const e1 = ev(ACC.closer, "evt-lea", 2 * DAY, [{ email: "Lea@Client.fr", displayName: "Léa Martin" }, { email: "setter@agence.fr" }], { hangoutLink: "https://meet.google.com/abc-defg-hij" });
  let res = await sync(ACC.closer, [e1]);
  const lea = all<Contact>("marketing_contacts").find((c) => c.email === "lea@client.fr");
  const [a1] = apptOf("evt-lea");
  const p1 = a1 ? prospect(a1.prospect_id) : undefined;
  ok("contact créé avec le nom donné par Google, source « Google Agenda »", !!lea && lea.name === "Léa Martin" && lea.source === "Google Agenda" && count("marketing_contacts") === 1);
  ok("prospect créé en « Audit réservé », relié au contact", !!p1 && p1.contact_id === lea?.id && stageKey(p1) === "audit_reserve" && p1.source === "Google Agenda" && count("marketing_prospects") === 1);
  ok("rendez-vous créé : source google, identifiant Google, confirmé, à venir", !!a1 && a1.status === "confirme" && a1.result === "a_venir" && a1.external_id === "evt-lea" && a1.calendar_event_id === "evt-lea" && a1.starts_at === e1.starts_at && a1.ends_at === e1.ends_at);
  ok("rendez-vous relié au prospect et au contact, créé par le propriétaire de l'agenda", !!a1 && a1.prospect_id === p1?.id && a1.contact_id === lea?.id && a1.created_by === "m-closer" && a1.title === "Appel evt-lea" && a1.meeting_url === "https://meet.google.com/abc-defg-hij");
  ok("propriétaire closer → closer du rendez-vous et du prospect", a1?.closer_id === "m-closer" && !a1?.setter_id && p1?.closer_id === "m-closer" && !p1?.setter_id);
  ok("chronologie : créé depuis Google Agenda, rendez-vous pris", !!p1 && timeline(p1.id, "cree").length === 1 && timeline(p1.id, "rdv_pris").length === 1 && (timeline(p1.id, "rdv_pris")[0].data as { origine?: string }).origine === "depuis Google Agenda");
  ok("ligne de l'agenda reliée au rendez-vous et au contact (une seule fois à l'écran)", rowOf(ACC.closer, "evt-lea")?.appointment_id === a1?.id && rowOf(ACC.closer, "evt-lea")?.contact_id === lea?.id);
  ok("compteurs de l'import", res.stats.created === 1 && res.stats.contacts === 1 && res.stats.prospects === 1 && res.stats.errors.length === 0);

  console.log("Contact existant");
  const paul = (await upsertContact(db, { email: "paul@client.fr", name: "Paul Durand" })).contact;
  const contactsBefore = count("marketing_contacts");
  const e2 = ev(ACC.closer, "evt-paul", 3 * DAY, [{ email: "PAUL@client.fr", displayName: "P. D." }]);
  res = await sync(ACC.closer, [e1, e2]);
  const [a2] = apptOf("evt-paul");
  ok("contact existant relié (majuscules ignorées), aucun contact créé", count("marketing_contacts") === contactsBefore && a2?.contact_id === paul.id && prospect(a2.prospect_id)?.contact_id === paul.id && res.stats.contacts === 0);
  ok("son nom n'est pas remplacé", all<Contact>("marketing_contacts").find((c) => c.id === paul.id)?.name === "Paul Durand");

  console.log("Prospect existant");
  const nina = await upsertLead(db, { email: "nina@client.fr", name: "Nina", source: "Formulaire" }, { kind: "cree", label: "Formulaire" });
  const omar = await upsertLead(db, { email: "omar@client.fr", name: "Omar", source: "Formulaire", stage_key: "proposition" }, { kind: "cree", label: "Formulaire" });
  const prospectsBefore = count("marketing_prospects");
  const e3 = ev(ACC.closer, "evt-nina", 4 * DAY, [{ email: "nina@client.fr" }]), e4 = ev(ACC.closer, "evt-omar", 5 * DAY, [{ email: "omar@client.fr" }]);
  res = await sync(ACC.closer, [e1, e2, e3, e4]);
  ok("rendez-vous rattaché au prospect existant, aucun prospect créé", count("marketing_prospects") === prospectsBefore && apptOf("evt-nina")[0]?.prospect_id === nina.prospect.id && apptOf("evt-omar")[0]?.prospect_id === omar.prospect.id && res.stats.linked === 2);
  ok("encore à la première étape : passe en « Audit réservé », avec l'événement d'étape", stageKey(prospect(nina.prospect.id)) === "audit_reserve" && timeline(nina.prospect.id, "etape").length === 1);
  ok("plus loin dans le pipeline : étape inchangée", stageKey(prospect(omar.prospect.id)) === "proposition" && timeline(omar.prospect.id, "etape").length === 0);
  ok("source du prospect existant conservée", prospect(nina.prospect.id)?.source === "Formulaire");

  console.log("Même événement chez deux membres");
  const e1s = ev(ACC.setter, "evt-lea", 2 * DAY, [{ email: "lea@client.fr", displayName: "Léa Martin" }, { email: "closer@agence.fr" }]);
  const before2 = { appts: count("marketing_appointments"), prospects: count("marketing_prospects"), contacts: count("marketing_contacts") };
  res = await sync(ACC.setter, [e1s]);
  ok("un seul rendez-vous, un seul prospect, un seul contact", apptOf("evt-lea").length === 1 && count("marketing_appointments") === before2.appts && count("marketing_prospects") === before2.prospects && count("marketing_contacts") === before2.contacts);
  ok("la ligne de l'agenda du second membre pointe vers le même rendez-vous", rowOf(ACC.setter, "evt-lea")?.appointment_id === a1?.id);
  ok("attribution vide remplie : le setter s'ajoute, le closer reste", apptOf("evt-lea")[0]?.setter_id === "m-setter" && apptOf("evt-lea")[0]?.closer_id === "m-closer" && prospect(p1!.id)?.setter_id === "m-setter" && prospect(p1!.id)?.closer_id === "m-closer");

  console.log("Second passage");
  const snap = { appts: count("marketing_appointments"), prospects: count("marketing_prospects"), contacts: count("marketing_contacts"), events: count("marketing_prospect_events"), runs: count("marketing_automation_runs") };
  res = await sync(ACC.closer, [e1, e2, e3, e4]);
  ok("aucun doublon : ni rendez-vous, ni prospect, ni contact, ni chronologie", count("marketing_appointments") === snap.appts && count("marketing_prospects") === snap.prospects && count("marketing_contacts") === snap.contacts && count("marketing_prospect_events") === snap.events && count("marketing_automation_runs") === snap.runs);
  ok("rien à signaler", res.stats.created === 0 && res.stats.updated === 0 && res.stats.cancelled === 0 && res.stats.errors.length === 0);

  console.log("Événement déplacé");
  await db.update("marketing_appointments", a2.id, { result: "present" });
  // En production, la base rend l'heure sous une autre forme (« +00:00 ») : ce n'est pas un déplacement.
  await db.update("marketing_appointments", apptOf("evt-nina")[0].id, { starts_at: e3.starts_at.replace(".000Z", "+00:00") });
  const e2moved = ev(ACC.closer, "evt-paul", 3 * DAY + 2 * HOUR, [{ email: "paul@client.fr" }]);
  res = await sync(ACC.closer, [e1, e2moved, e3, e4]);
  ok("heures du rendez-vous mises à jour", apptOf("evt-paul")[0]?.starts_at === e2moved.starts_at && apptOf("evt-paul")[0]?.ends_at === e2moved.ends_at && res.stats.updated === 1);
  ok("le résultat déjà saisi reste", apptOf("evt-paul")[0]?.result === "present" && apptOf("evt-paul")[0]?.status === "confirme");
  ok("chronologie : rendez-vous déplacé", timeline(a2.prospect_id, "rdv_pris").some((e) => (e.data as { origine?: string }).origine === "déplacé dans Google Agenda"));
  ok("même heure écrite autrement : pas un déplacement", apptOf("evt-nina")[0]?.starts_at.endsWith("+00:00"));

  console.log("Événement retiré de l'agenda");
  res = await sync(ACC.closer, [e1, e2moved, e4]);
  const a3 = apptOf("evt-nina")[0];
  ok("rendez-vous annulé, résultat « annulé » (il était à venir)", a3?.status === "annule" && a3?.result === "annule" && res.stats.cancelled === 1);
  ok("chronologie : rendez-vous annulé", timeline(nina.prospect.id, "rdv_annule").length === 1);
  ok("le prospect n'est pas supprimé", !!prospect(nina.prospect.id));
  res = await sync(ACC.closer, [e2moved, e4]);
  ok("encore dans l'agenda d'un autre membre : pas annulé", apptOf("evt-lea")[0]?.status === "confirme" && res.stats.cancelled === 0);
  res = await sync(ACC.setter, []);
  ok("retiré de tous les agendas : annulé", apptOf("evt-lea")[0]?.status === "annule" && res.stats.cancelled === 1);
  res = await sync(ACC.closer, [e4]);
  ok("résultat déjà saisi (« présent ») gardé à l'annulation", apptOf("evt-paul")[0]?.status === "annule" && apptOf("evt-paul")[0]?.result === "present");
  res = await sync(ACC.closer, [e2moved, e4]);
  ok("revenu dans l'agenda : un rendez-vous annulé n'est pas rétabli, ni recréé", apptOf("evt-paul").length === 1 && apptOf("evt-paul")[0]?.status === "annule" && !rowOf(ACC.closer, "evt-paul")?.appointment_id);
  // Un événement sorti de la fenêtre par le temps qui passe n'a pas « disparu ».
  const old = ev(ACC.closer, "evt-ancien", 0, [{ email: "ancien@client.fr" }]);
  await sync(ACC.closer, [e2moved, e4, old]);
  await db.update("marketing_calendar_events", all<Row & { id: string }>("marketing_calendar_events").find((r) => r.google_event_id === "evt-ancien")!.id, { starts_at: new Date(NOW - 15 * DAY).toISOString() });
  res = await sync(ACC.closer, [e2moved, e4]);
  ok("sorti de la fenêtre lue (plus de 14 jours) : pas annulé", apptOf("evt-ancien")[0]?.status === "confirme" && res.stats.cancelled === 0);

  console.log("Événements ignorés");
  const snap2 = { appts: count("marketing_appointments"), contacts: count("marketing_contacts"), prospects: count("marketing_prospects") };
  const team = ev(ACC.closer, "evt-equipe", 6 * DAY, [{ email: "setter@agence.fr" }, { email: "ADMIN@agence.fr" }]);
  const allDay = mapEvent({ id: "evt-journee", summary: "Salon", start: { date: new Date(NOW + 7 * DAY).toISOString().slice(0, 10) }, end: { date: new Date(NOW + 8 * DAY).toISOString().slice(0, 10) }, attendees: [{ email: "salon@client.fr" }] }, { id: ACC.closer.email, name: "Agenda principal" }, ACC.closer.email)!;
  res = await sync(ACC.closer, [e2moved, e4, team, allDay]);
  ok("entre membres de l'équipe : ignoré", apptOf("evt-equipe").length === 0 && team.kind === "rdv");
  ok("journée entière : ignorée", apptOf("evt-journee").length === 0 && allDay.all_day);
  ok("rien de créé", count("marketing_appointments") === snap2.appts && count("marketing_contacts") === snap2.contacts && count("marketing_prospects") === snap2.prospects);

  console.log("Déjà reçu d'iClosed");
  const zoe = await upsertLead(db, { email: "zoe@client.fr", name: "Zoé", source: "iClosed" }, { kind: "source", label: "iClosed" });
  const iclosed = await db.insert<Appt>("marketing_appointments", { prospect_id: zoe.prospect.id, contact_id: zoe.contact.id, starts_at: at(8 * DAY), ends_at: at(8 * DAY + 30 * 60_000), status: "confirme", source: "iclosed", external_id: "ic-1" });
  const e7 = ev(ACC.closer, "evt-zoe", 8 * DAY + 2 * 60_000, [{ email: "zoe@client.fr" }]);
  res = await sync(ACC.closer, [e2moved, e4, e7]);
  ok("aucun rendez-vous Google créé", apptOf("evt-zoe").length === 0 && all<Appt>("marketing_appointments").filter((a) => a.prospect_id === zoe.prospect.id).length === 1);
  ok("la ligne de l'agenda pointe vers le rendez-vous iClosed", rowOf(ACC.closer, "evt-zoe")?.appointment_id === iclosed.id);
  // Import Google arrivé avant iClosed : quand iClosed arrive, le doublon Google est annulé.
  const e7b = ev(ACC.closer, "evt-zoe-2", 9 * DAY, [{ email: "zoe@client.fr" }]);
  await sync(ACC.closer, [e2moved, e4, e7, e7b]);
  const dup = apptOf("evt-zoe-2")[0];
  await db.insert("marketing_appointments", { prospect_id: zoe.prospect.id, contact_id: zoe.contact.id, starts_at: e7b.starts_at, ends_at: e7b.ends_at, status: "confirme", source: "iclosed", external_id: "ic-2" });
  res = await sync(ACC.closer, [e2moved, e4, e7, e7b]);
  ok("doublon d'un rendez-vous iClosed arrivé ensuite : l'import Google est annulé", !!dup && apptOf("evt-zoe-2")[0]?.status === "annule" && res.stats.cancelled === 1);

  console.log("Réglage éteint");
  await db.saveSetting(GOOGLE_CALLS_SETTING, { enabled: false });
  const snap3 = { appts: count("marketing_appointments"), contacts: count("marketing_contacts"), prospects: count("marketing_prospects") };
  const e8 = ev(ACC.closer, "evt-off", 10 * DAY, [{ email: "eteint@client.fr" }]);
  const e4moved = ev(ACC.closer, "evt-omar", 5 * DAY + HOUR, [{ email: "omar@client.fr" }]);
  res = await sync(ACC.closer, [e2moved, e4moved, e7, e7b, e8]);
  ok("rien de créé : ni contact, ni prospect, ni rendez-vous", count("marketing_appointments") === snap3.appts && count("marketing_contacts") === snap3.contacts && count("marketing_prospects") === snap3.prospects && apptOf("evt-off").length === 0);
  ok("rien de supprimé ; un rendez-vous déjà importé suit encore l'agenda", apptOf("evt-omar")[0]?.starts_at === e4moved.starts_at && !!prospect(omar.prospect.id));
  await db.saveSetting(GOOGLE_CALLS_SETTING, { enabled: true });
  res = await sync(ACC.closer, [e2moved, e4moved, e7, e7b, e8]);
  ok("rallumé : l'appel est importé", apptOf("evt-off").length === 1);

  console.log("Attribution");
  const e9 = ev(ACC.setter, "evt-setter", 11 * DAY, [{ email: "sofia@client.fr" }]);
  await sync(ACC.setter, [e9]);
  const a9 = apptOf("evt-setter")[0];
  ok("propriétaire setter → setter du rendez-vous et du prospect", a9?.setter_id === "m-setter" && !a9?.closer_id && prospect(a9.prospect_id)?.setter_id === "m-setter" && !prospect(a9.prospect_id)?.closer_id);
  const max = await upsertLead(db, { email: "max@client.fr", name: "Max", closer_id: "m-autre-closer" }, { kind: "cree", label: "Saisie" });
  const e10 = ev(ACC.closer, "evt-max", 12 * DAY, [{ email: "max@client.fr" }]);
  await sync(ACC.closer, [e2moved, e4moved, e7, e7b, e8, e10]);
  ok("attribution déjà posée sur le prospect : conservée", prospect(max.prospect.id)?.closer_id === "m-autre-closer" && apptOf("evt-max")[0]?.closer_id === "m-closer");
  await sync(ACC.adminCloser, [ev(ACC.adminCloser, "evt-alex", 13 * DAY, [{ email: "ines@client.fr" }])]);
  ok("administrateur qui a choisi « Closer » : closer du rendez-vous", apptOf("evt-alex")[0]?.closer_id === "m-admin-closer");
  await sync(ACC.admin, [ev(ACC.admin, "evt-ada", 14 * DAY, [{ email: "jules@client.fr" }])]);
  const aAda = apptOf("evt-ada")[0];
  ok("administrateur sans rôle d'appel : rendez-vous importé, sans attribution", !!aAda && !aAda.closer_id && !aAda.setter_id && aAda.created_by === "m-admin");
  res = await sync(ACC.closer, [ev(ACC.closer, "evt-parti", 15 * DAY, [{ email: "parti@client.fr" }])], { owner: { id: "m-closer", role: "closer", active: false } });
  ok("propriétaire dont l'accès est retiré : rien de créé", apptOf("evt-parti").length === 0 && res.stats.created === 0);

  console.log("Erreurs et limites");
  const failing: Db = { ...db, actor: null, list: db.list.bind(db), count: db.count.bind(db), get: db.get.bind(db), update: db.update.bind(db), remove: db.remove.bind(db), removeWhere: db.removeWhere.bind(db), setting: db.setting.bind(db), saveSetting: db.saveSetting.bind(db),
    insert: async <T>(t: string, row: Record<string, unknown>) => { if (t === "marketing_appointments" && row.external_id === "evt-boom") throw new Error("panne simulée"); return db.insert<T>(t, row); } };
  const boom = ev(ACC.closer, "evt-boom", 16 * DAY, [{ email: "boom@client.fr" }]), fine = ev(ACC.closer, "evt-ok", 17 * DAY, [{ email: "ok@client.fr" }]);
  res = await sync(ACC.closer, [boom, fine], {}, failing);
  ok("une erreur sur un événement : comptée, les autres continuent", res.stats.errors.length === 1 && apptOf("evt-ok").length === 1 && apptOf("evt-boom").length === 0);
  const n1 = ev(ACC.closer, "evt-n1", 18 * DAY, [{ email: "n1@client.fr" }]), n2 = ev(ACC.closer, "evt-n2", 19 * DAY, [{ email: "n2@client.fr" }]);
  res = await sync(ACC.closer, [fine, n1, n2], { maxCreates: 1 });
  ok("au plus N créations par passage, l'appel le plus proche d'abord", res.stats.created === 1 && res.stats.deferred === 1 && apptOf("evt-n1").length === 1 && apptOf("evt-n2").length === 0);
  res = await sync(ACC.closer, [fine, n1, n2], { maxCreates: 1 });
  ok("le reste est repris au passage suivant", apptOf("evt-n2").length === 1 && res.stats.deferred === 0);

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
