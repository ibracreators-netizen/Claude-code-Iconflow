/**
 * Ressources, SOPs et onboarding de l'espace Marketing. Le module Documents existant est réutilisé :
 * mêmes tables (`documents`, `document_folders`), mêmes types (SOP, Template…), même format de contenu,
 * avec `space = 'marketing'`. Écrit contre `Db` ; aucun contenu n'est créé d'office, seulement la structure.
 */
import type { Db } from "./db";
import type { MarketingRole } from "./types";

export const RESOURCE_KINDS = ["sop", "template", "doc"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_KIND: Record<ResourceKind, string> = { sop: "SOP", template: "Template", doc: "Document" };
export const SECTIONS = ["Onboarding", "SOPs", "Ressources"] as const;
export const ROLES: MarketingRole[] = ["setter", "closer", "media_buyer"];

export interface Folder { id: string; name: string; parent_id: string | null; space: string; marketing_role: MarketingRole | null; position: number }
export interface Doc { id: string; title: string; icon: string | null; kind: string; content: string; folder_id: string | null; space: string; author_id: string | null; archived_at: string | null; created_at: string; updated_at: string }
export interface Step { id: string; role: MarketingRole; title: string; description: string | null; document_id: string | null; position: number }
export interface Progress { step_id: string; profile_id: string; done_at: string }

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "");
const MARKETING = ["eq", "space", "marketing"] as ["eq", string, unknown];

export async function folders(db: Db): Promise<Folder[]> { return db.list<Folder>("document_folders", { where: [MARKETING], order: ["position", "asc"] }); }
export async function documents(db: Db): Promise<Doc[]> { return (await db.list<Doc>("documents", { where: [MARKETING], order: ["updated_at", "desc"] })).filter((d) => !d.archived_at); }

/** Sans base reliée : la même structure vide que celle posée par la migration (un dossier par rôle, trois sous-dossiers). */
export async function ensureStructure(db: Db): Promise<Folder[]> {
  const all = await folders(db);
  if (all.length) return all;
  const labels: Record<MarketingRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };
  for (const [i, role] of ROLES.entries()) {
    const root = await db.insert<Folder>("document_folders", { name: labels[role], space: "marketing", marketing_role: role, parent_id: null, position: (i + 1) * 10 });
    for (const [j, name] of SECTIONS.entries()) await db.insert("document_folders", { name, space: "marketing", marketing_role: role, parent_id: root.id, position: (j + 1) * 10 });
  }
  return folders(db);
}

export async function createDocument(db: Db, input: { title: string; kind: ResourceKind; folder_id: string }): Promise<Doc> {
  const title = clean(input.title, 160); if (!title) throw new Error("Donne un titre au document.");
  if (!RESOURCE_KINDS.includes(input.kind)) throw new Error("Type de document inconnu.");
  const folder = await db.get<Folder>("document_folders", input.folder_id);
  if (!folder || folder.space !== "marketing") throw new Error("Dossier introuvable.");
  // Structure vide : le document est créé sans contenu, c'est son auteur qui l'écrit.
  return db.insert<Doc>("documents", { title, kind: input.kind, folder_id: folder.id, space: "marketing", content: "", icon: input.kind === "sop" ? "📋" : input.kind === "template" ? "🧩" : "📄", client_id: null, shared_with_client: false, author_id: db.actor });
}
export async function updateDocument(db: Db, id: string, patch: { title?: string; content?: string; kind?: ResourceKind; folder_id?: string }): Promise<Doc> {
  const doc = await db.get<Doc>("documents", id); if (!doc || doc.space !== "marketing") throw new Error("Document introuvable.");
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) { const t = clean(patch.title, 160); if (!t) throw new Error("Donne un titre au document."); values.title = t; }
  if (patch.content !== undefined) { if (patch.content.length > 400_000) throw new Error("Ce document est trop long."); values.content = patch.content; }
  if (patch.kind !== undefined) { if (!RESOURCE_KINDS.includes(patch.kind)) throw new Error("Type de document inconnu."); values.kind = patch.kind; }
  if (patch.folder_id !== undefined) { const f = await db.get<Folder>("document_folders", patch.folder_id); if (!f || f.space !== "marketing") throw new Error("Dossier introuvable."); values.folder_id = f.id; }
  return Object.keys(values).length ? db.update<Doc>("documents", id, values) : doc;
}
export async function archiveDocument(db: Db, id: string): Promise<void> {
  const doc = await db.get<Doc>("documents", id); if (!doc || doc.space !== "marketing") throw new Error("Document introuvable.");
  await db.update("documents", id, { archived_at: new Date().toISOString() });
}

/* ─────────────────────────── Onboarding ─────────────────────────── */

export async function steps(db: Db): Promise<Step[]> { return db.list<Step>("marketing_onboarding_steps", { order: ["position", "asc"] }); }
export async function progress(db: Db): Promise<Progress[]> { return db.list<Progress>("marketing_onboarding_progress", { order: ["done_at", "asc"] }); }

export async function createStep(db: Db, input: { role: MarketingRole; title: string; description?: string | null; document_id?: string | null }): Promise<Step> {
  const title = clean(input.title, 200); if (!title) throw new Error("Donne un intitulé à l'étape.");
  if (!ROLES.includes(input.role)) throw new Error("Rôle inconnu.");
  const last = (await steps(db)).filter((s) => s.role === input.role).reduce((m, s) => Math.max(m, s.position), 0);
  return db.insert<Step>("marketing_onboarding_steps", { role: input.role, title, description: clean(input.description ?? "", 1000) || null, document_id: input.document_id || null, position: last + 10, created_by: db.actor });
}
export async function updateStep(db: Db, id: string, patch: { title?: string; description?: string | null; document_id?: string | null }): Promise<Step> {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) { const t = clean(patch.title, 200); if (!t) throw new Error("Donne un intitulé à l'étape."); values.title = t; }
  if (patch.description !== undefined) values.description = clean(patch.description ?? "", 1000) || null;
  if (patch.document_id !== undefined) values.document_id = patch.document_id || null;
  return db.update<Step>("marketing_onboarding_steps", id, values);
}
export async function removeStep(db: Db, id: string): Promise<void> { await db.remove("marketing_onboarding_steps", id); }
export async function moveStep(db: Db, id: string, dir: -1 | 1): Promise<void> {
  const all = await steps(db), step = all.find((s) => s.id === id); if (!step) return;
  const same = all.filter((s) => s.role === step.role), i = same.findIndex((s) => s.id === id), j = i + dir;
  if (j < 0 || j >= same.length) return;
  await db.update("marketing_onboarding_steps", same[i].id, { position: same[j].position });
  await db.update("marketing_onboarding_steps", same[j].id, { position: same[i].position });
}
/** Coche ou décoche une étape pour le membre connecté. La progression n'a pas d'identifiant propre : une ligne par (étape, membre). */
export async function setStepDone(db: Db, stepId: string, profileId: string, done: boolean, rows?: Progress[]): Promise<void> {
  const all = rows ?? await progress(db), mine = all.find((p) => p.step_id === stepId && p.profile_id === profileId);
  if (done && !mine) await db.insert("marketing_onboarding_progress", { step_id: stepId, profile_id: profileId, done_at: new Date().toISOString() });
  if (!done && mine) await db.removeWhere("marketing_onboarding_progress", [["eq", "step_id", stepId], ["eq", "profile_id", profileId]]);
}
/** Avancement d'un membre sur les étapes de son rôle. */
export function progressOf(all: Step[], done: Progress[], role: MarketingRole, profileId: string): { done: number; total: number } {
  const mine = all.filter((s) => s.role === role), ids = new Set(done.filter((p) => p.profile_id === profileId).map((p) => p.step_id));
  return { done: mine.filter((s) => ids.has(s.id)).length, total: mine.length };
}
