/**
 * Vérification hors ligne du traitement de la boîte de réception (aucune base, aucun réseau).
 * Lancer : pnpm dlx tsx scripts/leads-inbox-selfcheck.ts
 */
import { parseLead, processRow, schedulerState, type InboxRepo, type LeadData } from "../src/lib/marketing/inbox-core";
import type { InboxAlert, InboxRow } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

const row = (over: Partial<InboxRow> = {}): InboxRow => ({
  id: over.id ?? "r1", request_id: "req-1", site: "iconflow.fr", landing_page: "/optin?utm_source=meta", page: "/optin", referrer: null,
  utm: { utm_source: "meta", utm_campaign: "sprint" }, payload: { email: "Jean@Exemple.fr", prenom: "Jean", marque: "Maison J" },
  received_at: "2026-11-15T08:00:00.000Z", status: "recu", error: null, attempts: 0, processed_at: null, prospect_id: null, is_test: false,
  alert_status: null, alert_error: null, updated_at: "2026-11-15T08:00:00.000Z", ...over,
});

/** Faux dépôt en mémoire : compte ce qui est écrit, comme le ferait la base. */
function fakeRepo(opts: { failWrite?: boolean; alert?: InboxAlert } = {}) {
  const prospects = new Map<string, { id: string; lead: LeadData }>();
  const marks: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const alerts: Array<{ kind: string; id: string }> = [];
  const repo: InboxRepo = {
    async upsertProspect(lead) {
      if (opts.failWrite) throw new Error("base injoignable");
      const existing = prospects.get(lead.email);
      if (existing) return { id: existing.id, created: false };
      const id = `p${prospects.size + 1}`; prospects.set(lead.email, { id, lead }); return { id, created: true };
    },
    async mark(id, patch) { marks.push({ id, patch }); },
    async notify(kind, r) { alerts.push({ kind, id: r.id }); return { status: opts.alert ?? "envoyee" }; },
  };
  return { repo, prospects, marks, alerts };
}
const apply = (r: InboxRow, patch: Record<string, unknown>): InboxRow => ({ ...r, ...patch } as InboxRow);

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
  ok("une alerte « nouveau lead » est émise", f1.alerts.length === 1 && f1.alerts[0].kind === "lead");

  console.log("Rejouable, sans doublon");
  const done = apply(row(), f1.marks[0].patch);
  const again = await processRow(done, f1.repo);
  ok("ligne déjà traitée : le planificateur la laisse", again.skipped === true && f1.prospects.size === 1);
  const forced = await processRow(done, f1.repo, { force: true });
  ok("« retraiter » rejoue sans créer de doublon", forced.status === "traite" && forced.created === false && f1.prospects.size === 1);
  ok("pas de deuxième alerte au retraitement", f1.alerts.length === 1);
  const second = await processRow(row({ id: "r2", request_id: "req-2" }), f1.repo);
  ok("même email sur une autre ligne → même prospect", second.prospectId === "p1" && second.created === false && f1.prospects.size === 1);

  console.log("Rien n'est ignoré en silence");
  const f2 = fakeRepo();
  const o2 = await processRow(row({ payload: { prenom: "Sans mail" } }), f2.repo);
  ok("ligne illisible → erreur, avec la raison", o2.status === "erreur" && /Email manquant/.test(String(f2.marks[0].patch.error)));
  ok("une alerte « erreur » est émise", f2.alerts[0]?.kind === "erreur");
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
  ok("lead de test : alerte émise quand même", f5.alerts.length === 1);
  const f6 = fakeRepo({ alert: "simulee" });
  await processRow(row(), f6.repo);
  ok("sans service d'envoi : alerte notée « simulée »", f6.marks[0].patch.alert_status === "simulee");
  const f7 = fakeRepo({ alert: "echec" });
  await processRow(row(), f7.repo);
  await processRow(apply(row(), f7.marks[0].patch), f7.repo, { force: true });
  ok("alerte en échec : retentée au retraitement", f7.alerts.length === 2);

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
