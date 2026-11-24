/**
 * Vérification hors ligne des six automatisations (aucune base, aucun email envoyé).
 * Lancer : pnpm dlx tsx scripts/automations-selfcheck.ts
 */
import { MemoryDb, type MemoryTables } from "../src/lib/marketing/db";
import { ensureStages, ensureTask, listStages, updateProspect, upsertLead } from "../src/lib/marketing/crm";
import { afterBooking, afterLeadReceived, afterProspectChange, DEFAULT_AUTOMATIONS, mergeAutomations, runTimedRules, sendsProspectEmails, type AutomationContext, type AutomationSettings } from "../src/lib/marketing/automations";
import { flushAlerts, type AlertGateway, type InboxRepo } from "../src/lib/marketing/inbox-core";
import type { MarketingTask, Member, Prospect } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
type Row = Record<string, unknown>;
const members: Member[] = [
  { id: "s-a", name: "Ana Setter", email: "ana@example.com", marketing_role: "setter", admin: false, sales: true }, { id: "s-b", name: "Bob Setter", email: "bob@example.com", marketing_role: "setter", admin: false, sales: true },
  { id: "c-1", name: "Cléo Closer", email: "cleo@example.com", marketing_role: "closer", admin: false, sales: true }, { id: "mb", name: "Max Media", email: null, marketing_role: "media_buyer", admin: false, sales: true },
];

(async () => {
  const clock = Date.parse("2026-11-10T10:00:00Z");
  const mails: Array<{ to: string; subject: string }> = [];
  const world = async (over: Partial<AutomationSettings> = {}) => {
    const tables: MemoryTables = {}; const db = new MemoryDb(tables, null); await ensureStages(db);
    const ctx: AutomationContext = { settings: { ...mergeAutomations(null), ...over }, members, effects: { now: () => new Date(clock), notifyMember: async (m, subject) => { mails.push({ to: m.email ?? "", subject }); return { status: "simulee" }; } } };
    return { db, tables, ctx };
  };
  let seq = 0;
  const lead = (db: MemoryDb, email: string, phone: string | null | undefined = undefined) => upsertLead(db, { name: email.split("@")[0], email, phone: phone === undefined ? `+336${String(10000000 + ++seq)}` : phone, source: "site" }, { kind: "opt_in", label: "Site" });
  const prospect = (db: MemoryDb, id: string) => db.get<Prospect>("marketing_prospects", id) as Promise<Prospect>;
  const runs = (t: MemoryTables, rule: string) => (t.marketing_automation_runs ?? []).filter((r: Row) => r.rule === rule);

  console.log("Réglages");
  const d = mergeAutomations(null);
  ok("au départ, rien n'écrit à un prospect (règle 2 éteinte, rappels éteints)", !d.no_booking.enabled && !d.booked.reminders && !sendsProspectEmails(d));
  ok("les règles internes sont allumées", d.new_lead.enabled && d.booked.enabled && d.no_result.enabled && d.no_show.enabled && d.signed.enabled);
  const odd = mergeAutomations({ no_booking: { enabled: true, delay_hours: 99999, email: "oui" }, no_result: { delay_hours: -3 }, booked: { reminder_hours: [1, 1, 500, "x", 24] }, inconnue: { a: 1 } });
  ok("valeurs saisies bornées, types faux ignorés", odd.no_booking.delay_hours === 720 && odd.no_booking.email === true && odd.no_result.delay_hours === 0.25 && JSON.stringify(odd.booked.reminder_hours) === "[24,1]" && !("inconnue" in odd));
  ok("la file d'emails n'avance que si une règle qui écrit au prospect est allumée", sendsProspectEmails(odd) && !sendsProspectEmails({ ...DEFAULT_AUTOMATIONS, no_booking: { ...DEFAULT_AUTOMATIONS.no_booking, enabled: true, email: false } }));

  console.log("Règle 1 : nouveau lead, attribution à tour de rôle");
  { const { db, tables, ctx } = await world();
    const got: string[] = [];
    for (const e of ["a@x.fr", "b@x.fr", "c@x.fr"]) { const r = await lead(db, e); await afterLeadReceived(db, r, ctx); got.push((await prospect(db, r.prospect.id)).setter_id ?? "-"); }
    ok("les setters reçoivent les leads chacun son tour", got.join(",") === "s-a,s-b,s-a", got.join(","));
    ok("ni le closer ni le media buyer ne reçoivent de lead", !got.includes("c-1") && !got.includes("mb"));
    const again = await lead(db, "a@x.fr"); await afterLeadReceived(db, again, ctx);
    ok("un lead déjà connu n'est pas réattribué", !again.createdProspect && (await prospect(db, again.prospect.id)).setter_id === "s-a" && runs(tables, "new_lead").length === 3);
    ok("l'attribution est écrite dans la chronologie", (tables.marketing_prospect_events ?? []).some((e: Row) => e.kind === "attribution" && (e.data as Row).nom === "Ana Setter") && (tables.marketing_prospect_events ?? []).some((e: Row) => e.kind === "automatisation"));
    const mine = await upsertLead(db, { name: "Dan", email: "d@x.fr", setter_id: "s-b" }, { kind: "cree", label: "Saisie à la main" }); await afterLeadReceived(db, mine, ctx);
    ok("un prospect déjà attribué garde son setter", (await prospect(db, mine.prospect.id)).setter_id === "s-b");
  }
  { const { db, ctx } = await world({ new_lead: { enabled: true, alert: true, round_robin: false } });
    const r = await lead(db, "z@x.fr"); await afterLeadReceived(db, r, ctx);
    ok("tour de rôle éteint : personne n'est attribué", (await prospect(db, r.prospect.id)).setter_id == null);
    const { db: db2, ctx: c2 } = await world(); c2.members = members.filter((m) => m.marketing_role !== "setter");
    const r2 = await lead(db2, "y@x.fr"); await afterLeadReceived(db2, r2, c2);
    ok("aucun setter dans l'équipe : rien ne casse, rien n'est attribué", (await prospect(db2, r2.prospect.id)).setter_id == null);
  }
  { // L'interrupteur de l'alerte : les leads traités sont marqués « désactivée », aucun email ne part.
    const rows: Row[] = [{ id: "i1", status: "traite", alert_status: null, payload: { email: "a@x.fr" } }, { id: "i2", status: "traite", alert_status: null, payload: { email: "b@x.fr" } }, { id: "i3", status: "erreur", alert_status: null, payload: { email: "c@x.fr" } }];
    const sent: number[] = [];
    const repo = { pendingAlerts: async () => { const p = rows.filter((r) => r.alert_status === null); return { rows: p, ids: p.map((r) => r.id as string), suspectIds: [] as string[] }; }, markAlerts: async (ids: string[], status: string) => { for (const r of rows) if (ids.includes(r.id as string)) r.alert_status = status; } } as unknown as InboxRepo;
    const gw: AlertGateway = { leadAlerts: false, recipients: 1, mailerReady: true, sent: async () => ({ hour: 0, day: 0 }), send: async () => { sent.push(1); return { ok: true }; } };
    await flushAlerts(repo, gw);
    ok("alerte « nouveau lead » éteinte : les leads traités sont notés « désactivée »", rows[0].alert_status === "desactivee" && rows[1].alert_status === "desactivee", JSON.stringify(rows.map((r) => r.alert_status)));
    ok("une ligne en erreur reste signalée, même alerte éteinte", sent.length === 1 && rows[2].alert_status === "envoyee");
  }

  console.log("Règle 3 : rendez-vous pris");
  { const { db, tables, ctx } = await world();
    const r = await lead(db, "rdv@x.fr"); await ensureTask(db, { prospect_id: r.prospect.id, kind: "a_appeler", origin: "source" });
    const appt = { id: "ap-1", starts_at: "2026-11-12T10:00:00Z" };
    await afterBooking(db, r.prospect, appt, ctx);
    const stages = await listStages(db), key = (p: Prospect) => stages.find((s) => s.id === p.stage_id)?.key;
    ok("le prospect passe en « Audit réservé »", key(await prospect(db, r.prospect.id)) === "audit_reserve");
    ok("la tâche « À appeler » est fermée", (tables.marketing_tasks ?? []).every((t: Row) => t.kind !== "a_appeler" || t.status === "faite"));
    ok("rappels éteints par défaut : aucun email programmé", (tables.marketing_scheduled_emails ?? []).length === 0);
    await afterBooking(db, await prospect(db, r.prospect.id), appt, ctx);
    ok("rejouer le même rendez-vous ne refait rien", runs(tables, "booked").length === 1);
    const { db: d2, tables: t2, ctx: c2 } = await world({ booked: { enabled: true, reminders: true, reminder_hours: [24, 1] } });
    const r2 = await lead(d2, "rappel@x.fr");
    await afterBooking(d2, r2.prospect, { id: "ap-2", starts_at: "2026-11-10T20:00:00Z" }, c2);
    ok("rappels allumés : seuls ceux encore à venir sont programmés", (t2.marketing_scheduled_emails ?? []).length === 1 && (t2.marketing_scheduled_emails![0].params as Row).hours_before === 1);
    const { db: d3, ctx: c3 } = await world({ booked: { enabled: false, reminders: false, reminder_hours: [24, 1] } });
    const r3 = await lead(d3, "off@x.fr"); await afterBooking(d3, r3.prospect, { id: "ap-3", starts_at: "2026-11-12T10:00:00Z" }, c3);
    const st3 = await listStages(d3), p3 = await prospect(d3, r3.prospect.id);
    ok("règle éteinte : l'étape ne bouge pas", st3.find((x) => x.id === p3.stage_id)?.key === "nouveau_lead");
  }

  console.log("Règle 2 : lead sans rendez-vous après X heures");
  { const { db, tables, ctx } = await world({ no_booking: { enabled: true, delay_hours: 24, email: true, task: true } });
    const at = (iso: string) => async (email: string, phone: string | null | undefined = undefined) => { const r = await lead(db, email, phone); await db.update("marketing_prospects", r.prospect.id, { created_at: iso }); return r.prospect.id; };
    const old = await at("2026-11-09T08:00:00Z")("vieux@x.fr"), noPhone = await at("2026-11-09T08:00:00Z")("sanstel@x.fr", null), fresh = await at("2026-11-10T08:00:00Z")("frais@x.fr");
    const booked = await at("2026-11-09T08:00:00Z")("pris@x.fr"), ancient = await at("2026-10-01T08:00:00Z")("ancien@x.fr"), unsub = await at("2026-11-09T08:00:00Z")("stop@x.fr");
    await db.insert("marketing_appointments", { prospect_id: booked, starts_at: "2026-11-12T10:00:00Z", ends_at: "2026-11-12T10:30:00Z", status: "confirme", result: "a_venir", source: "iclosed", external_id: "x1" });
    await db.update("marketing_prospects", unsub, { unsubscribed_at: "2026-11-09T09:00:00Z" });
    const twice = await at("2026-11-09T08:00:00Z")("deja@x.fr", null);
    await db.insert("marketing_scheduled_emails", { prospect_id: twice, template: "relance_optin", params: {}, send_at: "2026-11-09T10:00:00Z", idempotency_key: "relance:ancienne" });
    const sum = await runTimedRules(db, ctx);
    const mailsFor = (id: string) => (tables.marketing_scheduled_emails ?? []).filter((e: Row) => e.prospect_id === id), tasksFor = (id: string) => (tables.marketing_tasks ?? []).filter((t: Row) => t.prospect_id === id && t.kind === "a_appeler" && t.status === "ouverte");
    ok("lead de plus de 24 h sans rendez-vous : email mis en file et tâche « À appeler »", mailsFor(old).length === 1 && mailsFor(old)[0].template === "relance_optin" && tasksFor(old).length === 1);
    ok("sans téléphone : email seulement, pas de tâche", mailsFor(noPhone).length === 1 && tasksFor(noPhone).length === 0);
    ok("lead trop récent : rien", mailsFor(fresh).length === 0 && tasksFor(fresh).length === 0);
    ok("lead qui a un rendez-vous : rien", mailsFor(booked).length === 0);
    ok("lead de plus de 14 jours : jamais relancé (allumer la règle ne réveille pas l'historique)", mailsFor(ancient).length === 0);
    ok("désinscrit : aucun email", mailsFor(unsub).length === 0);
    ok("une relance déjà prévue par l'ancien réglage : pas de second email", mailsFor(twice).length === 1);
    ok("bilan du passage", sum.no_booking === 3, String(sum.no_booking));
    await runTimedRules(db, ctx); await runTimedRules(db, ctx);
    ok("le planificateur peut repasser : pas de doublon", mailsFor(old).length === 1 && tasksFor(old).length === 1 && runs(tables, "no_booking").length === 3);
    const { db: d2, tables: t2, ctx: c2 } = await world();
    const r = await lead(d2, "off@x.fr"); await d2.update("marketing_prospects", r.prospect.id, { created_at: "2026-11-08T08:00:00Z" });
    await runTimedRules(d2, c2);
    ok("règle 2 éteinte (réglage de départ) : aucun email, aucune tâche", (t2.marketing_scheduled_emails ?? []).length === 0 && (t2.marketing_tasks ?? []).length === 0);
  }

  console.log("Règle 4 : rendez-vous passé sans résultat");
  { const { db, tables, ctx } = await world(); mails.length = 0;
    const a = await lead(db, "appel@x.fr"), b = await lead(db, "futur@x.fr"), c = await lead(db, "saisi@x.fr"), n = await lead(db, "sanscloser@x.fr");
    const appt = (prospect_id: string, ends: string, over: Row = {}) => db.insert("marketing_appointments", { prospect_id, starts_at: new Date(Date.parse(ends) - 1_800_000).toISOString(), ends_at: ends, status: "confirme", result: "a_venir", source: "iclosed", external_id: prospect_id, closer_id: "c-1", ...over });
    await appt(a.prospect.id, "2026-11-10T07:00:00Z"); await appt(b.prospect.id, "2026-11-10T09:30:00Z"); await appt(c.prospect.id, "2026-11-10T07:00:00Z", { result: "present" }); await appt(n.prospect.id, "2026-11-10T07:00:00Z", { closer_id: null });
    const sum = await runTimedRules(db, ctx);
    const task = (id: string) => (tables.marketing_tasks ?? []).find((t: Row) => t.prospect_id === id && t.kind === "resultat") as unknown as MarketingTask | undefined;
    ok("appel terminé depuis plus de 2 h sans résultat : tâche pour le closer et rappel", task(a.prospect.id)?.assignee_id === "c-1" && mails.length === 1 && mails[0].to === "cleo@example.com");
    ok("appel terminé depuis moins de 2 h : rien encore", !task(b.prospect.id));
    ok("résultat déjà saisi : rien", !task(c.prospect.id));
    ok("aucun closer attribué : tâche créée, pas d'email, et c'est dit au journal", !!task(n.prospect.id) && runs(tables, "no_result").some((r: Row) => String(r.action).includes("aucun closer")));
    await runTimedRules(db, ctx);
    ok("un seul rappel par rendez-vous", mails.length === 1 && sum.no_result === 2 && runs(tables, "no_result").length === 2);
  }

  console.log("Règle 5 : absent au rendez-vous");
  { const { db, tables, ctx } = await world();
    const r = await lead(db, "absent@x.fr"); await db.update("marketing_prospects", r.prospect.id, { setter_id: "s-b" });
    const ch = await updateProspect(db, r.prospect.id, { call_result: "absent" }, {});
    await afterProspectChange(db, ch.before, ch.after, ctx);
    const t = (tables.marketing_tasks ?? []).filter((x: Row) => x.kind === "relance");
    ok("tâche de relance créée pour le setter du prospect", t.length === 1 && t[0].assignee_id === "s-b" && t[0].origin === "automatisation");
    ok("échéance : maintenant + délai réglé", Date.parse(String(t[0].due_at)) === clock + 2 * 3_600_000);
    const same = await updateProspect(db, r.prospect.id, { call_note: "pas répondu" }, {});
    await afterProspectChange(db, same.before, same.after, ctx);
    ok("une autre modification ne recrée pas la tâche", (tables.marketing_tasks ?? []).filter((x: Row) => x.kind === "relance").length === 1);
  }

  console.log("Règle 6 : signé");
  { const { db, tables, ctx } = await world();
    const r = await lead(db, "signe@x.fr");
    const ch = await updateProspect(db, r.prospect.id, { outcome: "signe", signed_amount: 4000 }, {});
    await afterProspectChange(db, ch.before, ch.after, ctx);
    const stages = await listStages(db), p = await prospect(db, r.prospect.id);
    ok("le prospect passe en « Gagné »", stages.find((s) => s.id === p.stage_id)?.key === "gagne");
    const props = tables.marketing_client_proposals ?? [];
    ok("création du client proposée, en attente de validation", props.length === 1 && props[0].status === "en_attente" && props[0].client_id == null);
    ok("rien n'est écrit dans Studio par la règle elle-même", !("clients" in tables));
    const ch2 = await updateProspect(db, r.prospect.id, { signed_amount: 4500 }, {});
    await afterProspectChange(db, ch2.before, ch2.after, ctx);
    ok("une seule proposition par prospect", (tables.marketing_client_proposals ?? []).length === 1 && runs(tables, "signed").length === 1);
    const { db: d2, tables: t2, ctx: c2 } = await world({ signed: { enabled: true, propose_client: false } });
    const r2 = await lead(d2, "sansprop@x.fr"); const c = await updateProspect(d2, r2.prospect.id, { outcome: "signe" }, {}); await afterProspectChange(d2, c.before, c.after, c2);
    ok("proposition éteinte : « Gagné » sans proposition", (t2.marketing_client_proposals ?? []).length === 0 && (await listStages(d2)).find((s) => s.id === (c.after.stage_id))?.key !== undefined);
    const { db: d3, tables: t3, ctx: c3 } = await world({ signed: { enabled: false, propose_client: true } });
    const r3 = await lead(d3, "off@x.fr"); const c4 = await updateProspect(d3, r3.prospect.id, { outcome: "signe" }, {}); await afterProspectChange(d3, c4.before, c4.after, c3);
    ok("règle éteinte : aucune proposition, aucune écriture au journal", (t3.marketing_client_proposals ?? []).length === 0 && runs(t3, "signed").length === 0);
  }

  console.log("Journal");
  { const { db, tables, ctx } = await world();
    const r = await lead(db, "j@x.fr"); await afterLeadReceived(db, r, ctx);
    const row = (tables.marketing_automation_runs ?? [])[0] as Row;
    ok("chaque exécution : règle, prospect, action en clair", row.rule === "new_lead" && row.prospect_id === r.prospect.id && String(row.action).startsWith("Attribué à") && row.ok === true);
  }

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
