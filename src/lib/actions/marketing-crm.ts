"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, memberNames, salesRole, type Crm } from "@/lib/marketing/crm-server";
import * as crm from "@/lib/marketing/crm";
import { afterProspectChange } from "@/lib/marketing/automations";
import type { StageKind, TaskKind } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing", "layout"); };
/** Un setter ou un closer ne crée un prospect que pour lui-même. */
const ownership = (c: Crm): { setter_id?: string; closer_id?: string } => { const r = salesRole(c.session); return r === "setter" ? { setter_id: c.session.user.id } : r === "closer" ? { closer_id: c.session.user.id } : {}; };
/** Doublon refusé par la base alors que la fiche n'est pas visible : elle appartient à un autre membre. */
const friendly = (e: unknown): never => { const m = String((e as { message?: string })?.message ?? e); if (/23505|duplicate key/i.test(m)) throw new Error("Ce contact existe déjà et ne t'est pas attribué. Demande à un administrateur de te l'attribuer."); throw e; };

/* ─── Contacts ─── */
export async function createContactAction(input: crm.ContactInput & { withProspect?: boolean }) {
  return run(async () => {
    const c = await crmAction("marketing_contacts");
    if (input.withProspect || salesRole(c.session)) { const r = await crm.upsertLead(c.db, { ...input, ...ownership(c), source: input.source ?? "manuel" }, { kind: "cree", label: "Saisie à la main" }).catch(friendly); rev(); return { contactId: r.contact.id, prospectId: r.prospect.id, created: r.createdContact }; }
    const r = await crm.upsertContact(c.db, { ...input, source: input.source ?? "manuel" }); rev(); return { contactId: r.contact.id, prospectId: null, created: r.created };
  });
}
export async function updateContactAction(id: string, patch: crm.ContactInput) {
  return run(async () => { const c = await crmAction("marketing_contacts"); const out = await crm.updateContact(c.db, id, patch); rev(); return out; });
}

/* ─── Prospects ─── */
export async function createProspectAction(input: crm.LeadInput) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    const r = await crm.upsertLead(c.db, { ...input, ...ownership(c), source: input.source ?? "manuel" }, { kind: "cree", label: "Saisie à la main" }).catch(friendly);
    rev(); return { prospectId: r.prospect.id, contactId: r.contact.id, createdProspect: r.createdProspect };
  });
}
export async function updateProspectAction(id: string, patch: crm.ProspectPatch) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    // Attribuer un prospect est réservé à l'administrateur et aux membres agence (la base le refuse aussi à un commercial).
    if (salesRole(c.session)) { delete patch.setter_id; delete patch.closer_id; }
    const { before, after } = await crm.updateProspect(c.db, id, patch, await memberNames());
    await afterProspectChange(c.db, before, after);
    rev(); return after;
  });
}

/* ─── Tâches ─── */
export async function createTaskAction(input: { prospect_id: string; kind?: TaskKind; title?: string; note?: string; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => { const c = await crmAction("marketing_taches"); const t = await crm.createTask(c.db, input, await memberNames()); rev(); return t; });
}
export async function updateTaskAction(id: string, patch: { title?: string; note?: string | null; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => { const c = await crmAction("marketing_taches"); const t = await crm.updateTask(c.db, id, patch); rev(); return t; });
}
export async function closeTaskAction(id: string, status: "faite" | "annulee" | "ouverte") {
  return run(async () => { const c = await crmAction("marketing_taches"); const t = await crm.closeTask(c.db, id, status); rev(); return t; });
}

/* ─── Étapes du pipeline (Réglages) ─── */
export async function createStageAction(input: { name: string; kind?: StageKind }) {
  return run(async () => { const c = await crmAction("marketing_reglages"); const s = await crm.createStage(c.db, input); rev(); return s; });
}
export async function updateStageAction(id: string, patch: { name?: string; active?: boolean }) {
  return run(async () => { const c = await crmAction("marketing_reglages"); const s = await crm.updateStage(c.db, id, patch); rev(); return s; });
}
export async function reorderStagesAction(ids: string[]) {
  return run(async () => { const c = await crmAction("marketing_reglages"); await crm.reorderStages(c.db, ids); rev(); });
}
