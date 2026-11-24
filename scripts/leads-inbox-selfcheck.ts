/**
 * Vérification hors ligne du traitement de la boîte de réception (aucune base, aucun réseau).
 * Lancer : pnpm dlx tsx scripts/leads-inbox-selfcheck.ts
 */
import { ALERTS_PER_DAY, ALERTS_PER_HOUR, buildAlert, flushAlerts, parseLead, processRow, schedulerState, type AlertGateway, type AlertMessage, type InboxRepo, type LeadData } from "../src/lib/marketing/inbox-core";
import type { InboxRow } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

const row = (over: Partial<InboxRow> = {}): InboxRow => ({
  id: over.id ?? "r1", request_id: "req-1", site: "iconflow.fr", landing_page: "/optin?utm_source=meta", page: "/optin", referrer: null,
  utm: { utm_source: "meta", utm_campaign: "sprint" }, payload: { email: "Jean@Exemple.fr", prenom: "Jean", marque: "Maison J" },
  received_at: "2026-11-15T08:00:00.000Z", status: "recu", error: null, attempts: 0, processed_at: null, prospect_id: null, is_test: false,
  alert_status: null, alert_error: null, updated_at: "2026-11-15T08:00:00.000Z", ...over,
});

/** Faux dépôt en mémoire : compte ce qui est écrit, comme le ferait la base. */
function fakeRepo(opts: { failWrite?: boolean; table?: InboxRow[] } = {}) {
  const prospects = new Map<string, { id: string; lead: LeadData }>();
  const marks: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const table = opts.table ?? [];
  const repo: InboxRepo = {
    async upsertProspect(lead) {
      if (opts.failWrite) throw new Error("base injoignable");
      const existing = prospects.get(lead.email);
      if (existing) return { id: existing.id, created: false };
      const id = `p${prospects.size + 1}`; prospects.set(lead.email, { id, lead }); return { id, created: true };
    },
    async mark(id, patch) { marks.push({ id, patch }); const r = table.find((x) => x.id === id); if (r) Object.assign(r, patch); },
    async pendingAlerts() {
      const all = table.filter((r) => r.alert_status === null && (r.status === "traite" || r.status === "erreur") && r.processed_at);
      return { rows: all.slice(0, 30), ids: all.map((r) => r.id), suspectIds: table.filter((r) => r.status === "suspect" && r.alert_status === null).map((r) => r.id) };
    },
    async markAlerts(ids, status, error) { for (const r of table) if (ids.includes(r.id)) Object.assign(r, { alert_status: status, alert_error: error ?? null }); },
  };
  return { repo, prospects, marks, table };
}
/** Fausse passerelle d'envoi : garde les messages partis et compte comme la vraie. */
function fakeGateway(opts: { recipients?: number; mailerReady?: boolean; hour?: number; day?: number; fail?: boolean } = {}) {
  const sent: AlertMessage[] = [];
  let hour = opts.hour ?? 0, day = opts.day ?? 0;
  const gw: AlertGateway = {
    recipients: opts.recipients ?? 1, mailerReady: opts.mailerReady ?? true,
    sent: async () => ({ hour, day }),
    async send(m) { if (opts.fail) return { ok: false, error: "service indisponible" }; sent.push(m); hour++; day++; return { ok: true }; },
  };
  return { gw, sent };
}
const apply = (r: InboxRow, patch: Record<string, unknown>): InboxRow => ({ ...r, ...patch } as InboxRow);
const done = (n: number, over: Partial<InboxRow> = {}) => Array.from({ length: n }, (_, k) => row({ id: `d${k}`, request_id: `q${k}`, status: "traite", processed_at: "2026-11-15T08:01:00.000Z", payload: { email: `lead${k}@exemple.fr` }, ...over }));

(async () => {
  console.log("Lecture de la charge utile");
  const a = parseLead(row());
  ok("email mis en minuscules", a.ok && a.lead.email === "jean@exemple.fr");
  ok("prénom repris comme nom", a.ok && a.lead.name === "Jean");
  ok("page d'entrée conservée", a.ok && a.lead.landing_page === "/optin?utm_source=meta");
  ok("paramètres de campagne conservés", a.ok && a.lead.utm?.utm_campaign === "sprint");
  ok("source déduite du site et de la page", a.ok && a.lead.source === "iconflow.fr/optin");
  const noMail = parseLead(row({ payload: { prenom: "Jean" } }));
  ok("email manquant → erreur expliquée", !noMail.ok && /Email manquant/.test(noMail.error));
  const badMail = parseLead(row({ payload: { email: "pas-un-email" } }));
  ok("email invalide → erreur expliquée", !badMail.ok && /invalide/.test(badMail.error));
  const notObject = parseLead(row({ payload: "texte" as unknown as Record<string, unknown> }));
  ok("charge illisible → erreur expliquée", !notObject.ok && /illisible/.test(notObject.error));
  const fromPayload = parseLead(row({ site: null, landing_page: null, page: null, utm: {}, payload: { email: "a@b.fr", site: "autre.fr", landing_page: "/lp", page: "/form", utm: { utm_source: "tiktok" } } }));
  ok("origine lue dans la charge si les colonnes sont vides", fromPayload.ok && fromPayload.lead.site === "autre.fr" && fromPayload.lead.landing_page === "/lp" && fromPayload.lead.utm?.utm_source === "tiktok");

  console.log("Traitement d'une ligne");
  const f1 = fakeRepo();
  const o1 = await processRow(row(), f1.repo);
  ok("ligne reçue → traitée, prospect créé", o1.status === "traite" && o1.created === true && f1.prospects.size === 1);
  ok("la ligne est marquée traitée avec le prospect", f1.marks[0].patch.status === "traite" && f1.marks[0].patch.prospect_id === "p1");
  ok("l'alerte ne part pas ligne par ligne : elle reste à envoyer", f1.marks[0].patch.alert_status === undefined);

  console.log("Rejouable, sans doublon");
  const treated = apply(row(), f1.marks[0].patch);
  const again = await processRow(treated, f1.repo);
  ok("ligne déjà traitée : le planificateur la laisse", again.skipped === true && f1.prospects.size === 1);
  const forced = await processRow(treated, f1.repo, { force: true });
  ok("« retraiter » rejoue sans créer de doublon", forced.status === "traite" && forced.created === false && f1.prospects.size === 1);
  ok("alerte déjà partie : le retraitement ne la relance pas", (await processRow(apply(treated, { alert_status: "envoyee" }), f1.repo, { force: true })).status === "traite" && f1.marks[f1.marks.length - 1].patch.alert_status === undefined);
  const second = await processRow(row({ id: "r2", request_id: "req-2" }), f1.repo);
  ok("même email sur une autre ligne → même prospect", second.prospectId === "p1" && second.created === false && f1.prospects.size === 1);

  console.log("Rien n'est ignoré en silence");
  const f2 = fakeRepo();
  const o2 = await processRow(row({ payload: { prenom: "Sans mail" } }), f2.repo);
  ok("ligne illisible → erreur, avec la raison", o2.status === "erreur" && /Email manquant/.test(String(f2.marks[0].patch.error)));
  ok("aucun prospect créé sur erreur", f2.prospects.size === 0);
  const f3 = fakeRepo({ failWrite: true });
  const o3 = await processRow(row(), f3.repo);
  ok("écriture impossible → erreur, ligne conservée", o3.status === "erreur" && /base injoignable/.test(String(f3.marks[0].patch.error)));
  const retried = await processRow(apply(row(), f3.marks[0].patch), fakeRepo().repo, { force: true });
  ok("une ligne en erreur se retraite avec succès", retried.status === "traite");

  console.log("Suspect et test");
  const f4 = fakeRepo();
  const o4 = await processRow(row({ status: "suspect", error: "Clé de site absente ou inconnue" }), f4.repo);
  ok("ligne suspecte : jamais traitée toute seule", o4.skipped === true && f4.prospects.size === 0 && f4.marks.length === 0);
  const o4b = await processRow(row({ status: "suspect" }), f4.repo, { force: true });
  ok("ligne suspecte : traitée sur demande humaine", o4b.status === "traite" && f4.prospects.size === 1);
  const f5 = fakeRepo();
  const o5 = await processRow(row({ is_test: true }), f5.repo);
  ok("lead de test : traité, aucun prospect", o5.status === "traite" && f5.prospects.size === 0 && f5.marks[0].patch.prospect_id === undefined);
  const f7 = fakeRepo();
  await processRow(row({ status: "traite", alert_status: "echec" }), f7.repo, { force: true });
  ok("alerte en échec : remise à envoyer au retraitement", f7.marks[0].patch.alert_status === null);

  console.log("Alertes regroupées");
  const one = fakeRepo({ table: done(1) }), g1 = fakeGateway();
  const r1 = await flushAlerts(one.repo, g1.gw);
  ok("un seul lead : un email détaillé", r1.sent === 1 && g1.sent.length === 1 && /^Nouveau lead/.test(g1.sent[0].subject) && one.table[0].alert_status === "envoyee");
  ok("rien en attente : aucun email", (await flushAlerts(one.repo, g1.gw)).status === "aucune" && g1.sent.length === 1);
  const many = fakeRepo({ table: done(1000) }), g2 = fakeGateway();
  let mails = 0; for (let k = 0; k < 10; k++) mails += (await flushAlerts(many.repo, g2.gw)).sent;
  ok("1 000 leads d'un coup : un seul email", mails === 1 && g2.sent.length === 1, `(${mails} emails)`);
  ok("le premier message annonce le total", /1000 leads reçus/.test(g2.sent[0].subject) && g2.sent[0].lines.length === 26);
  ok("toutes les lignes finissent signalées", many.table.every((r) => r.alert_status === "envoyee"));
  const capped = fakeRepo({ table: done(3) }), g3 = fakeGateway({ hour: ALERTS_PER_HOUR });
  const r3 = await flushAlerts(capped.repo, g3.gw);
  ok("plafond horaire atteint : rien ne part, rien n'est perdu", r3.status === "differee" && r3.deferred === 3 && g3.sent.length === 0 && capped.table.every((r) => r.alert_status === null));
  const g3b = fakeGateway({ day: ALERTS_PER_DAY });
  ok("plafond quotidien atteint : même règle", (await flushAlerts(capped.repo, g3b.gw)).status === "differee");
  const g3c = fakeGateway();
  ok("heure suivante : un seul message pour tout ce qui attendait", (await flushAlerts(capped.repo, g3c.gw)).sent === 1 && /3 leads reçus/.test(g3c.sent[0].subject));
  const mute = fakeRepo({ table: done(2) });
  ok("aucune adresse saisie : noté « aucun destinataire »", (await flushAlerts(mute.repo, fakeGateway({ recipients: 0 }).gw)).status === "aucun_destinataire" && mute.table[0].alert_status === "aucun_destinataire");
  const sim = fakeRepo({ table: done(2) });
  ok("sans service d'envoi : noté « simulée »", (await flushAlerts(sim.repo, fakeGateway({ mailerReady: false }).gw)).status === "simulee" && sim.table[1].alert_status === "simulee");
  const ko = fakeRepo({ table: done(2) });
  ok("envoi en échec : noté « échec », pas de boucle", (await flushAlerts(ko.repo, fakeGateway({ fail: true }).gw)).status === "echec" && (await flushAlerts(ko.repo, fakeGateway({ fail: true }).gw)).status === "aucune");
  const few = fakeRepo({ table: done(4, { status: "suspect", processed_at: null }) }), g4 = fakeGateway();
  ok("quelques lignes suspectes : pas d'email", (await flushAlerts(few.repo, g4.gw)).status === "aucune" && g4.sent.length === 0);
  const flood = fakeRepo({ table: done(300, { status: "suspect", processed_at: null }) }), g5 = fakeGateway();
  ok("afflux de lignes suspectes : un seul email d'alerte", (await flushAlerts(flood.repo, g5.gw)).sent === 1 && /afflux inhabituel \(300 lignes suspectes\)/.test(g5.sent[0].subject) && (await flushAlerts(flood.repo, g5.gw)).status === "aucune");
  const err = buildAlert([row({ status: "erreur", error: "Email manquant dans la charge utile.", processed_at: "x", payload: { prenom: "Sans mail" } })], 1, 0);
  ok("une erreur seule : email « lead en erreur » avec la raison", /^Lead en erreur/.test(err.subject) && /Email manquant/.test(err.intro));

  console.log("Planificateur");
  const now = Date.parse("2026-11-15T10:00:00Z");
  const beat = (min: number) => ({ last_run_at: new Date(now - min * 60_000).toISOString(), ok: true, detail: null, inbox: null, outbox: null });
  ok("jamais exécuté", schedulerState(null, now) === "jamais");
  ok("actif (1 min)", schedulerState(beat(1), now) === "ok");
  ok("en retard (8 min)", schedulerState(beat(8), now) === "en_retard");
  ok("arrêté (20 min)", schedulerState(beat(20), now) === "arrete");

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
