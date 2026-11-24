/**
 * Vérification hors ligne du lien d'onboarding (/bienvenue/<jeton>) : jeton dérivé (stable, change avec la version,
 * jeton faux refusé), cookie d'accès signé (valide, expiré, autre version, lien coupé, falsifié), reconnaissance de
 * l'e-mail (membre actif ou retiré, personne d'un lien de saisie active ou non, inconnu, majuscules), et filtrage du
 * contenu par rôle (jamais un document de Studio, jamais celui d'un autre rôle). Aucune base, aucun réseau.
 * Lancer : pnpm dlx tsx scripts/onboarding-link-selfcheck.ts
 */
import { MemoryDb, type MemoryTables } from "../src/lib/marketing/db";
import {
  DEFAULT_SETTING, DEMO_SECRET, deriveKey, groupDocs, isOnboardingToken, linkToken, loadRoleContent, localProgressKey, matchRecruit, memberRecruit, newPass,
  nextVersion, onboardingLinkPath, parseSetting, personRecruit, readPass, recruitFirstName, roleContent, sameSecret, signPass, stepOfRole, stepsView, tokenOpens,
  COOKIE_MAX_AGE, TOKEN_LENGTH, type MemberCandidate, type PersonCandidate,
} from "../src/lib/marketing/onboarding-link";
import { setStepDone, type Doc, type Folder, type Progress, type Step } from "../src/lib/marketing/resources";
import { redactSecretPaths } from "../src/instrumentation";
import { isProtectedPath } from "../src/proxy";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

async function main() {
  const key = deriveKey("cle-service-de-test-assez-longue-0123456789"), other = deriveKey("une-autre-cle-service-0123456789");
  const v1 = DEFAULT_SETTING, v2 = nextVersion(v1), off = { ...v1, enabled: false };

  console.log("Réglage");
  ok("défaut : version 1, actif", v1.version === 1 && v1.enabled === true);
  ok("réglage absent ou illisible : défaut", JSON.stringify(parseSetting(null)) === JSON.stringify(v1) && JSON.stringify(parseSetting("x")) === JSON.stringify(v1));
  ok("version invalide (0, -3, 2.5, texte) : 1", [0, -3, 2.5, "7"].every((v) => parseSetting({ version: v }).version === 1));
  ok("lien coupé lu comme coupé", parseSetting({ version: 4, enabled: false }).enabled === false && parseSetting({ version: 4 }).enabled === true && parseSetting({ version: 4 }).version === 4);
  ok("« Changer le lien » : version + 1, même état actif", v2.version === 2 && v2.enabled === true && nextVersion(off).enabled === false);

  console.log("Jeton");
  const t1 = linkToken(key, 1), t1b = linkToken(key, 1), t2 = linkToken(key, 2);
  ok("32 caractères base64url, sûrs dans une adresse", t1.length === TOKEN_LENGTH && isOnboardingToken(t1) && !/[+/=]/.test(t1));
  ok("stable pour une version", t1 === t1b);
  ok("différent après « Changer le lien » (version + 1)", t1 !== t2);
  ok("différent avec une autre clé serveur", linkToken(other, 1) !== t1);
  ok("secret de démo fixe : le même jeton à chaque démarrage", linkToken(deriveKey(DEMO_SECRET), 1) === linkToken(deriveKey("demo-onboarding"), 1));
  ok("le bon jeton ouvre le lien", tokenOpens(key, v1, t1));
  ok("l'ancien jeton ne marche plus après le changement", !tokenOpens(key, v2, t1) && tokenOpens(key, v2, t2));
  ok("lien coupé : même le bon jeton est refusé", !tokenOpens(key, off, t1));
  const fake = t1.slice(0, -1) + (t1.endsWith("A") ? "B" : "A");
  ok("jeton faux refusé (1 caractère changé, trop court, vide, absent, injection)", !tokenOpens(key, v1, fake) && !tokenOpens(key, v1, t1.slice(0, 31)) && !tokenOpens(key, v1, "") && !tokenOpens(key, v1, null) && !tokenOpens(key, v1, `${t1.slice(0, 28)}/../`));
  ok("comparaison en temps constant : longueurs différentes refusées sans erreur", !sameSecret("abc", "abcd") && sameSecret("abc", "abc"));
  ok("chemin public /bienvenue/<jeton>", onboardingLinkPath(t1) === `/bienvenue/${t1}`);
  ok("le jeton n'apparaît jamais dans le journal des erreurs", redactSecretPaths(`/bienvenue/${t1}`) === "/bienvenue/[jeton]" && !redactSecretPaths(`POST /bienvenue/${t1}/document/abc "x"`).includes(t1));
  ok("page publique : jamais renvoyée vers la connexion (comme /kpi/<jeton>)", !isProtectedPath(`/bienvenue/${t1}`) && !isProtectedPath(`/bienvenue/${t1}/document/abc`) && !isProtectedPath("/kpi/x") && isProtectedPath("/marketing/ressources"));
  ok("la page « Bienvenue » du mot de passe reste lisible dans le journal", redactSecretPaths("/bienvenue?next=%2Fmarketing") === "/bienvenue?next=%2Fmarketing");

  console.log("Cookie d'accès");
  const now = Date.parse("2026-11-24T10:00:00Z");
  const p = newPass({ kind: "m", id: "membre-1" }, v1, now), cookie = signPass(key, p);
  ok("valable 30 jours, lié à la version", p.exp === now + COOKIE_MAX_AGE * 1000 && COOKIE_MAX_AGE === 30 * 24 * 3600 && p.v === 1);
  const read = readPass(key, cookie, v1, now + 1000);
  ok("cookie signé valide : relu tel quel", !!read && read.k === "m" && read.id === "membre-1" && read.v === 1);
  ok("expiré : refusé", readPass(key, cookie, v1, p.exp) === null && readPass(key, cookie, v1, p.exp + 1) === null);
  ok("version changée (lien changé) : refusé", readPass(key, cookie, v2, now) === null);
  ok("lien coupé : refusé", readPass(key, cookie, off, now) === null);
  const [body, sig] = cookie.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "m", id: "membre-2", v: 1, exp: p.exp }), "utf8").toString("base64url");
  ok("falsifié (autre identifiant, signature d'origine) : refusé", readPass(key, `${forged}.${sig}`, v1, now) === null);
  ok("falsifié (signature changée, absente, en trop) : refusé", readPass(key, `${body}.${sig.slice(0, -2)}xx`, v1, now) === null && readPass(key, body, v1, now) === null && readPass(key, `${cookie}.x`, v1, now) === null);
  ok("signé avec une autre clé : refusé", readPass(other, cookie, v1, now) === null);
  const longLived = signPass(key, { k: "l", id: "p-1", v: 1, exp: now + 400 * 86_400_000 });
  ok("personne d'un lien de saisie : relue", readPass(key, longLived, v1, now)?.k === "l");
  ok("contenu invalide mais bien signé (type inconnu) : refusé", readPass(key, signPass(key, { k: "x" as never, id: "a", v: 1, exp: now + 1000 }), v1, now) === null);
  ok("valeur absente ou trop longue : refusée", readPass(key, undefined, v1, now) === null && readPass(key, "a".repeat(700), v1, now) === null);

  console.log("Reconnaître l'e-mail");
  const members: MemberCandidate[] = [
    { id: "m-closer", role: "marketing", display_name: "Julie Martin", email: "julie@exemple.fr", disabled_at: null, marketing_role: "closer" },
    { id: "m-sans-role", role: "marketing", display_name: "Karim", email: "karim@exemple.fr", disabled_at: null, marketing_role: null },
    { id: "m-retire", role: "marketing", display_name: "Ancien", email: "ancien@exemple.fr", disabled_at: "2026-10-01T00:00:00Z", marketing_role: "setter" },
    { id: "m-agence", role: "agency", display_name: "Admin", email: "admin@exemple.fr", disabled_at: null, marketing_role: "closer" },
    { id: "m-client", role: "client", display_name: "Client", email: "client@exemple.fr", disabled_at: null, marketing_role: null },
  ];
  const people: PersonCandidate[] = [
    { id: "p-setter", name: "Inès Diallo", email: "ines@exemple.fr", role: "setter", active: true },
    { id: "p-inactif", name: "Hugo", email: "hugo@exemple.fr", role: "closer", active: false },
    { id: "p-sans-email", name: "Léa", email: null, role: "closer", active: true },
    { id: "p-double", name: "Julie (lien)", email: "julie@exemple.fr", role: "setter", active: true },
  ];
  const m = matchRecruit("julie@exemple.fr", members, people);
  ok("membre actif reconnu, avec son rôle (closer), avant une personne au même e-mail", m?.kind === "m" && m.id === "m-closer" && m.role === "closer");
  ok("majuscules et espaces ignorés", matchRecruit("  JULIE@Exemple.FR ", members, people)?.id === "m-closer");
  ok("membre sans rôle précisé : setter (comme salesRoleOf)", matchRecruit("karim@exemple.fr", members, people)?.role === "setter");
  ok("membre retiré : refusé", matchRecruit("ancien@exemple.fr", members, people) === null && memberRecruit(members[2]) === null);
  ok("compte agence ou client : refusé (pas une recrue Marketing)", matchRecruit("admin@exemple.fr", members, people) === null && matchRecruit("client@exemple.fr", members, people) === null);
  const l = matchRecruit("Ines@exemple.fr", members, people);
  ok("personne active d'un lien de saisie reconnue, avec son rôle", l?.kind === "l" && l.id === "p-setter" && l.role === "setter");
  ok("personne inactive : refusée", matchRecruit("hugo@exemple.fr", members, people) === null && personRecruit(people[1]) === null);
  ok("personne sans e-mail : jamais reconnue", personRecruit(people[2]) === null);
  ok("e-mail inconnu, invalide ou vide : refusé", matchRecruit("inconnu@exemple.fr", members, people) === null && matchRecruit("pas-un-email", members, people) === null && matchRecruit("", members, people) === null && matchRecruit(null, members, people) === null);
  ok("prénom affiché", recruitFirstName({ name: "Julie Martin" }) === "Julie" && recruitFirstName({ name: "Romain Girard (exemple)" }) === "Romain" && recruitFirstName({ name: "" }) === "");

  console.log("Contenu du rôle");
  const now2 = "2026-11-20T10:00:00Z";
  const folder = (id: string, name: string, role: Folder["marketing_role"], parent: string | null, position: number, space = "marketing"): Folder => ({ id, name, parent_id: parent, space, marketing_role: role, position });
  const doc = (id: string, title: string, folderId: string | null, extra: Partial<Doc> = {}): Doc => ({ id, title, icon: null, kind: "sop", content: `<p>${title}</p>`, folder_id: folderId, space: "marketing", author_id: null, archived_at: null, created_at: now2, updated_at: now2, ...extra });
  const folders: Folder[] = [
    folder("f-closer", "Closer", "closer", null, 20), folder("f-closer-onb", "Onboarding", "closer", "f-closer", 10), folder("f-closer-sops", "SOPs", "closer", "f-closer", 20), folder("f-closer-res", "Ressources", "closer", "f-closer", 30),
    folder("f-closer-appels", "Appels", "closer", "f-closer-sops", 40),
    folder("f-setter", "Setter", "setter", null, 10), folder("f-setter-sops", "SOPs", "setter", "f-setter", 20),
    folder("f-commun", "Commun", null, null, 40),
    folder("f-studio", "Studio interne", null, null, 5, "studio"),
  ];
  const docs: Doc[] = [
    doc("d-onb", "Bienvenue closer", "f-closer-onb", { kind: "doc" }), doc("d-sop", "Script d'appel closer", "f-closer-sops"), doc("d-res", "Objections", "f-closer-res", { kind: "template" }),
    doc("d-appels", "Relances", "f-closer-appels"), doc("d-commun", "Charte de l'équipe", "f-commun", { kind: "doc" }), doc("d-libre", "Organigramme", null, { kind: "doc" }),
    doc("d-setter", "Script setter", "f-setter-sops"), doc("d-archive", "Ancien script", "f-closer-sops", { archived_at: now2 }),
    doc("d-studio", "Facturation clients", "f-studio", { space: "studio" }), doc("d-studio-libre", "Brief client", null, { space: "studio" }),
    doc("d-studio-dans-marketing", "Studio rangé ici", "f-closer-sops", { space: "studio" }),
  ];
  const steps: Step[] = [
    { id: "s-c2", role: "closer", title: "Lire le script", description: null, document_id: "d-sop", position: 20 },
    { id: "s-c1", role: "closer", title: "Rencontrer l'équipe", description: "15 minutes", document_id: null, position: 10 },
    { id: "s-c3", role: "closer", title: "Lire un document d'un autre rôle", description: null, document_id: "d-setter", position: 30 },
    { id: "s-s1", role: "setter", title: "Étape setter", description: null, document_id: null, position: 10 },
  ];
  const closer = roleContent("closer", folders, docs, steps), ids = new Set(closer.docs.map((d) => d.id));
  ok("documents du rôle, des dossiers communs et sans dossier", ["d-onb", "d-sop", "d-res", "d-appels", "d-commun", "d-libre"].every((id) => ids.has(id)) && ids.size === 6, [...ids].join(","));
  ok("jamais un document d'un autre rôle", !ids.has("d-setter"));
  ok("jamais un document de Studio (même rangé dans un dossier Marketing)", !ids.has("d-studio") && !ids.has("d-studio-libre") && !ids.has("d-studio-dans-marketing"));
  ok("jamais un document archivé", !ids.has("d-archive"));
  ok("jamais un dossier de Studio ni d'un autre rôle", closer.folders.every((f) => f.space === "marketing" && f.marketing_role !== "setter"));
  ok("étapes du rôle seulement, dans l'ordre", closer.steps.map((s) => s.id).join(",") === "s-c1,s-c2,s-c3");
  const view = stepsView(closer);
  ok("une étape ne renvoie qu'à un document visible du rôle (jamais à celui d'un autre rôle)", view.find((s) => s.id === "s-c2")?.document_id === "d-sop" && view.find((s) => s.id === "s-c3")?.document_id === null);
  ok("un rôle sans contenu reste vide (media buyer)", (() => { const mb = roleContent("media_buyer", folders, docs, steps); return mb.steps.length === 0 && mb.docs.every((d) => d.folder_id === "f-commun" || d.folder_id === null); })());
  const g = groupDocs("closer", closer);
  ok("dossier Onboarding à part, sous les étapes", g.onboarding.map((d) => d.id).join(",") === "d-onb");
  ok("SOPs puis Ressources toujours présents", g.groups[0].name === "SOPs" && g.groups[1].name === "Ressources" && g.groups[0].docs.map((d) => d.id).join(",") === "d-sop");
  ok("sous-dossier nommé depuis le dossier du rôle, dossier commun, puis « Autres documents »", g.groups.map((x) => x.name).join(" | ") === "SOPs | Ressources | SOPs › Appels | Commun | Autres documents", g.groups.map((x) => x.name).join(" | "));
  const empty = groupDocs("setter", roleContent("setter", [], [], []));
  ok("aucun dossier : SOPs et Ressources vides, rien d'autre", empty.groups.length === 2 && empty.groups.every((x) => x.docs.length === 0) && empty.onboarding.length === 0);
  ok("une étape d'un autre rôle ne se coche pas", stepOfRole(steps, "s-s1", "closer") === null && stepOfRole(steps, "s-c1", "closer")?.id === "s-c1" && stepOfRole(steps, 42, "closer") === null);

  console.log("Lecture avec filtres (base en mémoire)");
  const tables: MemoryTables = { document_folders: folders as never, documents: docs as never, marketing_onboarding_steps: steps as never, marketing_onboarding_progress: [] };
  const db = new MemoryDb(tables, null, {});
  const loaded = await loadRoleContent(db, "closer");
  ok("la lecture filtrée donne le même contenu que les règles", loaded.docs.map((d) => d.id).sort().join(",") === [...ids].sort().join(",") && loaded.steps.length === 3);
  const setterLoaded = await loadRoleContent(db, "setter");
  ok("un setter ne reçoit jamais un document du closer ni de Studio", setterLoaded.docs.every((d) => !["d-onb", "d-sop", "d-res", "d-appels", "d-studio", "d-studio-libre"].includes(d.id)) && setterLoaded.docs.some((d) => d.id === "d-setter"));
  await setStepDone(db, "s-c1", "m-closer", true, []);
  let mine = await db.list<Progress>("marketing_onboarding_progress", { where: [["eq", "profile_id", "m-closer"]] });
  ok("progression d'un membre : cochée pour SON profil", mine.length === 1 && mine[0].step_id === "s-c1");
  await setStepDone(db, "s-c1", "m-closer", false, mine);
  mine = await db.list<Progress>("marketing_onboarding_progress", { where: [["eq", "profile_id", "m-closer"]] });
  ok("progression d'un membre : décochée", mine.length === 0);
  ok("progression d'une personne sans profil : clé locale propre à la personne", localProgressKey("p-setter") === "iconflow-bienvenue:p-setter" && localProgressKey("p-setter") !== localProgressKey("p-autre"));

  console.log(`\n${pass} ok, ${fail} échec(s)`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
