/**
 * Import des exports GoHighLevel, écrit contre `Db` (vérifiable hors ligne : scripts/ghl-selfcheck.ts).
 *
 * Rejouable sans doublon :
 *  - un contact est reconnu par son identifiant GHL (référence externe), puis par son email, puis par son téléphone ;
 *  - une opportunité est reconnue par son identifiant GHL, sinon par une empreinte (contact + intitulé + date).
 * On complète une fiche existante, on n'écrase jamais une valeur déjà saisie.
 */
import type { Db } from "./db";
import { cleanTags, listStages, logEvent, normalizeEmail, normalizePhone, upsertLead } from "./crm";
import type { GhlContactRow, GhlOpportunityRow } from "./ghl";
import type { Contact, Member, Prospect } from "./types";

export interface Rejected { line: number; label: string; reason: string }
export interface ImportBatchResult { created: number; merged: number; rejected: Rejected[] }
interface Ref { id: string; source: string; entity: string; external_id: string; entity_id: string }

const SOURCE = "ghl";
const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const phoneKey = (v: unknown) => { const n = normalizePhone(v); return n && n.replace(/\D/g, "").length >= 8 ? n : null; };

async function refsFor(db: Db, entity: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk([...new Set(ids)], 150)) for (const r of await db.list<Ref>("marketing_external_refs", { where: [["eq", "source", SOURCE], ["eq", "entity", entity], ["in", "external_id", part]] })) out.set(r.external_id, r.entity_id);
  return out;
}
async function saveRef(db: Db, entity: string, externalId: string, entityId: string) {
  try { await db.insert("marketing_external_refs", { source: SOURCE, entity, external_id: externalId, entity_id: entityId }); } catch { /* déjà connue : rien à faire */ }
}
/** Contacts déjà en base pour ces emails et ces téléphones, en deux lectures par lot (pas une par ligne). */
async function contactsFor(db: Db, emails: string[], phones: string[]) {
  const byEmail = new Map<string, Contact>(), byPhone = new Map<string, Contact>(), byId = new Map<string, Contact>();
  const add = (c: Contact) => { byId.set(c.id, c); if (c.email) byEmail.set(c.email.toLowerCase(), c); if (c.phone_norm && !byPhone.has(c.phone_norm)) byPhone.set(c.phone_norm, c); };
  for (const part of chunk([...new Set(emails)], 150)) (await db.list<Contact>("marketing_contacts", { where: [["in", "email", part]] })).forEach(add);
  for (const part of chunk([...new Set(phones)], 150)) (await db.list<Contact>("marketing_contacts", { where: [["in", "phone_norm", part]], order: ["created_at", "asc"] })).forEach(add);
  return { byEmail, byPhone, byId, add };
}

/** Importe un lot de contacts. */
export async function importContacts(db: Db, rows: GhlContactRow[]): Promise<ImportBatchResult> {
  const res: ImportBatchResult = { created: 0, merged: 0, rejected: [] };
  const prepared = rows.map((r) => ({ r, email: normalizeEmail(r.email), phone: phoneKey(r.phone) }));
  const refs = await refsFor(db, "contact", prepared.map((p) => p.r.external_id).filter((x): x is string => !!x));
  const known = await contactsFor(db, prepared.map((p) => p.email).filter((x): x is string => !!x), prepared.map((p) => p.phone).filter((x): x is string => !!x));

  for (const { r, email, phone } of prepared) {
    const label = r.name ?? r.email ?? r.phone ?? `ligne ${r.line}`;
    if (r.email && !email && !phone && !r.external_id) { res.rejected.push({ line: r.line, label, reason: `Email invalide (« ${r.email} ») et aucun téléphone` }); continue; }
    if (!email && !phone && !r.external_id) { res.rejected.push({ line: r.line, label, reason: "Ni email ni téléphone : impossible à dédoublonner" }); continue; }
    if (!email && !phone && !r.name) { res.rejected.push({ line: r.line, label, reason: "Ligne sans nom, sans email et sans téléphone" }); continue; }
    try {
      const refId = r.external_id ? refs.get(r.external_id) : undefined;
      let existing = (refId ? known.byId.get(refId) ?? await db.get<Contact>("marketing_contacts", refId) : null) ?? (email ? known.byEmail.get(email) : undefined) ?? (phone ? known.byPhone.get(phone) : undefined) ?? null;
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (!existing.name && r.name) patch.name = r.name;
        if (!existing.email && email && !known.byEmail.has(email)) patch.email = email;
        if (!existing.phone && r.phone) { patch.phone = r.phone; patch.phone_norm = normalizePhone(r.phone); }
        if (!existing.company && r.company) patch.company = r.company;
        if (!existing.source && r.source) patch.source = r.source;
        const tags = [...new Set([...(existing.tags ?? []), ...cleanTags(r.tags)])];
        if (tags.length !== (existing.tags ?? []).length) patch.tags = tags;
        if (Object.keys(patch).length) existing = await db.update<Contact>("marketing_contacts", existing.id, patch);
        res.merged++;
      } else {
        const row: Record<string, unknown> = { name: r.name, email, phone: r.phone, phone_norm: normalizePhone(r.phone), company: r.company, tags: cleanTags(r.tags), source: r.source ?? "GoHighLevel", created_by: db.actor };
        if (r.created_at) row.created_at = r.created_at;
        existing = await db.insert<Contact>("marketing_contacts", row);
        res.created++;
      }
      known.add(existing);
      if (r.external_id && !refId) { await saveRef(db, "contact", r.external_id, existing.id); refs.set(r.external_id, existing.id); }
    } catch (e) {
      res.rejected.push({ line: r.line, label, reason: `Écriture impossible : ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}` });
    }
  }
  return res;
}

export interface OpportunityMapping {
  /** Intitulé d'étape GHL → clé d'étape de l'app. Une étape absente ou « ignorer » fait rejeter la ligne. */
  stages: Record<string, string>;
  /** Nom du responsable dans GHL → identifiant du membre (ou "" pour personne). */
  owners: Record<string, string>;
}

/** Importe un lot d'opportunités : une affaire par ligne, rattachée à son contact (créé s'il manque). */
export async function importOpportunities(db: Db, rows: GhlOpportunityRow[], mapping: OpportunityMapping, members: Member[]): Promise<ImportBatchResult> {
  const res: ImportBatchResult = { created: 0, merged: 0, rejected: [] };
  const stages = await listStages(db, { includeInactive: true });
  const prepared = rows.map((r) => ({ r, email: normalizeEmail(r.email), phone: phoneKey(r.phone) }));
  const contactRefs = await refsFor(db, "contact", prepared.map((p) => p.r.contact_external_id).filter((x): x is string => !!x));
  const role = new Map(members.map((m) => [m.id, m.marketing_role]));
  const key = (r: GhlOpportunityRow, contactKey: string) => r.external_id ?? `sans-id:${contactKey}|${(r.title ?? "").toLowerCase()}|${r.created_at ?? ""}`;
  const dealRefs = await refsFor(db, "prospect", prepared.map(({ r, email, phone }) => key(r, r.contact_external_id ?? email ?? phone ?? "")));

  for (const { r, email, phone } of prepared) {
    const label = r.title ?? r.contact_name ?? r.email ?? `ligne ${r.line}`;
    const contactId = r.contact_external_id ? contactRefs.get(r.contact_external_id) : undefined;
    if (!contactId && !email && !phone) { res.rejected.push({ line: r.line, label, reason: "Contact introuvable : ni email, ni téléphone, ni identifiant de contact déjà importé" }); continue; }
    // Statut gagné / perdu de GHL : il prime quand l'étape choisie est une étape « en cours ».
    let stageKey = r.stage ? mapping.stages[r.stage] : "nouveau_lead";
    if (!stageKey || stageKey === "ignorer") { res.rejected.push({ line: r.line, label, reason: r.stage ? `Étape « ${r.stage} » non associée à une étape de l'app` : "Étape manquante" }); continue; }
    const chosen = stages.find((s) => s.key === stageKey);
    if (!chosen) { res.rejected.push({ line: r.line, label, reason: `Étape de l'app introuvable : ${stageKey}` }); continue; }
    if (chosen.kind === "ouvert" && r.status === "won") stageKey = "gagne";
    if (chosen.kind === "ouvert" && (r.status === "lost" || r.status === "abandoned")) stageKey = "perdu";
    const ref = key(r, r.contact_external_id ?? email ?? phone ?? "");
    try {
      const existingId = dealRefs.get(ref);
      if (existingId && await db.get<Prospect>("marketing_prospects", existingId)) { res.merged++; continue; }
      const owner = r.assigned ? mapping.owners[r.assigned] || null : null;
      const asCloser = owner ? role.get(owner) === "closer" : false;
      const out = await upsertLead(db, {
        contact_id: contactId ?? null, email, phone: r.phone, name: r.contact_name, tags: r.tags, source: r.source ?? "GoHighLevel",
        stage_key: stageKey, title: r.title, value: r.value, notes: r.notes, created_at: r.created_at,
        setter_id: owner && !asCloser ? owner : null, closer_id: owner && asCloser ? owner : null, newDeal: true,
      }, { kind: "cree", label: "Import GoHighLevel" });
      if (r.tags.length) { const tags = [...new Set([...(out.contact.tags ?? []), ...cleanTags(r.tags)])]; if (tags.length !== (out.contact.tags ?? []).length) await db.update("marketing_contacts", out.contact.id, { tags }); }
      if (stageKey === "gagne" && r.value != null) await db.update("marketing_prospects", out.prospect.id, { signed_amount: r.value, outcome: "signe" });
      if (r.contact_external_id && !contactId) { await saveRef(db, "contact", r.contact_external_id, out.contact.id); contactRefs.set(r.contact_external_id, out.contact.id); }
      await saveRef(db, "prospect", ref, out.prospect.id); dealRefs.set(ref, out.prospect.id);
      await logEvent(db, out.prospect.id, "import", { origine: "GoHighLevel", detail: [r.stage ? `étape d'origine : ${r.stage}` : null, r.assigned ? `responsable : ${r.assigned}` : null, r.status ? `statut : ${r.status}` : null].filter(Boolean).join(", ") });
      res.created++;
    } catch (e) {
      res.rejected.push({ line: r.line, label, reason: `Écriture impossible : ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}` });
    }
  }
  return res;
}
