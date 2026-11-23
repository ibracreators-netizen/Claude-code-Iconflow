/**
 * Vérification hors ligne des liens de saisie des KPI (migration 0028) : jeton, champs par rôle, fenêtre des jours,
 * enregistrement et correction d'une saisie, lien désactivé ou renouvelé, totaux déclarés.
 * Lancer : pnpm dlx tsx scripts/kpi-links-selfcheck.ts
 */
import { MemoryDb, scopeDb, type MemoryTables } from "../src/lib/marketing/db";
import {
  activePersonByToken, createPerson, dayLabel, declaredTotals, deletePerson, entryWindow, ENTRIES_TABLE, firstName, forDay, isKpiToken, kpiLinkPath,
  listPeople, newKpiToken, parseEntryInput, parsePersonInput, PEOPLE_TABLE, personEntries, renewToken, saveLinkEntry, setPersonActive, shiftDay, todayIn, TOKEN_RE,
  type KpiPerson, type KpiPersonEntry,
} from "../src/lib/marketing/kpi-links";
import { redactSecretPaths } from "../src/instrumentation";

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
  ok("closer : relances et propositions seulement", JSON.stringify(parseEntryInput("closer", { day: today, metrics: { relances: 3 } }, win).metrics) === JSON.stringify({ relances: 3, propositions: 0 }));

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
  ok("indicateur inconnu ou valeur illisible ignorés", !("intrus" in tot) && Number.isFinite(tot.appels));

  console.log("Journal");
  const tok = newKpiToken(), red = redactSecretPaths(`/kpi/${tok}`);
  ok("le jeton du lien n'apparaît jamais dans le journal des erreurs", red === "/kpi/[jeton]" && !redactSecretPaths(`échec POST /kpi/${tok}?x=1 puis "/kpi/${tok}"`).includes(tok));
  ok("les autres chemins restent lisibles", redactSecretPaths("/marketing/kpi?onglet=suivi") === "/marketing/kpi?onglet=suivi" && redactSecretPaths("/marketing/paiements") === "/marketing/paiements");

  console.log("Suppression");
  await deletePerson(db, karim.id);
  ok("supprimer une personne efface ses saisies", (await listPeople(db)).length === 1 && (await db.list<KpiPersonEntry>(ENTRIES_TABLE)).every((x) => x.person_id !== karim.id));

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
