"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, memberNames, salesRole, taskAssignee, type Crm } from "@/lib/marketing/crm-server";
import * as crm from "@/lib/marketing/crm";
import { afterProspectChange } from "@/lib/marketing/automations";
import { automationContext } from "@/lib/marketing/automations-server";
import { isAdmin, systemDb } from "@/lib/marketing/crm-server";
import { sendLeadEmail } from "@/lib/marketing/lead-email";
import { googleCallsOfProspect, ignoreGoogleCalls } from "@/lib/marketing/google/calls-to-prospects";
import { KPI_FIELDS, kpiValueError, mergeKpiMetrics, type EmailTemplate, type KpiEntry, type StageKind, type TaskKind } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing", "layout"); };
/** Un setter ou un closer ne crée un prospect que pour lui-même. */
const ownership = (c: Crm): { setter_id?: string; closer_id?: string } => { const r = salesRole(c.session); return r === "setter" ? { setter_id: c.session.user.id } : r === "closer" ? { closer_id: c.session.user.id } : {}; };
/**
 * Ce que l'on enregistre d'une saisie : pour un commercial, le setter et le closer envoyés par le navigateur sont
 * ignorés (il ne peut attribuer personne, ni à la création ni en complétant une affaire existante) ; seul lui-même est posé.
 */
const owned = <T extends object>(c: Crm, input: T): T & { setter_id?: string | null; closer_id?: string | null } => (salesRole(c.session) ? { ...input, setter_id: undefined, closer_id: undefined, ...ownership(c) } : input);
/** Doublon refusé par la base alors que la fiche n'est pas visible : elle appartient à un autre membre. */
const friendly = (e: unknown): never => { const m = String((e as { message?: string })?.message ?? e); if (/23505|duplicate key/i.test(m)) throw new Error("Ce contact existe déjà et ne t'est pas attribué. Demande à un administrateur de te l'attribuer."); throw e; };

/* ─── Contacts ─── */
export async function createContactAction(input: crm.ContactInput & { withProspect?: boolean }) {
  return run(async () => {
    const c = await crmAction("marketing_contacts");
    if (input.withProspect || salesRole(c.session)) { const r = await crm.upsertLead(c.db, { ...owned(c, input), source: input.source ?? "manuel" }, { kind: "cree", label: "Saisie à la main" }).catch(friendly); rev(); return { contactId: r.contact.id, prospectId: r.prospect.id, created: r.createdContact }; }
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
    const r = await crm.upsertLead(c.db, { ...owned(c, input), source: input.source ?? "manuel" }, { kind: "cree", label: "Saisie à la main" }).catch(friendly);
    rev(); return { prospectId: r.prospect.id, contactId: r.contact.id, createdProspect: r.createdProspect };
  });
}
export async function updateProspectAction(id: string, patch: crm.ProspectPatch) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    // Attribuer un prospect est réservé à l'administrateur et aux membres agence. C'est l'application qui l'empêche :
    // la base ne bloque pas encore un commercial qui change setter_id ou closer_id sur ses propres prospects.
    if (salesRole(c.session)) { delete patch.setter_id; delete patch.closer_id; }
    const { before, after } = await crm.updateProspect(c.db, id, patch, await memberNames());
    // Les automatisations s'exécutent au nom du système (journal, proposition de client), pas du membre connecté.
    const sys = systemDb();
    if (sys) await afterProspectChange(sys, before, after, await automationContext(sys)).catch((e) => console.error("[automatisations]", e instanceof Error ? e.message : e));
    rev(); return after;
  });
}

/** Plusieurs prospects d'un coup (liste du CRM) : étape, setter ou closer. Réservé aux membres qui peuvent attribuer. */
export async function bulkUpdateProspectsAction(ids: string[], patch: { stage_id?: string; setter_id?: string | null; closer_id?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    if (salesRole(c.session)) throw new Error("Les actions groupées sont réservées à l'administrateur et aux membres de l'agence.");
    const list = [...new Set(ids)].slice(0, 200);
    if (!list.length) throw new Error("Sélectionne au moins un prospect.");
    const clean: crm.ProspectPatch = {};
    if (patch.stage_id) clean.stage_id = patch.stage_id;
    if (patch.setter_id !== undefined) clean.setter_id = patch.setter_id;
    if (patch.closer_id !== undefined) clean.closer_id = patch.closer_id;
    if (!Object.keys(clean).length) throw new Error("Choisis ce qu'il faut changer.");
    const names = await memberNames(), sys = systemDb(), ctx = sys ? await automationContext(sys) : null;
    let done = 0;
    for (const id of list) {
      const { before, after } = await crm.updateProspect(c.db, id, clean, names);
      if (sys && ctx) await afterProspectChange(sys, before, after, ctx).catch(() => undefined);
      done++;
    }
    rev(); return { done };
  });
}
/**
 * Supprime un ou plusieurs leads, définitivement. Réservé à l'administrateur et aux membres de l'agence :
 * un setter ou un closer passe un lead en « Perdu », il ne l'efface pas.
 */
export async function deleteProspectsAction(ids: string[]) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    if (salesRole(c.session)) throw new Error("Supprimer un lead est réservé à l'administrateur et aux membres de l'agence. Passe-le en « Perdu ».");
    const list = [...new Set(ids)].slice(0, 200);
    if (!list.length) throw new Error("Sélectionne au moins un lead.");
    const sys = systemDb();
    let done = 0;
    const ignored = { events: [] as string[], emails: [] as string[] };
    for (const id of list) {
      // Appels venus de l'agenda Google : retenus AVANT la suppression (les rendez-vous partent avec le lead).
      const google = await googleCallsOfProspect(c.db, id).catch(() => null);
      const { contactDeleted } = await crm.deleteProspect(c.db, id);
      // Le lien avec l'outil de réservation ou l'import est retiré : s'il revient de la source, il sera recréé proprement.
      if (sys) await sys.removeWhere("marketing_external_refs", [["eq", "entity_id", id]]).catch(() => undefined);
      // Supprimé par l'administrateur : ses appels Google ne reviennent pas au passage suivant. L'email n'est écarté
      // que si la fiche contact est partie avec lui (une personne qui garde une autre affaire n'est pas écartée).
      if (google) { ignored.events.push(...google.events); if (contactDeleted) ignored.emails.push(...google.emails); }
      done++;
    }
    if (ignored.events.length) await ignoreGoogleCalls(sys ?? c.db, ignored).catch((e) => console.error("[google] appels écartés :", e instanceof Error ? e.message : e));
    rev(); return { done };
  });
}
/** Note libre dans la chronologie. */
export async function addNoteAction(prospectId: string, text: string) {
  return run(async () => { const c = await crmAction("marketing_prospects"); await crm.addNote(c.db, prospectId, text); rev(); });
}
/** Email à un prospect depuis sa fiche : envoyé au nom du membre, écrit dans la chronologie. */
export async function sendLeadEmailAction(prospectId: string, input: { subject: string; body: string }) {
  return run(async () => { const c = await crmAction("marketing_prospects"); const res = await sendLeadEmail(c, prospectId, input); rev(); return res; });
}
/** Emails types du CRM (objet + message), partagés par l'équipe. Écrits par l'administrateur. */
export async function saveEmailTemplatesAction(templates: EmailTemplate[]) {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    if (!isAdmin(c.session)) throw new Error("Les emails types sont gérés par l'administrateur.");
    const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").trim().slice(0, max);
    const clean = (Array.isArray(templates) ? templates : []).slice(0, 30).map((t, i) => ({ id: text(t.id, 40) || `modele-${i + 1}`, name: text(t.name, 80), subject: text(t.subject, 200), body: text(t.body, 8000) })).filter((t) => t.name && t.body);
    await c.db.saveSetting("email_templates", clean);
    rev(); return clean;
  });
}

/* ─── Suivi quotidien (KPI) ─── */
export async function saveKpiEntryAction(input: { day: string; metrics: Record<string, number>; note?: string | null; profileId?: string }) {
  return run(async () => {
    const c = await crmAction("marketing_classement");
    const me = c.session.user.id, target = input.profileId && input.profileId !== me ? input.profileId : me;
    if (target !== me && salesRole(c.session)) throw new Error("Tu ne peux saisir que ton propre suivi.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || input.day > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) throw new Error("Date invalide.");
    // Même règle que le lien personnel (kpiValueError) : un indicateur connu, un entier de 0 à 10 000 ou un montant en
    // euros entiers de 0 à 1 000 000. Au-delà, la saisie est refusée avec un message clair (rien n'est raboté).
    const allowed = new Map([...KPI_FIELDS.setter, ...KPI_FIELDS.closer].map((f) => [f.key, f]));
    const sent: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.metrics ?? {})) {
      const field = allowed.get(k);
      if (!field) throw new Error("Un indicateur inconnu a été envoyé. Recharge la page.");
      const error = kpiValueError(field, v);
      if (error) throw new Error(error);
      sent[k] = v as number;
    }
    const note = (input.note ?? "").trim().slice(0, 1000) || null;
    const [existing] = await c.db.list<KpiEntry>("marketing_kpi_entries", { where: [["eq", "profile_id", target], ["eq", "day", input.day]], limit: 1 });
    // Le formulaire n'envoie que les champs du rôle d'appel affiché : les chiffres de l'autre rôle déjà saisis ce
    // jour-là sont gardés (changement de rôle, correction d'un ancien jour) ; une case envoyée à 0 est retirée.
    const metrics = mergeKpiMetrics(existing?.metrics, sent);
    const row = existing
      ? await c.db.update<KpiEntry>("marketing_kpi_entries", existing.id, { metrics, note, updated_at: new Date().toISOString() })
      : await c.db.insert<KpiEntry>("marketing_kpi_entries", { profile_id: target, day: input.day, metrics, note });
    rev(); return row;
  });
}

/* ─── Tâches ─── */
/** Un setter ou un closer ne crée une tâche que pour lui-même ; l'agence choisit un membre de l'équipe. */
export async function createTaskAction(input: { prospect_id: string; kind?: TaskKind; title?: string; note?: string; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_taches");
    const t = await crm.createTask(c.db, { prospect_id: input.prospect_id, kind: input.kind, title: input.title, note: input.note, due_at: input.due_at, assignee_id: await taskAssignee(c, input.assignee_id) }, await memberNames());
    rev(); return t;
  });
}
/** Réattribuer une tâche reste à l'agence : le responsable envoyé par un commercial est ignoré. */
export async function updateTaskAction(id: string, patch: { title?: string; note?: string | null; assignee_id?: string | null; due_at?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_taches");
    const clean: Parameters<typeof crm.updateTask>[2] = { title: patch.title, note: patch.note, due_at: patch.due_at };
    if (patch.assignee_id !== undefined && !salesRole(c.session)) clean.assignee_id = await taskAssignee(c, patch.assignee_id);
    const t = await crm.updateTask(c.db, id, clean); rev(); return t;
  });
}
export async function closeTaskAction(id: string, status: "faite" | "annulee" | "ouverte") {
  return run(async () => { const c = await crmAction("marketing_taches"); const t = await crm.closeTask(c.db, id, status); rev(); return t; });
}

/* ─── Étapes du pipeline (Réglages) ─── */
export async function createStageAction(input: { name: string; kind?: StageKind }) {
  return run(async () => { const c = await crmAction("marketing_reglages"); const s = await crm.createStage(c.db, input); rev(); return s; });
}
export async function updateStageAction(id: string, patch: { name?: string; active?: boolean; color?: string | null }) {
  return run(async () => { const c = await crmAction("marketing_reglages"); const s = await crm.updateStage(c.db, id, patch); rev(); return s; });
}
export async function reorderStagesAction(ids: string[]) {
  return run(async () => { const c = await crmAction("marketing_reglages"); await crm.reorderStages(c.db, ids); rev(); });
}
