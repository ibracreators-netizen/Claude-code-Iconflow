/**
 * Vérification hors ligne des liens de saisie des KPI (migration 0028) : jeton, champs par rôle, fenêtre des jours,
 * enregistrement et correction d'une saisie, lien désactivé ou renouvelé, totaux déclarés, et les liens de l'app qui
 * mènent à la saisie (KPI › Saisie des KPI).
 * Lancer : pnpm dlx tsx scripts/kpi-links-selfcheck.ts
 */
import { MemoryDb, scopeDb, type MemoryTables } from "../src/lib/marketing/db";
import {
  activePersonByToken, cleanKpiInput, createPerson, dayLabel, declaredTotals, deletePerson, entryWindow, ENTRIES_TABLE, firstName, forDay, isKpiToken, kpiInputNumber, kpiLinkPath,
  listPeople, newKpiToken, parseEntryInput, parsePersonInput, PEOPLE_TABLE, personEntries, renewToken, saveLinkEntry, setPersonActive, shiftDay, todayIn, TOKEN_RE,
  type KpiPerson, type KpiPersonEntry,
} from "../src/lib/marketing/kpi-links";
import { KPI_FIELDS, kpiValueError } from "../src/lib/marketing/types";
import { redactSecretPaths } from "../src/instrumentation";
import { MK_APPS } from "../src/lib/marketing/apps";
import { reglagesSections } from "../src/app/(marketing)/marketing/reglages/sections";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const throws = (fn: () => unknown, re?: RegExp) => { try { fn(); return false; } catch (e) { return re ? re.test(String((e as Error).message)) : true; } };
const rejects = async (p: Promise<unknown>, re?: RegExp) => { try { await p; return false; } catch (e) { return re ? re.test(String((e as Error).message)) : true; } };

async function main() {
  console.log("Jeton");
  const tokens = Array.from({ length: 200 }, () => newKpiToken());
  ok("43 caractères base64url, au moins 32", tokens.every((t) => t.length === 43 && TOKEN_RE.test(t) && isKpiToken(t)));
  ok("200 tirages, 200 jetons différents", new Set(tokens).size === 200);
  ok("aucun « + », « / » ni « = » (sûr dans une adresse)", tokens.every((t) => !/[+/=]/.test(t)));
  ok("jeton trop court, avec espace, ou absent : refusé", !isKpiToken("court") && !isKpiToken("a".repeat(31)) && !isKpiToken(`${"a".repeat(40)} b`) && !isKpiToken(null) && !isKpiToken(42) && !isKpiToken("../../etc/passwd" + "a".repeat(30)));
  ok("chemin public /kpi/<jeton>", kpiLinkPath(tokens[0]) === `/kpi/${tokens[0]}`);

  console.log("Personne");
  const p = parsePersonInput({ name: "  Julie   Martin ", role: "setter", email: " Julie@Exemple.FR ", phone: "" });
  ok("nom nettoyé, e-mail en minuscules, téléphone vide → null", p.name === "Julie Martin" && p.email === "julie@exemple.fr" && p.phone === null && p.role === "setter");
  ok("nom obligatoire", throws(() => parsePersonInput({ name: "   ", role: "setter" }), /nom/));
  ok("nom de 121 caractères refusé", throws(() => parsePersonInput({ name: "a".repeat(121), role: "setter" }), /120/));
  ok("rôle inconnu refusé (media buyer, admin)", throws(() => parsePersonInput({ name: "X", role: "media_buyer" }), /Setter ou Closer/) && throws(() => parsePersonInput({ name: "X", role: "admin" })));
  ok("e-mail invalide refusé", throws(() => parsePersonInput({ name: "X", role: "closer", email: "pas-un-email" }), /e-mail/));
  ok("téléphone avec lettres refusé, numéro normal accepté", throws(() => parsePersonInput({ name: "X", role: "closer", phone: "06 abc" })) && parsePersonInput({ name: "X", role: "closer", phone: "+33 6 12 34 56 78" }).phone === "+33 6 12 34 56 78");
  ok("prénom", firstName("Julie Martin") === "Julie" && firstName("Karim") === "Karim");

  console.log("Jours");
  ok("jour civil dans le fuseau (23 h 30 UTC = lendemain à Paris)", todayIn("Europe/Paris", new Date("2026-11-23T23:30:00Z")) === "2026-11-24" && todayIn("UTC", new Date("2026-11-23T23:30:00Z")) === "2026-11-23");
  ok("fuseau inconnu : Europe/Paris, sans planter", todayIn("Pas/UnFuseau", new Date("2026-11-23T23:30:00Z")) === "2026-11-24");
  ok("décalage sur un changement de mois et d'année", shiftDay("2026-03-01", -1) === "2026-02-28" && shiftDay("2027-01-01", -1) === "2026-12-31");
  const today = "2026-11-23", win = entryWindow(today);
  ok("fenêtre : aujourd'hui puis 7 jours en arrière (8 jours)", win.length === 8 && win[0] === today && win[1] === "2026-11-22" && win[7] === "2026-11-16");
  ok("libellés : Aujourd'hui, Hier, puis le jour", dayLabel(today, today) === "Aujourd'hui" && dayLabel("2026-11-22", today) === "Hier" && /^Mer\. 18 nov/.test(dayLabel("2026-11-18", today)), dayLabel("2026-11-18", today));
  ok("« pour aujourd'hui », « pour hier », « pour le … »", forDay(today, today) === "pour aujourd'hui" && forDay("2026-11-22", today) === "pour hier" && forDay("2026-11-18", today) === "pour le mercredi 18 novembre");

  console.log("Saisie : validation stricte");
  const e1 = parseEntryInput("setter", { day: today, metrics: { appels: 40, decroches: 12 }, note: "  Bonne matinée  " }, win);
  ok("champs du setter : manquants à 0, remarque nettoyée", JSON.stringify(e1.metrics) === JSON.stringify({ appels: 40, decroches: 12, messages: 0, conversations: 0 }) && e1.note === "Bonne matinée");
  ok("un champ de closer refusé chez un setter", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: 1, relances: 3 } }, win), /inconnu/));
  ok("un champ inventé refusé", throws(() => parseEntryInput("closer", { day: today, metrics: { signatures: 9 } }, win), /inconnu/));
  ok("négatif refusé", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: -1 } }, win), /négatif/));
  ok("décimal refusé", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: 2.5 } }, win), /entier/));
  ok("10 001 refusé, 10 000 accepté", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: 10_001 } }, win), /au plus/) && parseEntryInput("setter", { day: today, metrics: { appels: 10_000 } }, win).metrics.appels === 10_000);
  ok("texte à la place d'un nombre refusé", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: "12" } }, win), /nombre/));
  ok("NaN et Infinity refusés", throws(() => parseEntryInput("setter", { day: today, metrics: { appels: NaN } }, win)) && throws(() => parseEntryInput("setter", { day: today, metrics: { appels: Infinity } }, win)));
  ok("jour hors fenêtre refusé (8 jours en arrière, demain)", throws(() => parseEntryInput("setter", { day: "2026-11-15", metrics: {} }, win), /jour/) && throws(() => parseEntryInput("setter", { day: "2026-11-24", metrics: {} }, win), /jour/));
  ok("jour mal formé refusé", throws(() => parseEntryInput("setter", { day: "23/11/2026", metrics: {} }, win)));
  ok("remarque de 1001 caractères refusée", throws(() => parseEntryInput("closer", { day: today, metrics: {}, note: "n".repeat(1001) }, win), /1000/));
  ok("clé en trop à la racine refusée (ex. person_id)", throws(() => parseEntryInput("closer", { day: today, metrics: {}, person_id: "autre" }, win)));
  const allCloser = parseEntryInput("closer", { day: today, metrics: { relances: 3 } }, win).metrics;
  ok("closer : les douze champs, manquants à 0", Object.keys(allCloser).join(",") === "rdv_prevus,show_up,no_show,annules,non_qualifies,pitchs,closes,en_reflexion,cash,ca_signe,relances,propositions" && Object.values(allCloser).reduce((a, b) => a + b, 0) === 3);
  ok("anciennes clés (relances, propositions) toujours acceptées", JSON.stringify(parseEntryInput("closer", { day: today, metrics: { relances: 6, propositions: 2 } }, win).metrics).includes('"relances":6,"propositions":2'));
  const full = parseEntryInput("closer", { day: today, metrics: { rdv_prevus: 6, show_up: 4, no_show: 1, annules: 1, non_qualifies: 1, pitchs: 3, closes: 1, en_reflexion: 1, cash: 1500, ca_signe: 3000 } }, win).metrics;
  ok("closer : nouveaux champs acceptés", full.show_up === 4 && full.pitchs === 3 && full.closes === 1 && full.cash === 1500 && full.ca_signe === 3000);
  ok("montant accepté jusqu'à 1 000 000 €", parseEntryInput("closer", { day: today, metrics: { cash: 1_000_000, ca_signe: 1_000_000 } }, win).metrics.ca_signe === 1_000_000);
  ok("montant refusé au-delà de 1 000 000 €", throws(() => parseEntryInput("closer", { day: today, metrics: { ca_signe: 1_000_001 } }, win), /CA signé : 1\u00a0000\u00a0000\u00a0€ au plus/));
  ok("montant avec centimes refusé", throws(() => parseEntryInput("closer", { day: today, metrics: { cash: 99.5 } }, win), /euros entiers/));
  ok("nombre refusé au-delà de 10 000 (show-up)", throws(() => parseEntryInput("closer", { day: today, metrics: { show_up: 10_001 } }, win), /Show-up : 10\u00a0000 au plus/));
  ok("un montant de 20 000 € est accepté (la limite des nombres ne s'applique pas aux euros)", parseEntryInput("closer", { day: today, metrics: { cash: 20_000 } }, win).metrics.cash === 20_000);
  console.log("Lien : montant tapé avec des centimes");
  const caField = KPI_FIELDS.closer.find((f) => f.key === "ca_signe")!, showField = KPI_FIELDS.closer.find((f) => f.key === "show_up")!;
  for (const raw of ["2499,99", "1 500,50 €", "1500.5", "1\u00a0500,50"]) {
    const v = kpiInputNumber(cleanKpiInput(raw));
    ok(`« ${raw} » refusé « sans centimes », jamais multiplié par 100 (lu ${v})`, /sans centimes/.test(kpiValueError(caField, v) ?? "") && v < 2500);
  }
  ok("la saisie reste telle que tapée (virgule gardée, « € » retiré)", cleanKpiInput("2499,99") === "2499,99" && cleanKpiInput("1 500,50 €") === "1 500,50 " && cleanKpiInput("00120") === "120");
  ok("« 1 500 € » et « 2500,00 » lus en euros entiers, acceptés", kpiInputNumber(cleanKpiInput("1 500 €")) === 1500 && kpiInputNumber(cleanKpiInput("2500,00")) === 2500 && kpiValueError(caField, 1500) === null);
  ok("vide : 0 ; illisible (« 1,500,50 ») : refusé", kpiInputNumber("") === 0 && /nombre/.test(kpiValueError(caField, kpiInputNumber(cleanKpiInput("1,500,50"))) ?? ""));
  ok("un nombre avec virgule refusé « entier » (show-up 1,5), pas lu 15", kpiInputNumber(cleanKpiInput("1,5")) === 1.5 && /entier/.test(kpiValueError(showField, 1.5) ?? ""));
  ok("serveur : closer, CA signé 2499,99 refusé", throws(() => parseEntryInput("closer", { day: today, metrics: { ca_signe: 2499.99 } }, win), /sans centimes/));
  ok("clé inconnue refusée chez un closer", throws(() => parseEntryInput("closer", { day: today, metrics: { closes: 1, signatures: 1 } }, win), /inconnu/));
  ok("un champ de setter refusé chez un closer", throws(() => parseEntryInput("closer", { day: today, metrics: { appels: 3 } }, win), /inconnu/));

  console.log("Base en mémoire");
  const tables: MemoryTables = {};
  const db = new MemoryDb(tables, "admin-1");
  const julie = await createPerson(db, { name: "Julie Martin", role: "setter", email: "julie@exemple.fr" }, "admin-1");
  const karim = await createPerson(db, { name: "Karim", role: "closer" }, "admin-1");
  ok("ajout : actif, jeton posé, auteur noté", julie.active && isKpiToken(julie.token) && julie.created_by === "admin-1" && julie.last_entry_at === null);
  ok("deux personnes, deux jetons", julie.token !== karim.token && (await listPeople(db)).length === 2);
  ok("ajout invalide refusé, rien d'écrit", await rejects(createPerson(db, { name: "", role: "setter" }, null)) && (await listPeople(db)).length === 2);
  ok("le jeton retrouve la bonne personne", (await activePersonByToken(db, julie.token))?.id === julie.id && (await activePersonByToken(db, karim.token))?.id === karim.id);
  ok("jeton inconnu ou mal formé : null", (await activePersonByToken(db, newKpiToken())) === null && (await activePersonByToken(db, "x")) === null && (await activePersonByToken(db, undefined)) === null);

  const now = new Date("2026-11-23T09:30:00Z");
  await saveLinkEntry(db, julie, e1, now);
  let mine = await personEntries(db, julie.id, win[7]);
  ok("saisie enregistrée et dernière saisie notée", mine.length === 1 && mine[0].metrics.appels === 40 && (await db.get<KpiPerson>(PEOPLE_TABLE, julie.id))?.last_entry_at === now.toISOString());
  await saveLinkEntry(db, julie, parseEntryInput("setter", { day: today, metrics: { appels: 45 } }, win), new Date("2026-11-23T18:00:00Z"));
  mine = await personEntries(db, julie.id, win[7]);
  ok("même jour : la saisie est remplacée, pas doublée", mine.length === 1 && mine[0].metrics.appels === 45 && mine[0].metrics.decroches === 0 && mine[0].note === null);
  await saveLinkEntry(db, julie, parseEntryInput("setter", { day: "2026-11-22", metrics: { appels: 30 } }, win), now);
  await saveLinkEntry(db, karim, parseEntryInput("closer", { day: today, metrics: { relances: 5, propositions: 2 } }, win), now);
  ok("chacun ne lit que ses saisies", (await personEntries(db, julie.id, win[7])).length === 2 && (await personEntries(db, karim.id, win[7])).every((x) => x.person_id === karim.id));
  ok("une ligne par personne et par jour (la mémoire tient la même unicité que la base)", await rejects(db.insert(ENTRIES_TABLE, { person_id: julie.id, day: today, metrics: {} }), /duplicate/));

  const old = julie.token, renewed = await renewToken(db, julie.id);
  ok("nouveau lien : l'ancien ne marche plus, le nouveau oui", renewed.token !== old && (await activePersonByToken(db, old)) === null && (await activePersonByToken(db, renewed.token))?.id === julie.id);
  ok("nouveau lien : les saisies restent", (await personEntries(db, julie.id, win[7])).length === 2);
  await setPersonActive(db, julie.id, false);
  ok("désactivé : le lien ne marche plus", (await activePersonByToken(db, renewed.token)) === null);
  await setPersonActive(db, julie.id, true);
  ok("réactivé : le même lien remarche", (await activePersonByToken(db, renewed.token))?.id === julie.id);

  console.log("Commercial (sans base)");
  const setter = scopeDb(db, { id: "setter-1", role: "setter" }, tables);
  ok("un setter ne lit ni les personnes ni les jetons", (await setter.list(PEOPLE_TABLE)).length === 0 && (await setter.get(PEOPLE_TABLE, julie.id)) === null);
  ok("un setter ne lit pas les saisies par lien", (await setter.list(ENTRIES_TABLE)).length === 0);
  ok("un setter ne peut pas ajouter une personne", await rejects(setter.insert(PEOPLE_TABLE, { name: "Moi", role: "setter", token: newKpiToken() })));

  console.log("Totaux déclarés (membres + liens)");
  const all = [...(await db.list<KpiPersonEntry>(ENTRIES_TABLE)), { metrics: { appels: 10, relances: 1, intrus: 99 } }, { metrics: { appels: "x" as unknown as number } }, { metrics: null }];
  const tot = declaredTotals(all);
  ok("sommes par indicateur", tot.appels === 45 + 30 + 10 && tot.relances === 5 + 1 && tot.propositions === 2, JSON.stringify(tot));
  ok("totaux : les champs closer y sont aussi", "closes" in tot && "cash" in tot && declaredTotals([{ metrics: { closes: 2, cash: 1500 } }, { metrics: { closes: 1 } }]).closes === 3 && declaredTotals([{ metrics: { cash: 1500 } }]).cash === 1500);
  ok("indicateur inconnu ou valeur illisible ignorés", !("intrus" in tot) && Number.isFinite(tot.appels));

  console.log("Journal");
  const tok = newKpiToken(), red = redactSecretPaths(`/kpi/${tok}`);
  ok("le jeton du lien n'apparaît jamais dans le journal des erreurs", red === "/kpi/[jeton]" && !redactSecretPaths(`échec POST /kpi/${tok}?x=1 puis "/kpi/${tok}"`).includes(tok));
  ok("les autres chemins restent lisibles", redactSecretPaths("/marketing/kpi?onglet=suivi") === "/marketing/kpi?onglet=suivi" && redactSecretPaths("/marketing/paiements") === "/marketing/paiements");

  console.log("Suppression");
  await deletePerson(db, karim.id);
  ok("supprimer une personne efface ses saisies", (await listPeople(db)).length === 1 && (await db.list<KpiPersonEntry>(ENTRIES_TABLE)).every((x) => x.person_id !== karim.id));

  console.log("Où saisir : la page KPI, onglet Saisie des KPI");
  const SAISIE = "/marketing/kpi?onglet=saisie";
  const app = MK_APPS.find((a) => a.key === "saisie");
  ok("application « Saisie des KPI » : KPI › Saisie des KPI, avec le droit KPI", app?.href === SAISIE && app.module === "marketing_classement" && app.group === "analyse");
  ok("application « Closing » : l'onglet Closing (la page KPI s'ouvre sur la saisie pour un setter)", MK_APPS.find((a) => a.key === "closing")?.href === "/marketing/kpi?onglet=closing");
  const kpiSection = reglagesSections({ admin: true, kpiLinks: true, iclosed: false }).find((x) => x.key === "kpi");
  ok("Réglages : raccourci « Liens de saisie des KPI » vers KPI › Saisie des KPI", kpiSection?.href === SAISIE && kpiSection.sub === "KPI › Saisie des KPI");
  ok("Réglages : pas de raccourci sans le droit de gérer les liens", !reglagesSections({ admin: false, kpiLinks: false, iclosed: false }).some((x) => x.key === "kpi"));
  ok("plus aucun lien vers l'ancien onglet Paiements › Saisie", !MK_APPS.some((a) => a.href.includes("onglet=kpi")) && reglagesSections({ admin: true, kpiLinks: true, iclosed: true }).every((x) => !x.href.includes("paiements")));
  ok("Paiements : seulement les liens de paiement et les documents", MK_APPS.filter((a) => a.href.startsWith("/marketing/paiements")).map((a) => a.key).join(",") === "paiements,documents");

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
