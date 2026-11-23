/**
 * Vérification hors ligne des KPI (closing, setters, closers, semaines, suivi déclaré).
 * Lancer : pnpm dlx tsx scripts/kpi-selfcheck.ts
 */
import { buildKpi, KPI_TABS, kpiTab, weekOf } from "../src/lib/marketing/kpi";
import type { FactAppointment, FactProspect, FactTask } from "../src/lib/marketing/funnel";
import { fillTemplate, stageHex } from "../src/lib/marketing/ui";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const P = (id: string, over: Partial<FactProspect> = {}): FactProspect => ({ id, created_at: "2026-11-03T10:00:00Z", opted_in_at: null, source: "site", site: null, landing_page: null, utm: null, stage_id: null, stage_changed_at: null, call_result: null, outcome: null, signed_amount: null, value: null, setter_id: "s1", closer_id: "c1", ...over });
const A = (id: string, prospect: string, over: Partial<FactAppointment> = {}): FactAppointment => ({ id, prospect_id: prospect, starts_at: "2026-11-05T09:00:00Z", created_at: "2026-11-04T09:00:00Z", status: "confirme", result: "present", source: "iclosed", setter_id: null, closer_id: null, ...over });
const T = (id: string, prospect: string, over: Partial<FactTask> = {}): FactTask => ({ id, prospect_id: prospect, kind: "a_appeler", status: "faite", assignee_id: "s1", done_by: "s1", done_at: "2026-11-04T08:00:00Z", created_at: "2026-11-03T08:00:00Z", ...over });
const members = [{ id: "s1", name: "Sam Setter", marketing_role: "setter" }, { id: "s2", name: "Zoé Setter", marketing_role: "setter" }, { id: "c1", name: "Cléo Closer", marketing_role: "closer" }, { id: "c2", name: "Yan Closer", marketing_role: "closer" }, { id: "mb", name: "Max Media", marketing_role: "media_buyer" }];
const from = "2026-11-01T00:00:00Z", to = "2026-11-16T12:00:00Z", now = "2026-11-16T12:00:00Z";

const prospects = [
  P("p1", { outcome: "signe", signed_amount: 4000 }), P("p2", { outcome: "non_signe" }), P("p3", { outcome: "en_reflexion" }), P("p4"),
  P("p5", { closer_id: "c2", outcome: "signe", signed_amount: 2000, source: "ads" }), P("p6", { setter_id: "s2" }), P("p7"),
  P("p8", { call_result: "present", outcome: "signe", signed_amount: 1000, stage_changed_at: "2026-11-16T09:00:00Z", closer_id: "c2", setter_id: null, source: "ads" }),
  P("p9", { call_result: "absent", stage_changed_at: "2026-11-10T09:00:00Z", setter_id: null }),
  P("vieux", { created_at: "2026-09-01T10:00:00Z", outcome: "signe", signed_amount: 9999 }),
  P("p10", { stage_id: "st-gagne", signed_amount: 500, setter_id: null }),
];
const appointments = [
  A("a1", "p1"), A("a2", "p2"), A("a3", "p3"), A("a4", "p4", { result: "absent" }), A("a5", "p5", { starts_at: "2026-11-12T09:00:00Z" }),
  A("a6", "p6", { result: "a_venir", starts_at: "2026-11-10T09:00:00Z" }), A("a7", "p7", { status: "annule", result: "annule" }),
  A("a1b", "p1", { starts_at: "2026-11-13T09:00:00Z" }), A("av", "vieux", { starts_at: "2026-09-02T09:00:00Z" }), A("a10", "p10", { starts_at: "2026-11-06T09:00:00Z" }),
  A("futur", "p6", { result: "a_venir", starts_at: "2026-11-15T09:00:00Z", created_at: "2026-11-14T09:00:00Z" }),
];
const tasks = [T("t1", "p1"), T("t2", "p2"), T("t2b", "p2", { kind: "relance" }), T("t3", "p3", { status: "ouverte", done_by: null, done_at: null }), T("t4", "p4", { done_at: "2026-09-01T00:00:00Z" })];
const entries: Array<{ profile_id: string; day: string; metrics: Record<string, number> }> = [{ profile_id: "s1", day: "2026-11-04", metrics: { appels: 40, decroches: 10 } }, { profile_id: "s1", day: "2026-11-05", metrics: { appels: 35, messages: 12 } }, { profile_id: "s1", day: "2026-10-01", metrics: { appels: 999 } }, { profile_id: "c1", day: "2026-11-05", metrics: { relances: 6, propositions: 2, intrus: -4 } }];

const k = buildKpi({ prospects, appointments, tasks, entries, members, wonStages: ["st-gagne"], from, to, now });
const c = k.closing;

console.log("Closing");
ok("appels tenus : un par prospect, même avec deux rendez-vous « présent »", c.held === 6, String(c.held));
ok("un appel noté « présent » sur la fiche, sans rendez-vous, compte", k.closers.find((r) => r.id === "c2")!.held === 2);
ok("hors période : ignoré", !k.sources.some((s) => s.amount >= 9999));
ok("signés : issue « signé » ou étape Gagné", c.signed === 4 && c.amount === 7500, `${c.signed} / ${c.amount}`);
ok("taux de closing = signés ÷ appels tenus", c.closeRate === 66.7, String(c.closeRate));
ok("panier moyen", c.average === 1875);
ok("en réflexion et non signés comptés à part", c.thinking === 1 && c.notSigned === 1);
ok("absents : rendez-vous « absent » et appel noté absent à la main", c.noShow === 2, String(c.noShow));
ok("taux de présence = présents ÷ (présents + absents), sans les résultats non saisis", c.showRate === 77.8, String(c.showRate));
ok("rendez-vous annulé : jamais compté comme prévu", c.scheduled === 11, String(c.scheduled));
ok("résultats à saisir : seulement les rendez-vous passés sans résultat", c.pending === 2, String(c.pending));
const empty = buildKpi({ prospects: [], appointments: [], tasks: [], entries: [], members, from, to, now });
ok("sans appel : taux vides, jamais 0 % inventé", empty.closing.closeRate === null && empty.closing.showRate === null && empty.closing.average === null && empty.closing.amount === 0);

console.log("Par semaine");
ok("lundi de la semaine", weekOf("2026-11-05T09:00:00Z") === "2026-11-02" && weekOf("2026-11-16T00:00:00Z") === "2026-11-16" && weekOf("2026-11-15T23:00:00Z") === "2026-11-09");
ok("toutes les semaines de la période, semaine en cours comprise", k.weekly.map((w) => w.week).join(",") === "2026-10-26,2026-11-02,2026-11-09,2026-11-16", k.weekly.map((w) => w.week).join(","));
ok("la somme des semaines = le total", k.weekly.reduce((s, w) => s + w.held, 0) === c.held && k.weekly.reduce((s, w) => s + w.signed, 0) === c.signed && k.weekly.reduce((s, w) => s + w.amount, 0) === c.amount);
ok("un prospect est compté la semaine de son premier appel tenu", k.weekly.find((w) => w.week === "2026-11-02")!.held === 4 && k.weekly.find((w) => w.week === "2026-11-09")!.held === 1 && k.weekly.find((w) => w.week === "2026-11-16")!.held === 1);
ok("semaine sans appel : taux vide", k.weekly.find((w) => w.week === "2026-10-26")!.rate === null);

console.log("Closers");
const c1 = k.closers.find((r) => r.id === "c1")!, c2 = k.closers.find((r) => r.id === "c2")!;
ok("chaque closer a ses appels, ses signatures, son montant", c1.held === 4 && c1.signed === 2 && c1.amount === 4500 && c2.held === 2 && c2.signed === 2 && c2.amount === 3000, JSON.stringify([c1.held, c1.signed, c1.amount, c2.held, c2.signed, c2.amount]));
ok("taux de closing par closer", c1.closeRate === 50 && c2.closeRate === 100);
ok("la somme des closers = le total", k.closers.reduce((s, r) => s + r.held, 0) === c.held && k.closers.reduce((s, r) => s + r.amount, 0) === c.amount);
ok("classés par montant signé", k.closers[0].id === "c1");
ok("suivi déclaré du closer : sommé, valeurs négatives ignorées", c1.declared.relances === 6 && c1.declared.propositions === 2 && !("intrus" in c1.declared));
ok("un media buyer n'apparaît nulle part", !k.closers.some((r) => r.id === "mb") && !k.setters.some((r) => r.id === "mb"));

console.log("Setters");
const s1 = k.setters.find((r) => r.id === "s1")!, s2 = k.setters.find((r) => r.id === "s2")!;
ok("leads reçus : prospects de la période attribués au setter", s1.assigned === 6 && s2.assigned === 1, `${s1.assigned} / ${s2.assigned}`);
ok("rendez-vous pris : un annulé ne compte pas", s1.booked === 5 && s1.bookingRate === 83.3, `${s1.booked} / ${s1.bookingRate}`);
ok("leads traités : prospects différents, tâches terminées dans la période", s1.handled === 2);
ok("présence sur ses rendez-vous", s1.shown === 5 && s1.noShow === 1 && s1.showRate === 83.3, `${s1.shown} / ${s1.noShow} / ${s1.showRate}`);
ok("signé grâce à ses leads", s1.signed === 2 && s1.amount === 6000, `${s1.signed} / ${s1.amount}`);
ok("suivi déclaré : sommé sur la période seulement", s1.declared.appels === 75 && s1.declared.decroches === 10 && s1.declared.messages === 12);
ok("un setter sans activité est listé avec des zéros, taux vides", s2.booked === 1 && s2.showRate === null);

console.log("Par source");
const ads = k.sources.find((s) => s.label === "ads")!, site = k.sources.find((s) => s.label === "site")!;
ok("taux de closing par source", ads.held === 2 && ads.rate === 100 && site.held === 4 && site.rate === 50, JSON.stringify(k.sources));

console.log("Affichage");
ok("email type : variables remplacées, inconnue vidée", fillTemplate("Bonjour {{prenom}} de {{ entreprise }}{{inconnue}} — {{mon_prenom}}", { prenom: "Alice", entreprise: "Maison A", mon_prenom: "Ibra" }) === "Bonjour Alice de Maison A — Ibra");
console.log("Onglets de la page KPI");
ok("la saisie des KPI est le premier onglet", KPI_TABS[0][0] === "saisie" && KPI_TABS[0][1] === "Saisie des KPI" && KPI_TABS.map(([k]) => k).join(",") === "saisie,closing,setters,closers,suivi");
ok("ouvert par défaut : la saisie pour un setter ou un closer", kpiTab("", "setter") === "saisie" && kpiTab("", "closer") === "saisie");
ok("ouvert par défaut : le suivi du jour pour l'administrateur et l'agence", kpiTab("", null) === "suivi");
ok("ouvert par défaut : Closing pour un media buyer (il ne saisit rien)", kpiTab("", "media_buyer") === "closing");
ok("l'onglet demandé l'emporte, pour tous", kpiTab("saisie", null) === "saisie" && kpiTab("closing", "setter") === "closing" && kpiTab("suivi", "closer") === "suivi");
ok("onglet inconnu (ex. l'ancien « kpi ») : onglet par défaut", kpiTab("kpi", "setter") === "saisie" && kpiTab("<script>", null) === "suivi");

// Une étape en cours sans couleur choisie est grise (plus de bleu par défaut : l'accent de l'app est vert).
ok("couleur d'une colonne : choisie, sinon selon sa nature", stageHex({ kind: "ouvert", key: "x", color: "violet" }) === "#8b5fc7" && stageHex({ kind: "gagne", key: "gagne", color: null }) === "#2f9e5b" && stageHex({ kind: "perdu", key: "perdu", color: null }) === "#d1483f" && stageHex({ kind: "ouvert", key: "x", color: null }) === "#8a938a" && stageHex(null) === "#8a938a");

console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
if (fail) process.exit(1);
