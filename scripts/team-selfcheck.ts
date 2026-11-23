/**
 * Vérification hors ligne du classement, des ressources / onboarding et de l'invitation d'un membre (pages par rôle,
 * traduction des erreurs). Aucune base, aucun réseau.
 * Lancer : pnpm dlx tsx scripts/team-selfcheck.ts
 */
import { MemoryDb, scopeDb, type MemoryTables } from "../src/lib/marketing/db";
import type { FactAppointment, FactProspect, FactTask } from "../src/lib/marketing/funnel";
import { MIN_SAMPLE, buildLeaderboard } from "../src/lib/marketing/leaderboard";
import * as res from "../src/lib/marketing/resources";
import * as inv from "../src/lib/marketing/invite-errors";
import { MARKETING_MODULE_KEYS, SALES_ROLE_MODULES } from "../src/lib/permissions";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const P = (id: string, over: Partial<FactProspect> = {}): FactProspect => ({ id, created_at: "2026-11-05T10:00:00Z", opted_in_at: null, source: null, site: null, landing_page: null, utm: null, stage_id: null, call_result: null, outcome: null, signed_amount: null, value: null, setter_id: null, closer_id: null, ...over });
const A = (id: string, prospect: string, over: Partial<FactAppointment> = {}): FactAppointment => ({ id, prospect_id: prospect, starts_at: "2026-11-08T09:00:00Z", created_at: "2026-11-06T09:00:00Z", status: "confirme", result: "a_venir", source: "iclosed", setter_id: null, closer_id: null, ...over });
const T = (id: string, prospect: string, by: string, over: Partial<FactTask> = {}): FactTask => ({ id, prospect_id: prospect, kind: "a_appeler", status: "faite", assignee_id: by, done_by: by, done_at: "2026-11-06T10:00:00Z", created_at: "2026-11-05T10:00:00Z", ...over });
const members = [{ id: "s1", name: "Sam", marketing_role: "setter" }, { id: "s2", name: "Lina", marketing_role: "setter" }, { id: "c1", name: "Clara", marketing_role: "closer" }, { id: "c2", name: "Omar", marketing_role: "closer" }, { id: "adm", name: "Ibra", marketing_role: null }];
const period = { from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" };

(async () => {
  console.log("Classement");
  const prospects: FactProspect[] = [], appointments: FactAppointment[] = [], tasks: FactTask[] = [];
  // Sam : 6 rendez-vous (5 présents, 1 absent), Lina : 5 rendez-vous (3 présents, 2 absents) ; Clara tient 6 appels dont 3 signés, Omar 5 dont 1.
  for (let i = 0; i < 6; i++) { prospects.push(P(`a${i}`, { setter_id: "s1", closer_id: "c1", outcome: i < 3 ? "signe" : "non_signe", signed_amount: i < 3 ? 2000 : null })); appointments.push(A(`ra${i}`, `a${i}`, { result: i < 5 ? "present" : "absent", closer_id: "c1" })); tasks.push(T(`ta${i}`, `a${i}`, "s1")); }
  appointments.push(A("ra-extra", "a0", { result: "present", closer_id: "c1" }));
  for (let i = 0; i < 5; i++) { prospects.push(P(`b${i}`, { setter_id: "s2", closer_id: "c2", outcome: i === 0 ? "signe" : null, signed_amount: i === 0 ? 9000 : null })); appointments.push(A(`rb${i}`, `b${i}`, { setter_id: "s2", result: i < 3 ? "present" : "absent", closer_id: "c2" })); }
  for (let i = 0; i < 2; i++) appointments.push(A(`rb-c${i}`, `b${i}`, { setter_id: "s2", result: "present", closer_id: "c2" }));
  appointments.push(A("vieux", "a0", { starts_at: "2026-09-01T09:00:00Z", created_at: "2026-09-01T09:00:00Z", result: "present", closer_id: "c1" }));
  appointments.push(A("annule", "a1", { status: "annule", result: "annule" }));
  tasks.push(T("double", "a0", "s1"), T("ouverte", "a1", "s1", { status: "ouverte", done_by: null, done_at: null }), T("hors-periode", "a2", "s2", { done_at: "2026-09-01T10:00:00Z" }));
  const b = buildLeaderboard({ prospects, appointments, tasks, members, ...period });
  const sam = b.setters.rows.find((r) => r.id === "s1")!, lina = b.setters.rows.find((r) => r.id === "s2")!;
  ok("leads traités : prospects différents avec une tâche terminée dans la période", sam.handled === 6 && lina.handled === 0, `${sam.handled}/${lina.handled}`);
  ok("rendez-vous pris : créés dans la période, attribués au setter (direct ou par le prospect)", sam.booked === 8 && lina.booked === 7, `${sam.booked}/${lina.booked}`);
  ok("taux de présence : présents ÷ (présents + absents), annulés exclus", sam.showRate === 85.7 && lina.showRate === 71.4, `${sam.showRate}/${lina.showRate}`);
  ok("setters classés par rendez-vous pris", b.setters.ranked && b.setters.rows[0].id === "s1" && b.setters.rows.length === 2);
  const clara = b.closers.rows.find((r) => r.id === "c1")!, omar = b.closers.rows.find((r) => r.id === "c2")!;
  ok("appels tenus : résultat « présent » dans la période", clara.held === 6 && omar.held === 5, `${clara.held}/${omar.held}`);
  ok("taux de signature et montant signé", clara.closeRate === 60 && clara.amount === 6000 && omar.closeRate === null && omar.amount === 9000, JSON.stringify([clara, omar]));
  ok("closers classés par montant signé", b.closers.ranked && b.closers.rows[0].id === "c2");
  ok("un membre sans rôle commercial et sans activité n'apparaît pas", !b.setters.rows.some((r) => r.id === "adm") && !b.closers.rows.some((r) => r.id === "adm"));
  const few = buildLeaderboard({ prospects: prospects.slice(0, 2), appointments: appointments.slice(0, 2), tasks: [], members, ...period });
  ok("trop peu de données : pas de classement, et on dit pourquoi", !few.setters.ranked && !few.closers.ranked && /Pas assez de données/.test(few.setters.reason ?? "") && new RegExp(String(MIN_SAMPLE)).test(few.closers.reason ?? ""));
  ok("un taux sur moins de cinq résultats n'est pas affiché", few.setters.rows.find((r) => r.id === "s1")!.showRate === null);
  const solo = buildLeaderboard({ prospects, appointments: appointments.filter((a) => (a.setter_id ?? "s1") === "s1" && a.prospect_id.startsWith("a")), tasks, members, ...period });
  ok("un seul membre avec assez de volume : pas de classement", !solo.setters.ranked);

  console.log("Ressources et onboarding");
  const tables: MemoryTables = {}; const admin = new MemoryDb(tables, "adm");
  const folders = await res.ensureStructure(admin);
  ok("structure vide : un dossier par rôle, chacun avec Onboarding, SOPs, Ressources", folders.length === 12 && folders.filter((f) => !f.parent_id).length === 3 && (await res.documents(admin)).length === 0 && (await res.steps(admin)).length === 0);
  ok("structure posée une seule fois", (await res.ensureStructure(admin)).length === 12);
  const sopsSetter = folders.find((f) => f.name === "SOPs" && f.marketing_role === "setter")!, sopsCloser = folders.find((f) => f.name === "SOPs" && f.marketing_role === "closer")!;
  const d1 = await res.createDocument(admin, { title: "Script d'appel", kind: "sop", folder_id: sopsSetter.id });
  await res.createDocument(admin, { title: "Trame de closing", kind: "template", folder_id: sopsCloser.id });
  ok("document créé vide, dans l'espace Marketing, jamais partagé à un client", d1.content === "" && d1.space === "marketing" && (d1 as unknown as { shared_with_client: boolean; client_id: null }).shared_with_client === false && (d1 as unknown as { client_id: null }).client_id === null);
  await res.updateDocument(admin, d1.id, { content: "<p>Bonjour</p>", title: "Script d'appel v2" });
  ok("contenu et titre enregistrés", (await res.documents(admin)).find((d) => d.id === d1.id)!.title === "Script d'appel v2");
  await admin.insert("documents", { title: "Doc Studio", kind: "doc", space: "studio", content: "secret" });
  ok("un document de Studio n'apparaît jamais dans les ressources", (await res.documents(admin)).every((d) => d.space === "marketing") && (await res.documents(admin)).length === 2);
  let refused = false; try { await res.updateDocument(admin, (tables.documents as Array<{ id: string; space: string }>).find((d) => d.space === "studio")!.id, { title: "x" }); } catch { refused = true; }
  ok("un document de Studio ne se modifie pas depuis les ressources", refused);
  const s1 = await res.createStep(admin, { role: "setter", title: "Lire le script d'appel", document_id: d1.id });
  const s2 = await res.createStep(admin, { role: "setter", title: "Écouter trois appels" });
  await res.createStep(admin, { role: "closer", title: "Lire la trame" });
  await res.moveStep(admin, s2.id, -1);
  ok("étapes par rôle, ordonnables", (await res.steps(admin)).filter((s) => s.role === "setter")[0].id === s2.id);

  const setter = scopeDb(new MemoryDb(tables, "s1"), { id: "s1", role: "setter" }, tables);
  ok("setter : seulement le dossier et les documents de son rôle", (await res.folders(setter)).every((f) => f.marketing_role === "setter") && (await res.documents(setter)).length === 1);
  ok("setter : seulement les étapes de son rôle", (await res.steps(setter)).length === 2);
  await res.setStepDone(setter, s1.id, "s1", true); await res.setStepDone(setter, s1.id, "s1", true);
  ok("progression : une étape cochée une seule fois", (await res.progress(setter)).length === 1 && res.progressOf(await res.steps(admin), await res.progress(admin), "setter", "s1").done === 1);
  ok("progression par membre : 1 sur 2", JSON.stringify(res.progressOf(await res.steps(admin), await res.progress(admin), "setter", "s1")) === '{"done":1,"total":2}');
  await res.setStepDone(setter, s1.id, "s1", false);
  ok("étape décochée", (await res.progress(admin)).length === 0);
  refused = false; try { await res.createDocument(setter, { title: "Intrus", kind: "doc", folder_id: sopsSetter.id }); } catch { refused = true; }
  ok("un commercial ne crée pas de document", refused);
  refused = false; try { await res.createStep(setter, { role: "setter", title: "Intrus" }); } catch { refused = true; }
  ok("un commercial ne modifie pas les étapes", refused);
  await res.archiveDocument(admin, d1.id);
  ok("document archivé : retiré des ressources", (await res.documents(admin)).length === 1);


  console.log("Invitation : pages par rôle");
  const resp = inv.pagesForRole("responsable");
  ok("Responsable : exactement les modules Marketing", JSON.stringify(resp) === JSON.stringify(MARKETING_MODULE_KEYS) && resp.length > 0);
  ok("Responsable : aucune page de Studio (ni tableau de bord, ni paramètres, ni clients)", resp.every((k) => k.startsWith("marketing_")) && !resp.some((k) => ["dashboard", "parametres", "clients", "equipe", "factures"].includes(k)));
  ok("Responsable : la liste demandée ne change rien", JSON.stringify(inv.pagesForRole("responsable", ["clients", "marketing_taches"])) === JSON.stringify(MARKETING_MODULE_KEYS));
  ok("Setter, Closer, Media buyer : les pages habituelles du rôle par défaut", (["setter", "closer", "media_buyer"] as const).every((r) => JSON.stringify(inv.pagesForRole(r)) === JSON.stringify(SALES_ROLE_MODULES[r])));
  const picked = inv.pagesForRole("setter", ["marketing_taches", "clients", "marketing_reglages", "marketing_equipe", "factures"]);
  ok("pages choisies : seulement celles qu'un commercial peut recevoir (ni Studio, ni Réglages, ni Équipe)", JSON.stringify(picked) === '["marketing_taches"]', JSON.stringify(picked));
  ok("liste vide : retour aux pages du rôle", JSON.stringify(inv.pagesForRole("closer", [])) === JSON.stringify(SALES_ROLE_MODULES.closer));
  ok("media buyer : jamais les contacts par défaut", !inv.pagesForRole("media_buyer").includes("marketing_contacts"));
  ok("aucun rôle « client » proposé", !(inv.INVITE_ROLES as string[]).includes("client") && inv.INVITE_ROLES.length === 4 && !inv.isInviteRole("client") && !inv.isInviteRole("admin"));
  ok("compte Responsable reconnu (pages Marketing, avec ou sans tableau de bord et paramètres)", inv.isMarketingOnly(["marketing_espace"]) && inv.isMarketingOnly(["dashboard", "parametres", "marketing_taches"]) && inv.isMarketingOnly(resp));
  ok("pas Responsable : administrateur, membre de Studio, liste vide", !inv.isMarketingOnly(null) && !inv.isMarketingOnly([]) && !inv.isMarketingOnly(["dashboard", "parametres"]) && !inv.isMarketingOnly(["clients", "marketing_taches"]));
  ok("libellés de rôle", inv.memberRoleLabel({ kind: "admin", role: null }) === "Administrateur" && inv.memberRoleLabel({ kind: "agence", role: null, manager: true }) === "Responsable" && inv.memberRoleLabel({ kind: "commercial", role: "closer" }) === "Closer" && inv.memberRoleLabel({ kind: "agence", role: null }) === "Membre de l'agence");
  if (inv.responsableOpensStudio()) console.log("  note  un compte agence ouvre encore l'accueil de Studio (src/lib/permissions.ts) : l'interface le signale sous « Responsable ».");

  console.log("Invitation : saisie et erreurs");
  ok("saisie : nom manquant", inv.checkInviteInput({ name: " ", email: "a@b.fr", role: "setter" })?.code === "nom");
  ok("saisie : e-mail invalide", inv.checkInviteInput({ name: "Sam", email: "sam@", role: "setter" })?.code === "email_invalide");
  ok("saisie : rôle inconnu ou « client » refusé", inv.checkInviteInput({ name: "Sam", email: "sam@iconflow.fr", role: "client" })?.code === "role");
  ok("saisie correcte", inv.checkInviteInput({ name: "Sam Diallo", email: "sam@iconflow.fr", role: "responsable" }) === null);
  const ctx = { redirect: "https://app.icon-flow.fr/auth/callback" };
  const cases: Array<[string, unknown, inv.InviteErrorCode]> = [
    ["limite d'envoi (message)", new Error("email rate limit exceeded"), "limite"],
    ["limite d'envoi (statut 429)", { message: "Too Many Requests", status: 429 }, "limite"],
    ["e-mail déjà pris dans l'authentification", { message: "A user with this email address has already been registered", code: "email_exists", status: 422 }, "email_connexion"],
    ["adresse de redirection refusée", new Error("redirect_to not allowed"), "redirection"],
    ["clé de service absente", new Error("La variable SUPABASE_SERVICE_ROLE_KEY n'est pas lue sur l'hébergeur."), "base"],
    ["clé de service invalide", { message: "Invalid API key", status: 401 }, "base"],
    ["clé qui n'est pas celle de service", { message: "User not allowed", code: "not_admin", status: 403 }, "base"],
    ["Supabase injoignable", new TypeError("fetch failed"), "reseau"],
    ["droit insuffisant", new Error("La gestion de l'équipe est réservée à l'administrateur."), "droit"],
    ["module refusé", new Error("forbidden_module"), "droit"],
    ["migration absente", { message: 'column "marketing_role" of relation "profiles" does not exist', code: "42703" }, "base_pas_a_jour"],
    ["compte refusé par la base", { message: "Database error saving new user", code: "unexpected_failure", status: 500 }, "creation"],
    ["adresse refusée par Supabase", { message: 'Email address "x@example.com" is invalid', code: "email_address_invalid", status: 400 }, "email_invalide"],
    ["inscriptions coupées", { message: "Signups not allowed for this instance", code: "signup_disabled" }, "inscriptions"],
    ["erreur inconnue", new Error("Quelque chose d'étrange"), "inconnu"],
  ];
  for (const [name, err, code] of cases) { const p = inv.explainInviteError(err, ctx); ok(`erreur : ${name}`, p.code === code, `${p.code} ≠ ${code}`); }
  const redir = inv.explainInviteError(new Error("redirect_to not allowed"), ctx);
  ok("redirection : dit quoi régler, avec l'adresse exacte de l'app", /Authentication › URL Configuration/.test(redir.help) && redir.help.includes(ctx.redirect));
  const unknown = inv.explainInviteError(new Error("Quelque chose d'étrange"), ctx);
  ok("erreur inconnue : le message technique est gardé pour être affiché en petit", unknown.technical === "Quelque chose d'étrange");
  ok("aucun message d'erreur ne contient de valeur secrète", cases.every(([, err]) => !/eyJ|sk_|re_[A-Za-z0-9]{8}/.test(JSON.stringify(inv.explainInviteError(err, ctx)))));

  console.log("Invitation : e-mail déjà utilisé");
  const acc = (o: Partial<Parameters<typeof inv.existingAccountProblem>[0]>) => inv.existingAccountProblem({ id: "x", role: "marketing", client_id: null, permissions: ["marketing_taches"], disabled: false, signedIn: false, ...o });
  ok("membre jamais connecté : proposer de renvoyer l'invitation", acc({}).code === "deja_invite" && acc({}).fix === "renvoyer" && acc({}).memberId === "x");
  ok("membre à l'accès retiré : proposer de rétablir l'accès", acc({ disabled: true }).fix === "retablir");
  ok("membre déjà actif : rien à renvoyer, ouvrir sa fiche", acc({ signedIn: true }).code === "deja_membre" && acc({ signedIn: true }).fix === "fiche");
  ok("Responsable jamais connecté : renvoyer l'invitation", acc({ role: "agency", permissions: resp }).fix === "renvoyer");
  ok("administrateur ou membre de Studio : jamais touché", acc({ role: "agency", permissions: null }).code === "email_autre_compte" && !acc({ role: "agency", permissions: null }).fix && acc({ role: "agency", permissions: ["clients"] }).code === "email_autre_compte");
  ok("compte d'un espace existant : jamais repris", acc({ role: "client", client_id: "c1", permissions: null }).code === "email_autre_compte" && !acc({ role: "client", client_id: "c1", permissions: null }).fix);
  ok("compte inactif sans espace, jamais connecté : peut être repris", acc({ role: "client", permissions: null }).fix === "reprendre");
  ok("compte sans espace déjà utilisé, ou état inconnu : pas repris", !acc({ role: "client", permissions: null, signedIn: true }).fix && !acc({ role: "client", permissions: null, signedIn: null }).fix);
  const all = [...cases.map(([, err]) => inv.explainInviteError(err, ctx)), acc({}), acc({ disabled: true }), acc({ signedIn: true }), acc({ role: "client", permissions: null }), acc({ role: "client", client_id: "c1" }), acc({ role: "agency", permissions: null })];
  ok("jamais le mot « client » dans les messages", all.every((p) => !/client/i.test(`${p.title} ${p.help}`)), all.filter((p) => /client/i.test(`${p.title} ${p.help}`)).map((p) => p.code).join(","));
  ok("chaque message dit quoi faire", all.every((p) => p.title.length > 5 && p.help.length > 20));

  console.log("Invitation : adresse de retour");
  ok("même adresse : acceptée", !inv.redirectRefused(ctx.redirect, ctx.redirect) && !inv.redirectRefused(ctx.redirect, `${ctx.redirect}/`));
  ok("Supabase retombe sur l'adresse du site : refusée", inv.redirectRefused(ctx.redirect, "https://app.icon-flow.fr") && inv.redirectRefused(ctx.redirect, "http://localhost:3000"));
  ok("adresse inconnue : on ne bloque pas", !inv.redirectRefused(ctx.redirect, undefined) && !inv.redirectRefused(ctx.redirect, ""));
  ok("prénom pour la phrase du lien", inv.firstName("Sam Diallo") === "Sam" && inv.firstName("", "lina@iconflow.fr") === "lina");

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
