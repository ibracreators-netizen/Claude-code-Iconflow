/**
 * Cœur du CRM Marketing : contacts, prospects (affaires), étapes, tâches, chronologie.
 * Écrit contre l'interface `Db` : le même code sert en production et sans base, et se
 * vérifie hors ligne (scripts/crm-selfcheck.ts).
 *
 * Règles :
 *  - UNE fiche contact par personne : rapprochement par email, puis par téléphone normalisé.
 *    L'opt-in du site, l'import GHL et l'outil de réservation passent tous par `upsertLead`.
 *  - On complète une fiche, on n'écrase jamais une valeur déjà saisie.
 *  - Chaque changement s'écrit dans la chronologie, avec son auteur (`db.actor`).
 */
import type { Db } from "./db";
import type { CallResult, Contact, MarketingTask, Outcome, Prospect, ProspectEventKind, ProspectStatus, Stage, StageKind, TaskKind } from "./types";

const T = { contacts: "marketing_contacts", prospects: "marketing_prospects", stages: "marketing_pipeline_stages", tasks: "marketing_tasks", events: "marketing_prospect_events" } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const clean = (v: unknown, max = 200): string | null => { if (typeof v !== "string" && typeof v !== "number") return null; const s = String(v).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max); return s || null; };

export function normalizeEmail(v: unknown): string | null { const e = (clean(v, 254) ?? "").toLowerCase(); return EMAIL_RE.test(e) ? e : null; }

/** 06 12 34 56 78 → +33612345678 ; 0033 6… → +336… ; +33 (0)6… → +336… (même règle que la base). */
export function normalizePhone(v: unknown): string | null {
  const raw = clean(v, 40); if (!raw) return null;
  const s = raw.replace(/\(0\)/g, "");
  const plus = s.trim().startsWith("+");
  const d = s.replace(/[^0-9]/g, "");
  if (!d) return null;
  if (plus) return `+${d}`;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  if (/^0[1-9][0-9]{8}$/.test(d)) return `+33${d.slice(1)}`;
  if (d.length >= 11 && d.length <= 15) return `+${d}`;
  return d;
}
/** Un téléphone trop court ne sert pas à rapprocher deux fiches. */
const phoneKey = (v: unknown) => { const n = normalizePhone(v); return n && n.replace(/\D/g, "").length >= 8 ? n : null; };
export const cleanTags = (tags: unknown): string[] => [...new Set((Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,;|]/) : []).map((t) => clean(t, 40)).filter((t): t is string => !!t))].slice(0, 30);

/* ─────────────────────────── Étapes ─────────────────────────── */

/** Les sept étapes d'origine du pipeline « IconFlow — Ventes » (mêmes clés que la migration 0018). */
export const DEFAULT_STAGES: Array<Pick<Stage, "key" | "name" | "position" | "kind" | "legacy_status">> = [
  { key: "nouveau_lead", name: "Nouveau lead", position: 10, kind: "ouvert", legacy_status: "nouveau" },
  { key: "audit_reserve", name: "Audit réservé", position: 20, kind: "ouvert", legacy_status: "reserve" },
  { key: "audit_effectue", name: "Audit effectué", position: 30, kind: "ouvert", legacy_status: "reserve" },
  { key: "followup", name: "Follow-up planifié", position: 40, kind: "ouvert", legacy_status: "relance" },
  { key: "proposition", name: "Proposition envoyée", position: 50, kind: "ouvert", legacy_status: "relance" },
  { key: "gagne", name: "Gagné", position: 60, kind: "gagne", legacy_status: "converti" },
  { key: "perdu", name: "Perdu", position: 70, kind: "perdu", legacy_status: "perdu" },
];
/** Ancien statut → clé d'étape (même correspondance que la migration 0018). */
export const STAGE_KEY_FOR_STATUS: Record<ProspectStatus, string> = { nouveau: "nouveau_lead", relance: "nouveau_lead", reserve: "audit_reserve", converti: "gagne", perdu: "perdu" };

export async function listStages(db: Db, opts: { includeInactive?: boolean } = {}): Promise<Stage[]> {
  const rows = await db.list<Stage>(T.stages, { order: ["position", "asc"] });
  return opts.includeInactive ? rows : rows.filter((s) => s.active);
}
/** Sans base reliée, les sept étapes d'origine sont posées au premier accès (en production : la migration). */
export async function ensureStages(db: Db): Promise<Stage[]> {
  const rows = await listStages(db, { includeInactive: true });
  if (rows.length) return rows.filter((s) => s.active);
  for (const s of DEFAULT_STAGES) await db.insert<Stage>(T.stages, { ...s, is_system: true, active: true });
  return listStages(db);
}
const slug = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "etape";

export async function createStage(db: Db, input: { name: string; kind?: StageKind }): Promise<Stage> {
  const name = clean(input.name, 60); if (!name) throw new Error("Donne un nom à l'étape.");
  const all = await listStages(db, { includeInactive: true });
  let key = slug(name); for (let i = 2; all.some((s) => s.key === key); i++) key = `${slug(name)}_${i}`;
  const kind: StageKind = input.kind ?? "ouvert";
  // Une nouvelle étape « en cours » se place avant Gagné / Perdu.
  const open = all.filter((s) => s.kind === "ouvert"), last = (kind === "ouvert" ? open : all).reduce((m, s) => Math.max(m, s.position), 0);
  return db.insert<Stage>(T.stages, { key, name, kind, position: last + 5, legacy_status: kind === "gagne" ? "converti" : kind === "perdu" ? "perdu" : "relance", is_system: false, active: true });
}
export async function updateStage(db: Db, id: string, patch: { name?: string; position?: number; active?: boolean; color?: string | null }): Promise<Stage> {
  const stage = await db.get<Stage>(T.stages, id); if (!stage) throw new Error("Étape introuvable.");
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) { const n = clean(patch.name, 60); if (!n) throw new Error("Donne un nom à l'étape."); values.name = n; }
  if (patch.position !== undefined) values.position = patch.position;
  if (patch.color !== undefined) values.color = patch.color && ["gris", "bleu", "vert", "jaune", "orange", "rouge", "violet", "rose"].includes(patch.color) ? patch.color : null;
  if (patch.active !== undefined) {
    if (!patch.active && stage.is_system) throw new Error("Cette étape fait partie du pipeline d'origine : tu peux la renommer, pas la retirer.");
    if (!patch.active && (await db.list<Prospect>(T.prospects, { where: [["eq", "stage_id", id]], limit: 1 })).length) throw new Error("Des prospects sont encore à cette étape : déplace-les d'abord.");
    values.active = patch.active;
  }
  return db.update<Stage>(T.stages, id, values);
}
/** Nouvel ordre des étapes : la liste d'identifiants, de gauche à droite. */
export async function reorderStages(db: Db, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) await db.update(T.stages, ids[i], { position: (i + 1) * 10 });
}

/* ─────────────────────────── Chronologie ─────────────────────────── */

/** Écrit dans la chronologie du prospect. Best-effort : journaliser n'échoue jamais l'action principale. */
export async function logEvent(db: Db, prospectId: string, kind: ProspectEventKind, data: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.insert(T.events, { prospect_id: prospectId, kind, data, created_by: db.actor });
  } catch { /* best-effort */ }
}

/* ─────────────────────────── Contacts ─────────────────────────── */

export interface ContactInput { name?: string | null; email?: string | null; phone?: string | null; company?: string | null; tags?: string[] | string | null; source?: string | null; created_at?: string | null }

export async function findContact(db: Db, by: { email?: unknown; phone?: unknown }): Promise<Contact | null> {
  const email = normalizeEmail(by.email);
  if (email) { const [c] = await db.list<Contact>(T.contacts, { where: [["ieq", "email", email]], limit: 1 }); if (c) return c; }
  const phone = phoneKey(by.phone);
  if (phone) { const [c] = await db.list<Contact>(T.contacts, { where: [["eq", "phone_norm", phone]], order: ["created_at", "asc"], limit: 1 }); if (c) return c; }
  return null;
}

/** Crée la fiche, ou complète celle qui existe déjà pour cet email ou ce téléphone. */
export async function upsertContact(db: Db, input: ContactInput): Promise<{ contact: Contact; created: boolean }> {
  const email = normalizeEmail(input.email), phone = clean(input.phone, 40), tags = cleanTags(input.tags);
  const existing = await findContact(db, { email, phone });
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.name && clean(input.name)) patch.name = clean(input.name);
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && phone) { patch.phone = phone; patch.phone_norm = normalizePhone(phone); }
    if (!existing.company && clean(input.company)) patch.company = clean(input.company);
    if (!existing.source && clean(input.source)) patch.source = clean(input.source);
    const merged = [...new Set([...(existing.tags ?? []), ...tags])];
    if (merged.length !== (existing.tags ?? []).length) patch.tags = merged;
    return { contact: Object.keys(patch).length ? await db.update<Contact>(T.contacts, existing.id, patch) : existing, created: false };
  }
  if (!email && !phoneKey(phone) && !clean(input.name)) throw new Error("Un contact a besoin d'un email, d'un téléphone ou d'un nom.");
  const row: Record<string, unknown> = { name: clean(input.name), email, phone, phone_norm: normalizePhone(phone), company: clean(input.company), tags, source: clean(input.source, 120), created_by: db.actor };
  if (input.created_at) row.created_at = input.created_at;
  return { contact: await db.insert<Contact>(T.contacts, row), created: true };
}

export async function updateContact(db: Db, id: string, patch: ContactInput): Promise<Contact> {
  const before = await db.get<Contact>(T.contacts, id); if (!before) throw new Error("Contact introuvable.");
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = clean(patch.name);
  if (patch.company !== undefined) values.company = clean(patch.company);
  if (patch.source !== undefined) values.source = clean(patch.source, 120);
  if (patch.tags !== undefined) values.tags = cleanTags(patch.tags);
  if (patch.phone !== undefined) { values.phone = clean(patch.phone, 40); values.phone_norm = normalizePhone(patch.phone); }
  if (patch.email !== undefined) {
    const raw = clean(patch.email, 254), email = normalizeEmail(raw);
    if (raw && !email) throw new Error("Cet email n'est pas valide.");
    if (email && email !== (before.email ?? "").toLowerCase()) {
      const other = await findContact(db, { email });
      if (other && other.id !== id) throw new Error("Un autre contact porte déjà cet email.");
    }
    values.email = email;
  }
  const after = await db.update<Contact>(T.contacts, id, values);
  const changed = (Object.keys(values) as Array<keyof Contact>).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null) && k !== "phone_norm");
  if (changed.length) {
    // Les copies portées par les prospects suivent la fiche (elles servent aux anciens écrans et aux relances).
    const prospects = await db.list<Prospect>(T.prospects, { where: [["eq", "contact_id", id]], order: ["created_at", "asc"] });
    for (const [i, p] of prospects.entries()) {
      const copy: Record<string, unknown> = {};
      if (changed.includes("name")) copy.name = after.name;
      if (changed.includes("phone")) copy.phone = after.phone;
      if (changed.includes("email") && i === 0) copy.email = after.email;
      if (Object.keys(copy).length) await db.update(T.prospects, p.id, copy);
      await logEvent(db, p.id, "contact_modifie", { champs: changed });
    }
  }
  return after;
}

/* ─────────────────────────── Prospects (affaires) ─────────────────────────── */

export interface LeadInput extends ContactInput {
  marque?: string | null; site?: string | null; landing_page?: string | null; referrer?: string | null; utm?: Record<string, string> | null;
  opted_in_at?: string | null;
  /** Étape voulue (clé). Par défaut : « Nouveau lead ». N'est appliquée qu'à la création. */
  stage_key?: string | null;
  title?: string | null; value?: number | null; setter_id?: string | null; closer_id?: string | null; notes?: string | null;
  /** Vrai : crée toujours une nouvelle affaire (import d'opportunités). Sinon, on réutilise l'affaire en cours. */
  newDeal?: boolean;
  /** Contact déjà identifié (par une référence externe) : on ne le recherche pas à nouveau. */
  contact_id?: string | null;
}
export interface LeadResult { contact: Contact; prospect: Prospect; createdContact: boolean; createdProspect: boolean }

const statusOf = (stage: Stage | undefined): ProspectStatus => stage?.legacy_status ?? "nouveau";

/** L'affaire « en cours » d'un contact : la plus récente dont l'étape n'est ni Gagné ni Perdu. */
export async function openProspect(db: Db, contactId: string, stages?: Stage[]): Promise<Prospect | null> {
  const all = stages ?? await listStages(db, { includeInactive: true });
  const closed = new Set(all.filter((s) => s.kind !== "ouvert").map((s) => s.id));
  const rows = await db.list<Prospect>(T.prospects, { where: [["eq", "contact_id", contactId]], order: ["created_at", "desc"] });
  return rows.find((p) => !p.stage_id || !closed.has(p.stage_id)) ?? null;
}

/**
 * Point d'entrée unique de tout lead (site, import, outil de réservation, saisie à la main) :
 * rapproche ou crée le contact, puis complète son affaire en cours ou en ouvre une.
 */
export async function upsertLead(db: Db, input: LeadInput, origin: { kind: ProspectEventKind; label: string }): Promise<LeadResult> {
  const stages = await ensureStages(db);
  const known = input.contact_id ? await db.get<Contact>(T.contacts, input.contact_id) : null;
  const { contact, created: createdContact } = known ? { contact: known, created: false } : await upsertContact(db, { ...input, company: input.company ?? input.marque });
  const existing = input.newDeal ? null : await openProspect(db, contact.id, stages);
  const at = input.opted_in_at ?? null;

  if (existing) {
    const patch: Record<string, unknown> = {};
    const fill = (k: keyof Prospect, v: unknown) => { if ((existing[k] === null || existing[k] === undefined) && v !== null && v !== undefined && v !== "") patch[k] = v; };
    fill("name", clean(input.name)); fill("phone", clean(input.phone, 40)); fill("marque", clean(input.marque ?? input.company, 120)); fill("utm", input.utm ?? null);
    fill("site", clean(input.site, 120)); fill("landing_page", clean(input.landing_page, 500)); fill("referrer", clean(input.referrer, 500)); fill("opted_in_at", at);
    fill("source", clean(input.source, 120)); fill("setter_id", input.setter_id ?? null); fill("closer_id", input.closer_id ?? null); fill("value", input.value ?? null);
    const prospect = Object.keys(patch).length ? await db.update<Prospect>(T.prospects, existing.id, patch) : existing;
    if (at && !existing.opted_in_at) await logEvent(db, prospect.id, "opt_in", { source: prospect.source, landing_page: prospect.landing_page ?? null });
    return { contact, prospect, createdContact, createdProspect: false };
  }

  const stage = stages.find((s) => s.key === (input.stage_key ?? "nouveau_lead")) ?? stages.find((s) => s.key === "nouveau_lead") ?? stages[0];
  // L'email n'est recopié que sur la première affaire du contact (index unique hérité de l'ancien modèle).
  const first = !(await db.list<Prospect>(T.prospects, { where: [["eq", "contact_id", contact.id]], limit: 1 })).length;
  const row: Record<string, unknown> = {
    contact_id: contact.id, name: contact.name ?? clean(input.name), email: first ? contact.email : null, phone: contact.phone ?? clean(input.phone, 40),
    source: clean(input.source, 120) ?? "manuel", marque: clean(input.marque ?? input.company, 120), utm: input.utm ?? null,
    site: clean(input.site, 120), landing_page: clean(input.landing_page, 500), referrer: clean(input.referrer, 500), opted_in_at: at,
    stage_id: stage?.id ?? null, status: statusOf(stage), stage_changed_at: input.created_at ?? new Date().toISOString(),
    title: clean(input.title, 160), value: input.value ?? null, setter_id: input.setter_id ?? null, closer_id: input.closer_id ?? null, notes: clean(input.notes, 4000), created_by: db.actor,
  };
  if (input.created_at) row.created_at = input.created_at;
  const prospect = await db.insert<Prospect>(T.prospects, row);
  await logEvent(db, prospect.id, "cree", { source: prospect.source, origine: origin.label, etape: stage?.name ?? null });
  if (origin.kind !== "cree") await logEvent(db, prospect.id, origin.kind, { origine: origin.label });
  if (at) await logEvent(db, prospect.id, "opt_in", { source: prospect.source, landing_page: prospect.landing_page ?? null });
  return { contact, prospect, createdContact, createdProspect: true };
}

export interface ProspectPatch {
  stage_id?: string; title?: string | null; value?: number | null; setter_id?: string | null; closer_id?: string | null;
  call_result?: CallResult | null; outcome?: Outcome | null; signed_amount?: number | null; call_note?: string | null;
  notes?: string | null; besoin?: string | null; budget?: string | null; next_action_at?: string | null; next_action_note?: string | null;
}
const CALL_RESULTS: CallResult[] = ["a_venir", "present", "absent", "annule", "reporte"], OUTCOMES: Outcome[] = ["signe", "non_signe", "en_reflexion"];
const amount = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", ".")); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error("Montant invalide."); return Math.round(n * 100) / 100; };

/** Met à jour l'affaire et écrit chaque changement dans la chronologie, avec son auteur. */
export async function updateProspect(db: Db, id: string, patch: ProspectPatch, names: Record<string, string> = {}): Promise<{ before: Prospect; after: Prospect }> {
  const before = await db.get<Prospect>(T.prospects, id); if (!before) throw new Error("Prospect introuvable.");
  const values: Record<string, unknown> = {};
  let stage: Stage | null = null, from: Stage | null = null;
  if (patch.stage_id !== undefined && patch.stage_id !== before.stage_id) {
    stage = await db.get<Stage>(T.stages, patch.stage_id); if (!stage || !stage.active) throw new Error("Étape introuvable.");
    from = before.stage_id ? await db.get<Stage>(T.stages, before.stage_id) : null;
    values.stage_id = stage.id; values.status = stage.legacy_status; values.stage_changed_at = new Date().toISOString();
  }
  if (patch.call_result !== undefined) { if (patch.call_result !== null && !CALL_RESULTS.includes(patch.call_result)) throw new Error("Résultat d'appel inconnu."); values.call_result = patch.call_result; }
  if (patch.outcome !== undefined) { if (patch.outcome !== null && !OUTCOMES.includes(patch.outcome)) throw new Error("Issue inconnue."); values.outcome = patch.outcome; }
  if (patch.signed_amount !== undefined) values.signed_amount = amount(patch.signed_amount);
  if (patch.value !== undefined) values.value = amount(patch.value);
  for (const k of ["setter_id", "closer_id", "next_action_at"] as const) if (patch[k] !== undefined) values[k] = patch[k] || null;
  for (const [k, max] of [["title", 160], ["call_note", 4000], ["notes", 4000], ["besoin", 2000], ["budget", 200], ["next_action_note", 500]] as const) if (patch[k] !== undefined) values[k] = clean(patch[k], max);
  if (!Object.keys(values).length) return { before, after: before };
  const after = await db.update<Prospect>(T.prospects, id, values);

  const who = (uid: string | null | undefined) => (uid ? names[uid] ?? null : null);
  if (stage) await logEvent(db, id, "etape", { de: from?.name ?? null, vers: stage.name, cle: stage.key });
  for (const [k, role] of [["setter_id", "setter"], ["closer_id", "closer"]] as const) if (k in values && before[k] !== after[k]) await logEvent(db, id, "attribution", { role, membre: after[k] ?? null, nom: who(after[k]), avant: who(before[k]) });
  if (("call_result" in values && before.call_result !== after.call_result) || ("outcome" in values && before.outcome !== after.outcome) || ("signed_amount" in values && before.signed_amount !== after.signed_amount) || ("call_note" in values && before.call_note !== after.call_note))
    await logEvent(db, id, "appel", { resultat: after.call_result ?? null, issue: after.outcome ?? null, montant_signe_ht: after.signed_amount ?? null, note: after.call_note ? String(after.call_note).slice(0, 200) : null });
  if (("value" in values && before.value !== after.value) || ("title" in values && before.title !== after.title)) await logEvent(db, id, "valeur", { valeur: after.value ?? null, titre: after.title ?? null });
  if (("besoin" in values && before.besoin !== after.besoin) || ("budget" in values && before.budget !== after.budget)) await logEvent(db, id, "qualification", { besoin: after.besoin ?? null, budget: after.budget ?? null });
  if (("next_action_at" in values && before.next_action_at !== after.next_action_at) || ("next_action_note" in values && before.next_action_note !== after.next_action_note)) await logEvent(db, id, "prochaine_action", { next_action_at: after.next_action_at ?? null, note: after.next_action_note ?? null });
  if ("notes" in values && before.notes !== after.notes && after.notes) await logEvent(db, id, "note", { excerpt: String(after.notes).slice(0, 140) });
  return { before, after };
}

/** Passe le prospect à une étape repérée par sa clé (automatisations, outil de réservation). Sans effet s'il y est déjà. */
export async function moveToStage(db: Db, prospectId: string, key: string): Promise<Prospect | null> {
  const stage = (await listStages(db)).find((s) => s.key === key); if (!stage) return null;
  return (await updateProspect(db, prospectId, { stage_id: stage.id })).after;
}

/** Note libre dans la chronologie du prospect (avec son auteur). */
export async function addNote(db: Db, prospectId: string, text: string): Promise<void> {
  const note = clean(text, 4000); if (!note) throw new Error("Écris la note avant de l'enregistrer.");
  if (!(await db.get<Prospect>(T.prospects, prospectId))) throw new Error("Prospect introuvable.");
  await db.insert(T.events, { prospect_id: prospectId, kind: "note", data: { texte: note, excerpt: note.slice(0, 200) }, created_by: db.actor });
}

/* ─────────────────────────── Tâches ─────────────────────────── */

export interface TaskInput { prospect_id: string; kind?: TaskKind; title?: string | null; note?: string | null; assignee_id?: string | null; due_at?: string | null; origin?: MarketingTask["origin"] }
const TASK_TITLES: Record<TaskKind, string> = { a_appeler: "À appeler", relance: "Relancer", resultat: "Saisir le résultat de l'appel", autre: "Tâche" };

export async function createTask(db: Db, input: TaskInput, names: Record<string, string> = {}): Promise<MarketingTask> {
  const prospect = await db.get<Prospect>(T.prospects, input.prospect_id); if (!prospect) throw new Error("Prospect introuvable.");
  const kind: TaskKind = input.kind ?? "a_appeler";
  const task = await db.insert<MarketingTask>(T.tasks, {
    prospect_id: prospect.id, contact_id: prospect.contact_id ?? null, kind, title: clean(input.title, 160) ?? TASK_TITLES[kind], note: clean(input.note, 2000),
    assignee_id: input.assignee_id ?? null, due_at: input.due_at ?? null, status: "ouverte", origin: input.origin ?? "manuel", created_by: db.actor,
  });
  await logEvent(db, prospect.id, "tache_creee", { tache: task.title, type: kind, pour: task.assignee_id ? names[task.assignee_id] ?? null : null, echeance: task.due_at });
  return task;
}
/** Crée la tâche seulement si aucune tâche ouverte du même type n'existe déjà pour ce prospect (rejouable). */
export async function ensureTask(db: Db, input: TaskInput, names: Record<string, string> = {}): Promise<{ task: MarketingTask; created: boolean }> {
  const [open] = await db.list<MarketingTask>(T.tasks, { where: [["eq", "prospect_id", input.prospect_id], ["eq", "kind", input.kind ?? "a_appeler"], ["eq", "status", "ouverte"]], limit: 1 });
  return open ? { task: open, created: false } : { task: await createTask(db, input, names), created: true };
}
export async function updateTask(db: Db, id: string, patch: { title?: string; note?: string | null; assignee_id?: string | null; due_at?: string | null }): Promise<MarketingTask> {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) { const t = clean(patch.title, 160); if (!t) throw new Error("Donne un titre à la tâche."); values.title = t; }
  if (patch.note !== undefined) values.note = clean(patch.note, 2000);
  if (patch.assignee_id !== undefined) values.assignee_id = patch.assignee_id || null;
  if (patch.due_at !== undefined) values.due_at = patch.due_at || null;
  return db.update<MarketingTask>(T.tasks, id, values);
}
export async function closeTask(db: Db, id: string, status: "faite" | "annulee" | "ouverte"): Promise<MarketingTask> {
  const before = await db.get<MarketingTask>(T.tasks, id); if (!before) throw new Error("Tâche introuvable.");
  if (before.status === status) return before;
  const task = await db.update<MarketingTask>(T.tasks, id, status === "ouverte" ? { status, done_at: null, done_by: null } : { status, done_at: new Date().toISOString(), done_by: db.actor });
  if (task.prospect_id && status !== "ouverte") await logEvent(db, task.prospect_id, status === "faite" ? "tache_faite" : "tache_annulee", { tache: task.title, type: task.kind });
  return task;
}
/** Ferme les tâches ouvertes d'un type pour un prospect (ex. « À appeler » quand le rendez-vous est pris). */
export async function closeOpenTasks(db: Db, prospectId: string, kind: TaskKind, status: "faite" | "annulee" = "faite"): Promise<number> {
  const open = await db.list<MarketingTask>(T.tasks, { where: [["eq", "prospect_id", prospectId], ["eq", "kind", kind], ["eq", "status", "ouverte"]] });
  for (const t of open) await closeTask(db, t.id, status);
  return open.length;
}
