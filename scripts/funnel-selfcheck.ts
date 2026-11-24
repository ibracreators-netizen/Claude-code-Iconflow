/**
 * Vérification hors ligne de l'entonnoir (par page d'entrée et par campagne) et du périmètre d'un commercial.
 * Lancer : pnpm dlx tsx scripts/funnel-selfcheck.ts
 */
import { MemoryDb, scopeDb, type MemoryTables } from "../src/lib/marketing/db";
import { ensureStages, upsertLead } from "../src/lib/marketing/crm";
import { buildFunnel, type AdInsight, type FactAppointment, type FactProspect } from "../src/lib/marketing/funnel";
import { campaignInsightsUrl, mapInsight } from "../src/lib/marketing/ads-core";
import type { Contact, MarketingTask, Prospect } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const P = (id: string, over: Partial<FactProspect>): FactProspect => ({ id, created_at: "2026-11-05T10:00:00Z", opted_in_at: "2026-11-05T10:00:00Z", source: null, site: "iconflow.fr", landing_page: "/optin", utm: { utm_campaign: "Sprint" }, stage_id: null, call_result: null, outcome: null, signed_amount: null, value: null, setter_id: null, closer_id: null, ...over });
const A = (id: string, prospect: string, over: Partial<FactAppointment> = {}): FactAppointment => ({ id, prospect_id: prospect, starts_at: "2026-11-08T09:00:00Z", created_at: "2026-11-06T09:00:00Z", status: "confirme", result: "a_venir", source: "iclosed", setter_id: null, closer_id: null, ...over });

(async () => {
  const prospects = [
    P("p1", {}), P("p2", { outcome: "signe", signed_amount: 4000 }), P("p3", { landing_page: "/sans-optin?x=1" }), P("p4", { landing_page: "/sans-optin", utm: { utm_campaign: "sprint" } }),
    P("p5", { utm: { campaign_id: "999" }, landing_page: "/optin" }), P("p6", { utm: null, landing_page: null }), P("vieux", { opted_in_at: "2026-09-01T10:00:00Z" }),
    P("p7", { opted_in_at: null, created_at: "2026-11-10T10:00:00Z", utm: { utm_campaign: "Autre" }, stage_id: "st-gagne", signed_amount: 1000 }),
  ];
  const appointments = [A("a1", "p1", { result: "present" }), A("a2", "p2", { result: "present" }), A("a3", "p3", { status: "annule", result: "annule" }), A("a4", "p4", { result: "absent" }), A("a5", "p5")];
  const insights: AdInsight[] = [
    { day: "2026-11-05", campaign_id: "111", campaign_name: "Sprint", spend: 300, impressions: 1000, clicks: 50 }, { day: "2026-11-06", campaign_id: "111", campaign_name: "Sprint", spend: 100, impressions: 500, clicks: 20 },
    { day: "2026-11-06", campaign_id: "999", campaign_name: "Nom différent côté Meta", spend: 50, impressions: 100, clicks: 5 }, { day: "2026-11-07", campaign_id: "222", campaign_name: "Sans lead", spend: 80, impressions: 100, clicks: 1 },
    { day: "2026-09-01", campaign_id: "111", campaign_name: "Sprint", spend: 9999, impressions: 1, clicks: 1 },
  ];
  const base = { prospects, appointments, insights, wonStages: ["st-gagne"], from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" };

  console.log("Par campagne");
  const c = buildFunnel({ ...base, by: "campaign" });
  const sprint = c.rows.find((r) => r.key.toLowerCase() === "sprint")!;
  ok("cohorte : seuls les leads de la période (opt-in, sinon création)", c.total.leads === 7 && !c.rows.some((r) => r.leads > 7));
  ok("« Sprint » et « sprint » : la même campagne", c.rows.filter((r) => r.key.toLowerCase() === "sprint").length === 1 && sprint.leads === 4, JSON.stringify(c.rows.map((r) => [r.key, r.leads])));
  ok("RDV pris : un rendez-vous annulé ne compte pas", sprint.booked === 3);
  ok("présents, signés, montant", sprint.showed === 2 && sprint.signed === 1 && sprint.amount === 4000);
  ok("dépense de la période seulement, coût par lead et par rendez-vous", sprint.spend === 400 && sprint.costPerLead === 100 && sprint.costPerBooking === 133.33);
  const byId = c.rows.find((r) => r.label === "999")!;
  ok("campagne rattachée par son identifiant Meta quand le nom diffère", byId.leads === 1 && byId.spend === 50);
  ok("campagne qui dépense sans lead : affichée, coût par lead vide", c.rows.some((r) => r.label === "Sans lead" && r.spend === 80 && r.leads === 0 && r.costPerLead === null));
  ok("étape « Gagné » comptée comme signée", c.rows.find((r) => r.label === "Autre")!.signed === 1 && c.rows.find((r) => r.label === "Autre")!.amount === 1000);
  ok("lead sans campagne regroupé à part", c.rows.some((r) => r.label === "(sans campagne)" && r.leads === 1));
  ok("total : dépense de toutes les campagnes", c.total.spend === 530 && c.total.amount === 5000);

  console.log("Par page d'entrée");
  const g = buildFunnel({ ...base, by: "landing_page" });
  const optin = g.rows.find((r) => r.key === "/optin")!, sans = g.rows.find((r) => r.key === "/sans-optin")!;
  ok("la page est comptée sans ses paramètres", sans.leads === 2 && optin.leads === 4, JSON.stringify(g.rows.map((r) => [r.key, r.leads])));
  ok("comparaison page optin / page sans optin", optin.booked === 3 && sans.booked === 1 && optin.signed === 2 && sans.signed === 0);
  ok("dépense répartie au prorata des leads de chaque campagne", optin.spend === 250 && sans.spend === 200, `${optin.spend} / ${sans.spend}`);
  ok("dépense des campagnes sans lead : dans le total, signalée à part", g.unattributedSpend === 80 && g.total.spend === 530);
  const none = buildFunnel({ ...base, insights: [], by: "campaign" });
  ok("sans dépense connue : coûts vides, jamais de zéro inventé", !none.hasSpend && none.total.spend === null && none.rows.every((r) => r.spend === null && r.costPerLead === null));

  console.log("Lecture Meta");
  ok("ligne Meta traduite (campagne, jour, dépense)", mapInsight({ campaign_id: "1", campaign_name: "X", spend: "12.50", impressions: "100", clicks: "3", date_start: "2026-11-05" })!.spend === 12.5 && mapInsight({ spend: "1" }) === null);
  const u = new URL(campaignInsightsUrl({ version: "v21.0", accountId: "123", since: "2026-08-01", until: "2026-11-15" }));
  ok("demande : niveau campagne, par jour, sans jeton dans l'adresse", u.pathname === "/v21.0/act_123/insights" && u.searchParams.get("level") === "campaign" && u.searchParams.get("time_increment") === "1" && !u.search.includes("access_token"));

  console.log("Périmètre d'un commercial (mêmes règles que la base)");
  const tables: MemoryTables = {}; const root = new MemoryDb(tables, null); await ensureStages(root);
  const a = await upsertLead(root, { email: "a@exemple.fr", name: "A", setter_id: "setter-a", closer_id: "closer" }, { kind: "cree", label: "test" });
  const b = await upsertLead(root, { email: "b@exemple.fr", name: "B", setter_id: "setter-b" }, { kind: "cree", label: "test" });
  await root.insert("marketing_tasks", { prospect_id: a.prospect.id, title: "À appeler A", assignee_id: "setter-a" });
  await root.insert("marketing_tasks", { prospect_id: b.prospect.id, title: "À appeler B", assignee_id: "setter-b" });
  const setter = scopeDb(new MemoryDb(tables, "setter-a"), { id: "setter-a", role: "setter" }, tables);
  ok("setter : seulement ses prospects, contacts et tâches", (await setter.list<Prospect>("marketing_prospects")).length === 1 && (await setter.list<Contact>("marketing_contacts"))[0].email === "a@exemple.fr" && (await setter.list<MarketingTask>("marketing_tasks")).length === 1);
  ok("setter : la fiche d'un autre est introuvable", (await setter.get("marketing_prospects", b.prospect.id)) === null && (await setter.get("marketing_contacts", b.contact.id)) === null);
  let denied = false; try { await setter.update("marketing_prospects", b.prospect.id, { notes: "x" }); } catch { denied = true; }
  ok("setter : ne modifie pas le prospect d'un autre", denied);
  denied = false; try { await setter.update("marketing_prospects", a.prospect.id, { setter_id: "setter-b", closer_id: null }); } catch { denied = true; }
  ok("setter : ne peut pas réattribuer son prospect", denied);
  denied = false; try { await setter.insert("marketing_prospects", { name: "Volé", setter_id: "setter-b" }); } catch { denied = true; }
  ok("setter : ne crée pas un prospect pour un autre", denied);
  const own = await upsertLead(setter, { email: "nouveau@exemple.fr", name: "Nouveau", setter_id: "setter-a" }, { kind: "cree", label: "Saisie à la main" });
  ok("setter : crée un prospect pour lui-même", own.createdProspect && (await setter.list<Prospect>("marketing_prospects")).length === 2);
  const closer = scopeDb(new MemoryDb(tables, "closer"), { id: "closer", role: "closer" }, tables);
  ok("closer : voit le prospect dont il est le closer", (await closer.list<Prospect>("marketing_prospects")).length === 1);
  const media = scopeDb(new MemoryDb(tables, "media"), { id: "media", role: "media_buyer" }, tables);
  ok("media buyer : aucun prospect, contact ni tâche", (await media.list("marketing_prospects")).length === 0 && (await media.list("marketing_contacts")).length === 0 && (await media.list("marketing_tasks")).length === 0 && (await media.list("leads_inbox")).length === 0);
  ok("les étapes restent lisibles par tous, non modifiables par un commercial", (await setter.list("marketing_pipeline_stages")).length === 7);

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
