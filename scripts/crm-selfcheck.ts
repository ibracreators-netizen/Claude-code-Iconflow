/**
 * Vérification hors ligne du CRM Marketing (contacts, prospects, étapes, tâches). Aucune base, aucun réseau.
 * Lancer : pnpm dlx tsx scripts/crm-selfcheck.ts
 */
import { MemoryDb, type MemoryTables } from "../src/lib/marketing/db";
import * as crm from "../src/lib/marketing/crm";
import type { Contact, MarketingTask, Prospect, ProspectEvent } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const site = { kind: "cree" as const, label: "Formulaire du site" };

(async () => {
  const tables: MemoryTables = {};
  const db = new MemoryDb(tables, "membre-1");
  const count = (t: string) => (tables[t] ?? []).length;
  const events = (id: string) => (tables.marketing_prospect_events as unknown as ProspectEvent[]).filter((e) => e.prospect_id === id);

  console.log("Téléphone et email");
  ok("06 12 34 56 78 → +33612345678", crm.normalizePhone("06 12 34 56 78") === "+33612345678");
  ok("+33 (0)6 12 34 56 78 → +33612345678", crm.normalizePhone("+33 (0)6 12 34 56 78") === "+33612345678");
  ok("0033612345678 → +33612345678", crm.normalizePhone("0033612345678") === "+33612345678");
  ok("numéro étranger gardé", crm.normalizePhone("+1 (555) 123-4567") === "+15551234567");
  ok("email mis en minuscules, invalide refusé", crm.normalizeEmail(" Jean@Exemple.FR ") === "jean@exemple.fr" && crm.normalizeEmail("pas-un-email") === null);

  console.log("Un lead du site");
  const stages = await crm.ensureStages(db);
  ok("sept étapes d'origine, dans l'ordre", stages.length === 7 && stages[0].key === "nouveau_lead" && stages[6].key === "perdu");
  const a = await crm.upsertLead(db, { email: "Jean@Exemple.fr", name: "Jean", phone: "06 12 34 56 78", marque: "Maison J", source: "iconflow.fr/optin", landing_page: "/optin?utm_source=meta", utm: { utm_campaign: "sprint" }, opted_in_at: "2026-11-15T08:00:00Z" }, site);
  ok("contact et affaire créés", a.createdContact && a.createdProspect && count("marketing_contacts") === 1 && count("marketing_prospects") === 1);
  ok("affaire à l'étape « Nouveau lead », ancien statut cohérent", a.prospect.stage_id === stages[0].id && a.prospect.status === "nouveau");
  ok("page d'entrée et campagne conservées", a.prospect.landing_page === "/optin?utm_source=meta" && a.prospect.utm?.utm_campaign === "sprint");
  ok("chronologie : création + opt-in, auteur noté", events(a.prospect.id).length === 2 && events(a.prospect.id).every((e) => e.created_by === "membre-1"));

  console.log("Une seule fiche par personne");
  const b = await crm.upsertLead(db, { email: "jean@exemple.fr", name: "Jean Dupont", company: "Autre nom" }, site);
  ok("même email (autre casse) : même contact, même affaire", !b.createdContact && !b.createdProspect && b.contact.id === a.contact.id && b.prospect.id === a.prospect.id);
  ok("on complète sans écraser", b.contact.name === "Jean" && b.contact.company === "Maison J");
  const c = await crm.upsertLead(db, { phone: "+33 6 12 34 56 78", name: "J. Dupont" }, { kind: "source", label: "iClosed" });
  ok("même téléphone, sans email : même contact", !c.createdContact && c.contact.id === a.contact.id && count("marketing_contacts") === 1);
  const d = await crm.upsertLead(db, { email: "jean.pro@exemple.fr", phone: "06 12 34 56 78" }, site);
  ok("autre email, même téléphone : même contact (règle : email, puis téléphone)", !d.createdContact && d.contact.id === a.contact.id && d.contact.email === "jean@exemple.fr");
  const other = await crm.upsertLead(db, { email: "autre@exemple.fr", phone: "07 99 88 77 66", name: "Autre" }, site);
  ok("autre email et autre téléphone : autre contact", other.createdContact && count("marketing_contacts") === 2);
  let refused = false; try { await crm.upsertLead(db, {}, site); } catch { refused = true; }
  ok("ni email, ni téléphone, ni nom : refusé", refused);

  console.log("Étapes, attribution, appel");
  const audit = stages.find((s) => s.key === "audit_reserve")!, gagne = stages.find((s) => s.key === "gagne")!;
  const u1 = await crm.updateProspect(db, a.prospect.id, { stage_id: audit.id, setter_id: "membre-2", value: 4000 }, { "membre-2": "Sam" });
  ok("changement d'étape : statut hérité suivi", u1.after.stage_id === audit.id && u1.after.status === "reserve" && u1.after.value === 4000);
  const ev = events(a.prospect.id);
  ok("chronologie : étape, attribution (nom), valeur", ev.some((e) => e.kind === "etape" && e.data.vers === "Audit réservé") && ev.some((e) => e.kind === "attribution" && e.data.nom === "Sam") && ev.some((e) => e.kind === "valeur"));
  const before = events(a.prospect.id).length;
  await crm.updateProspect(db, a.prospect.id, { stage_id: audit.id, value: 4000 });
  ok("aucun changement réel : rien dans la chronologie", events(a.prospect.id).length === before);
  await crm.updateProspect(db, a.prospect.id, { call_result: "present", outcome: "signe", signed_amount: 3500, call_note: "Signé en fin d'appel" });
  ok("appel : résultat, issue, montant, note journalisés", events(a.prospect.id).some((e) => e.kind === "appel" && e.data.issue === "signe" && e.data.montant_signe_ht === 3500));
  let bad = false; try { await crm.updateProspect(db, a.prospect.id, { call_result: "inconnu" as never }); } catch { bad = true; }
  ok("résultat d'appel inconnu : refusé", bad);
  bad = false; try { await crm.updateProspect(db, a.prospect.id, { signed_amount: -5 }); } catch { bad = true; }
  ok("montant négatif : refusé", bad);

  console.log("Affaire terminée, nouveau lead");
  await crm.moveToStage(db, a.prospect.id, "gagne");
  const e = await crm.upsertLead(db, { email: "jean@exemple.fr" }, site);
  ok("affaire gagnée : un nouvel opt-in ouvre une nouvelle affaire", e.createdProspect && !e.createdContact && e.prospect.id !== a.prospect.id);
  ok("l'email n'est recopié que sur la première affaire", e.prospect.email === null && (await db.get<Prospect>("marketing_prospects", a.prospect.id))!.email === "jean@exemple.fr");
  ok("étape gagnée bien posée", (await db.get<Prospect>("marketing_prospects", a.prospect.id))!.stage_id === gagne.id);

  console.log("Contact modifié");
  await crm.updateContact(db, a.contact.id, { name: "Jean Dupont", phone: "07 11 22 33 44", tags: "vip, relancé, vip" });
  const contact = (await db.get<Contact>("marketing_contacts", a.contact.id))!;
  ok("fiche mise à jour, étiquettes dédoublonnées", contact.name === "Jean Dupont" && contact.phone_norm === "+33711223344" && contact.tags.length === 2);
  ok("la copie sur les affaires suit", (await db.get<Prospect>("marketing_prospects", a.prospect.id))!.name === "Jean Dupont");
  let dup = false; try { await crm.updateContact(db, a.contact.id, { email: "autre@exemple.fr" }); } catch { dup = true; }
  ok("email déjà pris par un autre contact : refusé", dup);
  ok("dernière activité du contact tenue à jour", !!contact.last_activity_at);

  console.log("Tâches « À appeler »");
  const t1 = await crm.ensureTask(db, { prospect_id: e.prospect.id, kind: "a_appeler", assignee_id: "membre-2", due_at: "2026-11-16T09:00:00Z", origin: "source" }, { "membre-2": "Sam" });
  const t2 = await crm.ensureTask(db, { prospect_id: e.prospect.id, kind: "a_appeler" });
  ok("tâche créée une fois (rejouable)", t1.created && !t2.created && t2.task.id === t1.task.id && count("marketing_tasks") === 1);
  ok("tâche rattachée au prospect et au contact", t1.task.prospect_id === e.prospect.id && t1.task.contact_id === a.contact.id && t1.task.title === "À appeler");
  const closed = await crm.closeOpenTasks(db, e.prospect.id, "a_appeler");
  const task = (await db.get<MarketingTask>("marketing_tasks", t1.task.id))!;
  ok("tâche fermée quand le rendez-vous arrive", closed === 1 && task.status === "faite" && task.done_by === "membre-1" && !!task.done_at);
  ok("chronologie : tâche créée puis terminée", events(e.prospect.id).some((x) => x.kind === "tache_creee" && x.data.pour === "Sam") && events(e.prospect.id).some((x) => x.kind === "tache_faite"));

  console.log("Étapes modifiables");
  const custom = await crm.createStage(db, { name: "Démo envoyée" });
  const list = await crm.listStages(db);
  ok("nouvelle étape placée avant Gagné et Perdu", list.findIndex((s) => s.id === custom.id) < list.findIndex((s) => s.key === "gagne"));
  let sys = false; try { await crm.updateStage(db, gagne.id, { active: false }); } catch { sys = true; }
  ok("étape d'origine : non retirable", sys);
  await crm.updateStage(db, gagne.id, { name: "Signé" });
  ok("étape d'origine : renommable, clé stable", (await crm.listStages(db)).find((s) => s.key === "gagne")!.name === "Signé");
  await crm.updateProspect(db, e.prospect.id, { stage_id: custom.id });
  let used = false; try { await crm.updateStage(db, custom.id, { active: false }); } catch { used = true; }
  ok("étape encore utilisée : non retirable", used);
  await crm.reorderStages(db, [...list].reverse().map((s) => s.id));
  ok("ordre des étapes enregistré", (await crm.listStages(db))[0].key === "perdu");

  console.log("Suppression d'un lead");
  {
    const t2: MemoryTables = {}; const d2 = new MemoryDb(t2, "membre-1"); await crm.ensureStages(d2);
    const a = await crm.upsertLead(d2, { name: "À supprimer", email: "suppr@exemple.fr", phone: "+33611110000" }, { kind: "cree", label: "test" });
    const b = await crm.upsertLead(d2, { name: "Deux affaires", email: "deux@exemple.fr" }, { kind: "cree", label: "test" });
    const b2 = await crm.upsertLead(d2, { name: "Deux affaires", email: "deux@exemple.fr", newDeal: true }, { kind: "cree", label: "test" });
    await crm.createTask(d2, { prospect_id: a.prospect.id, kind: "a_appeler" }); await crm.addNote(d2, a.prospect.id, "note");
    await d2.insert("marketing_appointments", { prospect_id: a.prospect.id, starts_at: "2026-12-01T10:00:00Z", ends_at: "2026-12-01T10:30:00Z", status: "confirme", source: "iclosed", external_id: "x" });
    const r1 = await crm.deleteProspect(d2, a.prospect.id);
    const left = (table: string) => (t2[table] ?? []).filter((r) => r.prospect_id === a.prospect.id).length;
    ok("le lead est supprimé avec son historique, ses tâches et ses rendez-vous", !(await d2.get("marketing_prospects", a.prospect.id)) && left("marketing_prospect_events") === 0 && left("marketing_tasks") === 0 && left("marketing_appointments") === 0);
    ok("sa fiche contact part avec lui quand il n'a pas d'autre affaire", r1.contactDeleted && !(await d2.get("marketing_contacts", a.contact.id)));
    const r2 = await crm.deleteProspect(d2, b.prospect.id);
    ok("un contact qui a une autre affaire est gardé", b2.prospect.id !== b.prospect.id && !r2.contactDeleted && !!(await d2.get("marketing_contacts", b.contact.id)) && !!(await d2.get("marketing_prospects", b2.prospect.id)));
    let gone = false; try { await crm.deleteProspect(d2, a.prospect.id); } catch { gone = true; }
    ok("supprimer deux fois : message clair, rien d'autre n'est touché", gone && (t2.marketing_prospects ?? []).length === 1);
  }

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
