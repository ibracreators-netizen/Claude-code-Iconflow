/**
 * Vérification hors ligne des KPI (closing, setters, closers, semaines, suivi déclaré).
 * Lancer : pnpm dlx tsx scripts/kpi-selfcheck.ts
 */
import { buildKpi, KPI_TABS, kpiTab, weekOf } from "../src/lib/marketing/kpi";
import type { FactAppointment, FactProspect, FactTask } from "../src/lib/marketing/funnel";
import { fillTemplate, stageHex } from "../src/lib/marketing/ui";
import {
  closerFunnel, closerLosses, closerRates, closerReport, closerSummary, closerTotals, closerWarnings, groupFields, hasCloserFigures, hasFunnelFigures, hasSetterFigures,
} from "../src/lib/marketing/closer-report";
import { KPI_FIELDS, KPI_MAX_COUNT, KPI_MAX_EURO, kpiValueError } from "../src/lib/marketing/types";
import { sampleMarketingData } from "../src/lib/marketing/demo-sample";
import { cardsFor, closerPart, perfMode, ranking } from "../src/app/(marketing)/marketing/acquisition/perf";
import type { DeclaredRow, Person } from "../src/lib/marketing/dashboard-server";

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

console.log("Rapport des closers : champs");
const closerKeys = KPI_FIELDS.closer.map((f) => f.key).join(",");
ok("douze champs closer, dans l'ordre, anciennes clés gardées en dernier", closerKeys === "rdv_prevus,show_up,no_show,annules,non_qualifies,pitchs,closes,en_reflexion,cash,ca_signe,relances,propositions", closerKeys);
ok("champs des setters inchangés", KPI_FIELDS.setter.map((f) => f.key).join(",") === "appels,decroches,messages,conversations");
ok("cash et CA signé en euros, le reste en nombre", KPI_FIELDS.closer.filter((f) => f.unit === "euro").map((f) => f.key).join(",") === "cash,ca_signe");
ok("groupes du formulaire : Rendez-vous, Résultats des appels, Argent, Suivi", groupFields(KPI_FIELDS.closer).map(([g, l]) => `${g}:${l.length}`).join("|") === "Rendez-vous:4|Résultats des appels:4|Argent:2|Suivi:2");
ok("setter : un seul groupe sans intitulé", groupFields(KPI_FIELDS.setter).length === 1 && groupFields(KPI_FIELDS.setter)[0][0] === null);
const cashF = KPI_FIELDS.closer.find((f) => f.key === "cash")!, showF = KPI_FIELDS.closer.find((f) => f.key === "show_up")!;
ok("limites : nombre jusqu'à 10 000, montant jusqu'à 1 000 000 €", KPI_MAX_COUNT === 10_000 && KPI_MAX_EURO === 1_000_000 && kpiValueError(showF, 10_000) === null && kpiValueError(cashF, 1_000_000) === null);
ok("au-delà : refusé avec un message en français (rien n'est raboté)", /10\u00a0000 au plus/.test(kpiValueError(showF, 10_001) ?? "") && /1\u00a0000\u00a0000\u00a0€ au plus/.test(kpiValueError(cashF, 1_000_001) ?? ""));
ok("négatif, décimal, texte : refusés", /négatif/.test(kpiValueError(showF, -1) ?? "") && /entier/.test(kpiValueError(showF, 1.5) ?? "") && /euros entiers/.test(kpiValueError(cashF, 9.99) ?? "") && /nombre/.test(kpiValueError(showF, "3") ?? ""));

console.log("Rapport des closers : calculs");
const days = [
  { day: "2026-11-02", metrics: { rdv_prevus: 6, show_up: 4, no_show: 1, annules: 1, non_qualifies: 1, pitchs: 3, closes: 1, en_reflexion: 1, cash: 1500, ca_signe: 3000, relances: 2 } },
  { day: "2026-11-03", metrics: { rdv_prevus: 4, show_up: 4, no_show: 0, pitchs: 3, closes: 2, ca_signe: 5000, cash: 2500, intrus: 99, propositions: -3 } },
  { day: "2026-11-03", metrics: { relances: 4, propositions: 1 } },
  { day: "2026-11-04", metrics: null as unknown as Record<string, number> },
];
const rep = closerReport(days);
ok("totaux : sommés, valeur négative ou clé inconnue ignorée", rep.totals.rdv_prevus === 10 && rep.totals.show_up === 8 && rep.totals.closes === 3 && rep.totals.cash === 4000 && rep.totals.ca_signe === 8000 && rep.totals.relances === 6 && rep.totals.propositions === 1 && !("intrus" in rep.totals), JSON.stringify(rep.totals));
ok("jours saisis : jours différents", rep.days === 3, String(rep.days));
ok("taux de show-up = show-up ÷ (show-up + no-show)", rep.rates.showRate === 88.9, String(rep.rates.showRate));
ok("taux de pitch = pitchs ÷ show-up", rep.rates.pitchRate === 75, String(rep.rates.pitchRate));
ok("taux de closing = closes ÷ show-up", rep.rates.closeRate === 37.5, String(rep.rates.closeRate));
ok("closing sur pitch = closes ÷ pitchs", rep.rates.pitchClose === 50, String(rep.rates.pitchClose));
ok("part de non qualifiés = non qualifiés ÷ show-up", rep.rates.unqualified === 12.5, String(rep.rates.unqualified));
ok("panier moyen = CA signé ÷ closes", rep.rates.average === 2666.67, String(rep.rates.average));
const zero = closerRates(closerTotals([]));
ok("base nulle : chaque taux est vide (null), jamais 0 %", Object.values(zero).every((v) => v === null));
ok("panier moyen vide sans close, même avec du CA", closerRates(closerTotals([{ metrics: { ca_signe: 900, show_up: 2 } }])).average === null);
ok("chiffres présents : closer, setter, entonnoir", hasCloserFigures({ relances: 1 }) && !hasCloserFigures({ appels: 5 }) && hasSetterFigures({ appels: 5 }) && !hasFunnelFigures(closerTotals([{ metrics: { relances: 4 } }])) && hasFunnelFigures(rep.totals));
const funnel = closerFunnel(rep.totals);
ok("entonnoir : prévus → show-up → pitchs → closes, part de l'étape précédente", funnel.map((s) => `${s.key}:${s.count}:${s.ofPrevious}`).join("|") === "rdv_prevus:10:null|show_up:8:80|pitchs:6:75|closes:3:50", funnel.map((s) => `${s.key}:${s.count}:${s.ofPrevious}`).join("|"));
const losses = closerLosses(rep.totals);
ok("pertes : no-show et annulés (des prévus), non qualifiés (des show-up), en réflexion (des pitchs)", losses.map((l) => `${l.key}:${l.count}:${l.share}`).join("|") === "no_show:1:10|annules:1:10|non_qualifies:1:12.5|en_reflexion:1:16.7", losses.map((l) => `${l.key}:${l.count}:${l.share}`).join("|"));

console.log("Rapport des closers : avertissements doux");
ok("saisie cohérente : aucun avertissement", closerWarnings({ rdv_prevus: 5, show_up: 3, no_show: 1, annules: 1, non_qualifies: 1, pitchs: 2, closes: 1, en_reflexion: 1, ca_signe: 2000 }).length === 0);
ok("show-up + no-show + annulés > prévus", closerWarnings({ rdv_prevus: 3, show_up: 3, no_show: 1 }).includes("Show-up, no-show et annulés dépassent les appels prévus."));
ok("prévus à 0 : pas d'avertissement sur les prévus", !closerWarnings({ show_up: 3, no_show: 1 }).some((w) => w.includes("prévus")));
ok("non qualifiés + pitchs > show-up", closerWarnings({ show_up: 2, non_qualifies: 1, pitchs: 2 }).includes("Non qualifiés et pitchs dépassent les show-up."));
ok("closes + en réflexion > pitchs", closerWarnings({ show_up: 3, pitchs: 2, closes: 2, en_reflexion: 1, ca_signe: 10 }).includes("Closes et en réflexion dépassent les pitchs."));
ok("closes sans CA signé", closerWarnings({ show_up: 1, pitchs: 1, closes: 1 }).includes("Tu as des closes : pense au CA signé.") && !closerWarnings({ show_up: 1, pitchs: 1, closes: 1, ca_signe: 1500 }).length);
ok("cases vides (texte vide) comptées à 0", closerWarnings({ rdv_prevus: "" as unknown as number, closes: "" as unknown as number }).length === 0);

console.log("Rapport des closers : résumés");
ok("résumé d'un jour : chiffres clés non nuls", closerSummary({ show_up: 3, pitchs: 2, closes: 1, cash: 1500, no_show: 1 }).replace(/[\u202f\u00a0]/g, " ") === "3 show-up · 2 pitchs · 1 close · 1 500 € cash", closerSummary({ show_up: 3, pitchs: 2, closes: 1, cash: 1500 }));
ok("singulier et pluriel", closerSummary({ pitchs: 1, closes: 2 }) === "1 pitch · 2 closes");
ok("ancienne saisie (relances, propositions) : résumée avec ses champs", closerSummary({ relances: 6, propositions: 2 }) === "6 relances · 2 propositions", closerSummary({ relances: 6, propositions: 2 }));
ok("rien de saisi : résumé vide", closerSummary({}) === "");

console.log("Tableau de bord : cartes et classement");
ok("mode : le rôle connecté l'emporte, sinon le filtre", perfMode("closer", "tous") === "closer" && perfMode("setter", "closers") === "setter" && perfMode(null, "closers") === "closer" && perfMode(null, "setters") === "setter" && perfMode(null, "tous") === "tous");
const curT = { appels: 100, decroches: 30, conversations: 12, messages: 0, rdv_prevus: 10, show_up: 8, no_show: 2, pitchs: 6, closes: 3, cash: 4000, ca_signe: 9000 };
const prevT = { appels: 80, decroches: 20, conversations: 10, rdv_prevus: 0, show_up: 4, no_show: 4, pitchs: 2, closes: 1, cash: 0, ca_signe: 1000 };
const cc = cardsFor("closer", curT, prevT);
ok("closers : six cartes, dans l'ordre", cc.map((c) => c.field.key).join(",") === "rdv_prevus,show_up,pitchs,closes,cash,ca_signe");
ok("closers : taux de show-up, de pitch, de closing, panier moyen", cc[1].rate?.value === 80 && cc[2].rate?.value === 75 && cc[3].rate?.value === 37.5 && cc[5].rate?.value === 3000 && cc[5].rate?.unit === "euro");
ok("écart : en % de la période d'avant, « nouveau » si elle était à 0, en points pour un taux", JSON.stringify(cc[1].change) === JSON.stringify({ kind: "pct", value: 100 }) && cc[0].change?.kind === "new" && JSON.stringify(cc[1].rate?.change) === JSON.stringify({ kind: "pt", value: 30 }));
ok("toute l'équipe : appels, conversations, show-up, pitchs, closes, cash", cardsFor("tous", curT, prevT).map((c) => c.field.key).join(",") === "appels,conversations,show_up,pitchs,closes,cash");
ok("setters : les quatre indicateurs, inchangés", cardsFor("setter", curT, prevT).map((c) => c.field.key).join(",") === "appels,decroches,messages,conversations" && cardsFor("setter", curT, prevT)[1].rate?.value === 30);
ok("champs closer pris dans des totaux déclarés", closerPart(curT).closes === 3 && closerPart({}).cash === 0);
const P2 = (who: string, name: string, role: Person["role"]): Person => ({ who, name, role, viaLink: false, href: null, expected: true, lastEntryAt: null });
const R = (who: string, day: string, metrics: Record<string, number>): DeclaredRow => ({ who, day, at: `${day}T10:00:00Z`, metrics });
const ppl = [P2("m:a", "Alice", "closer"), P2("m:b", "Bruno", "closer"), P2("m:c", "Chloé", "closer"), P2("m:s", "Sam", "setter")];
const rws = [R("m:a", "2026-11-02", { closes: 2, cash: 1000 }), R("m:b", "2026-11-02", { closes: 2, cash: 3000 }), R("m:c", "2026-11-02", { closes: 3 }), R("m:s", "2026-11-02", { appels: 50 })];
ok("classement des closers : closes, puis cash, puis CA", ranking(rws, ppl, "closer").map((r) => r.person.name).join(",") === "Chloé,Bruno,Alice,Sam");
ok("classement de toute l'équipe : appels d'abord, puis closes", ranking(rws, ppl, "tous").map((r) => r.person.name).join(",") === "Sam,Chloé,Alice,Bruno");
ok("classement : taux du closer calculés", ranking([R("m:a", "2026-11-02", { show_up: 4, no_show: 1, closes: 1 })], ppl, "closer")[0].closer.showRate === 80);

console.log("Données d'exemple");
const sample = sampleMarketingData(new Date("2026-11-23T10:00:00Z"));
const closerDays = [...sample.kpiEntries, ...sample.memberEntries].map((e) => e.metrics).filter(hasCloserFigures);
ok("des saisies de closer d'exemple (lien et compte d'essai)", closerDays.length >= 20 && sample.memberEntries.some((e) => e.profile_id === "demo-closer"));
ok("cohérentes : aucun avertissement, cash ≤ CA signé", closerDays.every((m) => closerWarnings(m).length === 0 && (m.cash ?? 0) <= (m.ca_signe ?? 0)));
ok("les noms d'exemple restent signalés « (exemple) »", sample.kpiPeople.every((p) => p.name.includes("(exemple)")));

console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
if (fail) process.exit(1);
