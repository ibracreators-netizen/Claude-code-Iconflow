"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, memberNames, salesRole } from "@/lib/marketing/crm-server";
import * as crm from "@/lib/marketing/crm";
import { TASK_KIND, type Contact, type Prospect, type TaskKind } from "@/lib/marketing/types";

/* Page Tâches : ajouter, modifier une tâche, et trouver le prospect auquel la rattacher. Terminer passe par closeTaskAction. */

const rev = () => { revalidatePath("/marketing", "layout"); };
const KINDS = Object.keys(TASK_KIND) as TaskKind[];
const due = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Error("Échéance invalide.");
  return new Date(t).toISOString();
};
/** Responsable d'une tâche : un setter ou un closer ne s'attribue qu'à lui-même ; l'agence choisit parmi les membres. */
async function assignee(c: Awaited<ReturnType<typeof crmAction>>, id: string | null | undefined): Promise<string | null> {
  if (salesRole(c.session)) return c.session.user.id;
  if (!id) return null;
  if (!(await memberNames())[id]) throw new Error("Ce membre n'est pas dans l'équipe.");
  return id;
}

export interface TaskProspectHit { id: string; name: string; sub: string | null }

/** Prospects à proposer dans la fenêtre « Ajouter une tâche » : recherche sur le nom, l'email, le téléphone. Sans texte : les plus récents. */
export async function searchTaskProspectsAction(q: string) {
  return run(async (): Promise<TaskProspectHit[]> => {
    const c = await crmAction("marketing_taches");
    const text = String(q ?? "").trim().slice(0, 80);
    const [direct, people] = await Promise.all([
      c.db.list<Prospect>("marketing_prospects", { where: text ? [["search", ["name", "email", "phone", "title"], text]] : [], order: ["created_at", "desc"], limit: 12 }),
      text ? c.db.list<Contact>("marketing_contacts", { where: [["search", ["name", "email", "phone", "company"], text]], limit: 12 }) : Promise.resolve([] as Contact[]),
    ]);
    const viaContact = people.length ? await c.db.list<Prospect>("marketing_prospects", { where: [["in", "contact_id", people.map((p) => p.id)]], order: ["created_at", "desc"], limit: 12 }) : [];
    const prospects = [...new Map([...direct, ...viaContact].map((p) => [p.id, p])).values()].slice(0, 12);
    const missing = [...new Set(prospects.map((p) => p.contact_id).filter((id): id is string => !!id && !people.some((x) => x.id === id)))];
    const contacts = new Map([...people, ...(missing.length ? await c.db.list<Contact>("marketing_contacts", { where: [["in", "id", missing]], limit: missing.length }) : [])].map((x) => [x.id, x]));
    return prospects.map((p) => {
      const ct = p.contact_id ? contacts.get(p.contact_id) : undefined;
      return { id: p.id, name: ct?.name ?? p.name ?? ct?.email ?? p.email ?? "Prospect", sub: [ct?.email ?? p.email, ct?.phone ?? p.phone].filter(Boolean).join(" · ") || null };
    });
  });
}

export async function addTaskAction(input: { prospect_id: string; kind?: TaskKind; title?: string; note?: string; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_taches");
    if (!input.prospect_id) throw new Error("Choisis le prospect de la tâche.");
    const kind: TaskKind = KINDS.includes(input.kind as TaskKind) ? (input.kind as TaskKind) : "autre";
    const task = await crm.createTask(c.db, { prospect_id: input.prospect_id, kind, title: input.title, note: input.note, assignee_id: await assignee(c, input.assignee_id), due_at: due(input.due_at) }, await memberNames());
    rev(); return task;
  });
}

export async function editTaskAction(id: string, patch: { title?: string; note?: string | null; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_taches");
    const clean: Parameters<typeof crm.updateTask>[2] = {};
    if (patch.title !== undefined) clean.title = patch.title;
    if (patch.note !== undefined) clean.note = patch.note;
    if (patch.due_at !== undefined) clean.due_at = due(patch.due_at);
    // Réattribuer une tâche reste à l'agence.
    if (patch.assignee_id !== undefined && !salesRole(c.session)) clean.assignee_id = await assignee(c, patch.assignee_id);
    const task = await crm.updateTask(c.db, id, clean);
    rev(); return task;
  });
}
