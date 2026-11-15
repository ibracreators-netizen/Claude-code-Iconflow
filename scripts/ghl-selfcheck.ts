/**
 * Vérification hors ligne de l'import GoHighLevel. Aucune base, aucun réseau.
 * Lancer : pnpm dlx tsx scripts/ghl-selfcheck.ts
 */
import { MemoryDb, type MemoryTables } from "../src/lib/marketing/db";
import { ensureStages } from "../src/lib/marketing/crm";
import { parseCsv, parseDate, readContacts, readOpportunities, suggestStage } from "../src/lib/marketing/ghl";
import { importContacts, importOpportunities } from "../src/lib/marketing/import-ghl";
import type { Contact, Member, Prospect } from "../src/lib/marketing/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };

const CONTACTS = `Contact Id,First Name,Last Name,Email,Phone,Business Name,Tags,Source,Created
c1,Jean,Dupont,Jean@Exemple.fr,06 12 34 56 78,Maison J,"vip, sprint",Facebook Ads,2025-03-15 14:23:00
c2,Ana,,ana@exemple.fr,,"Studio ""Ana""",newsletter,,15/04/2025
c3,Jean,D.,jean.pro@exemple.fr,+33 6 12 34 56 78,,relance,,
c4,Sans,Rien,,,,,,
,Bob,Martin,pas-un-email,,,,,
c6,Léa,Petit,,07 55 44 33 22,,,TikTok,2025-05-01T09:00:00Z
,Sans,Identifiant,,,,,,`;
const OPPS = `Opportunity ID;Opportunity Name;Contact ID;Contact Name;Email;Phone;Pipeline;Stage;Status;Lead Value;Source;Assigned;Created on;Tags
o1;Sprint Maison J;c1;Jean Dupont;jean@exemple.fr;;Ventes;Call booké;open;4000;Facebook Ads;Sam Setter;2025-03-16 10:00:00;chaud
o2;Sprint Ana;c2;Ana;ana@exemple.fr;;Ventes;Proposition;won;"6 500,50";;Clara Closer;2025-04-20 10:00:00;
o3;Nouveau contact;;Zoé Neuf;zoe@exemple.fr;0611223344;Ventes;Nouveau;open;;;Inconnu;2025-06-01 10:00:00;
o4;Sans contact;;Personne;;;Ventes;Nouveau;open;;;;;
o5;Étape inconnue;c1;Jean Dupont;jean@exemple.fr;;Ventes;Étape bizarre;open;;;;;
o6;Abandonnée;c6;Léa Petit;;;Ventes;Call booké;abandoned;;;;;`;

(async () => {
  console.log("Lecture des fichiers");
  const csv = parseCsv("﻿" + CONTACTS);
  ok("virgules, guillemets doublés, BOM", csv.headers[0] === "Contact Id" && csv.rows.length === 7 && csv.rows[1]["Business Name"] === 'Studio "Ana"');
  const contacts = readContacts(csv);
  ok("colonnes reconnues", contacts.columns.email === "Email" && contacts.columns.company === "Business Name" && contacts.columns.created === "Created");
  ok("prénom + nom assemblés, étiquettes séparées", contacts.rows[0].name === "Jean Dupont" && contacts.rows[0].tags.length === 2);
  ok("dates : format GHL, format français, ISO", contacts.rows[0].created_at === "2025-03-15T14:23:00.000Z" && contacts.rows[1].created_at === "2025-04-15T12:00:00.000Z" && contacts.rows[5].created_at === "2025-05-01T09:00:00.000Z");
  ok("date illisible : ignorée, pas inventée", parseDate("bientôt") === null && parseDate("") === null);
  const opps = readOpportunities(parseCsv(OPPS));
  ok("point-virgule détecté, montant « 6 500,50 » lu", opps.rows.length === 6 && opps.rows[1].value === 6500.5 && opps.rows[0].value === 4000);
  const fr = readContacts(parseCsv("Prénom;Nom;E-mail;Téléphone;Entreprise;Étiquettes\nZoé;Neuf;zoe@exemple.fr;;;a|b"));
  ok("intitulés français reconnus", fr.rows[0].name === "Zoé Neuf" && fr.rows[0].email === "zoe@exemple.fr" && fr.rows[0].tags.length === 2);

  console.log("Import des contacts");
  const tables: MemoryTables = {};
  const db = new MemoryDb(tables, "admin");
  const stages = await ensureStages(db);
  const all = <T>(t: string) => (tables[t] ?? []) as unknown as T[];
  const r1 = await importContacts(db, contacts.rows);
  ok("5 lignes utiles : 4 créés, 1 fusionné", r1.created === 4 && r1.merged === 1, JSON.stringify(r1));
  ok("sans email ni téléphone mais avec un identifiant GHL : gardé (reconnaissable au réimport)", all<Contact>("marketing_contacts").some((c) => c.name === "Sans Rien"));
  ok("même téléphone, autre email : fusionné dans la fiche de Jean", all<Contact>("marketing_contacts").filter((c) => c.phone_norm === "+33612345678").length === 1);
  ok("2 lignes rejetées, avec la raison", r1.rejected.length === 2 && r1.rejected.some((x) => /Ni email ni téléphone/.test(x.reason)) && r1.rejected.some((x) => /Email invalide/.test(x.reason)));
  const jean = all<Contact>("marketing_contacts").find((c) => c.email === "jean@exemple.fr")!;
  ok("étiquettes, source, entreprise et date de création conservées", jean.tags.includes("vip") && jean.tags.includes("relance") && jean.source === "Facebook Ads" && jean.company === "Maison J" && jean.created_at === "2025-03-15T14:23:00.000Z");
  const r2 = await importContacts(db, contacts.rows);
  ok("réimport du même fichier : aucun doublon", r2.created === 0 && r2.merged === 5 && all<Contact>("marketing_contacts").length === 4, JSON.stringify(r2));

  console.log("Import des opportunités");
  const members: Member[] = [{ id: "m-sam", name: "Sam Setter", email: null, marketing_role: "setter", admin: false }, { id: "m-clara", name: "Clara Closer", email: null, marketing_role: "closer", admin: false }];
  ok("étapes proposées d'après leur nom", suggestStage("Call booké", stages) === "audit_reserve" && suggestStage("Proposition", stages) === "proposition" && suggestStage("Nouveau", stages) === "nouveau_lead" && suggestStage("Étape bizarre", stages) === null);
  const mapping = { stages: { "Call booké": "audit_reserve", "Proposition": "proposition", "Nouveau": "nouveau_lead" }, owners: { "Sam Setter": "m-sam", "Clara Closer": "m-clara" } };
  const o1 = await importOpportunities(db, opps.rows, mapping, members);
  ok("4 affaires créées, 2 rejetées", o1.created === 4 && o1.rejected.length === 2, JSON.stringify(o1));
  ok("rejets expliqués : contact introuvable, étape non associée", o1.rejected.some((x) => /Contact introuvable/.test(x.reason)) && o1.rejected.some((x) => /non associée/.test(x.reason)));
  const prospects = all<Prospect>("marketing_prospects");
  const p1 = prospects.find((p) => p.title === "Sprint Maison J")!, p2 = prospects.find((p) => p.title === "Sprint Ana")!, p6 = prospects.find((p) => p.title === "Abandonnée")!;
  const stageKey = (id: string | null | undefined) => stages.find((s) => s.id === id)?.key;
  ok("affaire rattachée au contact déjà importé (par son identifiant GHL)", p1.contact_id === jean.id && all<Contact>("marketing_contacts").length === 5);
  ok("étape, valeur, source, date de création reprises", stageKey(p1.stage_id) === "audit_reserve" && p1.value === 4000 && p1.source === "Facebook Ads" && p1.created_at === "2025-03-16T10:00:00.000Z");
  ok("responsable : setter ou closer selon son rôle", p1.setter_id === "m-sam" && p1.closer_id === null && p2.closer_id === "m-clara" && p2.setter_id === null);
  ok("statut « won » de GHL : affaire en Gagné, montant signé", stageKey(p2.stage_id) === "gagne" && p2.signed_amount === 6500.5 && p2.outcome === "signe");
  ok("statut « abandoned » : affaire en Perdu, contact trouvé sans email", stageKey(p6.stage_id) === "perdu" && !!p6.contact_id);
  ok("contact absent du fichier contacts : créé depuis l'opportunité", all<Contact>("marketing_contacts").some((c) => c.email === "zoe@exemple.fr" && c.phone_norm === "+33611223344"));
  ok("étiquette de l'opportunité ajoutée au contact", all<Contact>("marketing_contacts").find((c) => c.id === jean.id)!.tags.includes("chaud"));
  const o2 = await importOpportunities(db, opps.rows, mapping, members);
  ok("réimport des opportunités : aucun doublon", o2.created === 0 && o2.merged === 4 && all<Prospect>("marketing_prospects").length === 4);
  ok("chronologie : création + import, avec l'étape d'origine", (tables.marketing_prospect_events as unknown as Array<{ prospect_id: string; kind: string; data: { detail?: string } }>).some((e) => e.prospect_id === p1.id && e.kind === "import" && /Call booké/.test(e.data.detail ?? "")));

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
