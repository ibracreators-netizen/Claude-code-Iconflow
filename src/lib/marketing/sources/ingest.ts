/**
 * Applique à nos données ce qu'une source externe nous apprend. Écrit contre `Db`, donc vérifiable
 * hors ligne (scripts/sources-selfcheck.ts). Rejouable : appliquer deux fois la même information ne
 * crée ni doublon de contact, ni doublon de rendez-vous, ni seconde tâche.
 *
 *  Cas 1 — rendez-vous : le prospect passe en « Audit réservé », le rendez-vous lui est rattaché,
 *          sa tâche « À appeler » se ferme.
 *  Cas 2 — contact sans rendez-vous : prospect en « Nouveau lead », avec une tâche « À appeler ».
 */
import type { Db } from "../db";
import { closeOpenTasks, ensureTask, listStages, logEvent, moveToStage, normalizeEmail, updateProspect, upsertLead, type LeadResult } from "../crm";
import type { Appointment, Member, Prospect, Stage } from "../types";
import type { SourceBooking, SourceContact, SourceLead } from "./types";

interface Ref { id: string; entity_id: string }
export interface IngestContext { source: string; label: string; members: Member[] }
export interface IngestStats { bookings: number; created: number; updated: number; cancelled: number; leads: number; tasks: number; contacts: number; errors: string[] }
export const emptyStats = (): IngestStats => ({ bookings: 0, created: 0, updated: 0, cancelled: 0, leads: 0, tasks: 0, contacts: 0, errors: [] });

type Appt = Appointment & { source?: string; external_id?: string | null; contact_id?: string | null; setter_id?: string | null; closer_id?: string | null; result?: string; title?: string | null };

async function refOf(db: Db, source: string, entity: string, externalId: string): Promise<string | null> {
  const [r] = await db.list<Ref>("marketing_external_refs", { where: [["eq", "source", source], ["eq", "entity", entity], ["eq", "external_id", externalId]], limit: 1 });
  return r?.entity_id ?? null;
}
async function saveRef(db: Db, source: string, entity: string, externalId: string, entityId: string) {
  try { await db.insert("marketing_external_refs", { source, entity, external_id: externalId, entity_id: entityId }); } catch { /* déjà connue */ }
}
const memberFor = (ctx: IngestContext, who: { email?: string | null; name?: string | null } | null | undefined): string | null => {
  if (!who) return null;
  const email = normalizeEmail(who.email), name = (who.name ?? "").trim().toLowerCase();
  return (email ? ctx.members.find((m) => (m.email ?? "").toLowerCase() === email) : undefined)?.id ?? (name ? ctx.members.find((m) => m.name.trim().toLowerCase() === name) : undefined)?.id ?? null;
};

/** Rapproche (ou crée) le contact et son affaire en cours. `known` : faux si la source nous le présente pour la première fois. */
async function lead(db: Db, ctx: IngestContext, c: SourceContact, extra: { stage_key?: string; setter_id?: string | null; closer_id?: string | null } = {}): Promise<LeadResult & { known: boolean }> {
  const contactId = c.external_id ? await refOf(db, ctx.source, "contact", c.external_id) : null;
  const res = await upsertLead(db, {
    contact_id: contactId, email: c.email, phone: c.phone, name: c.name, tags: c.tags, source: ctx.label, utm: c.utm ?? null,
    created_at: null, stage_key: extra.stage_key, setter_id: extra.setter_id ?? null, closer_id: extra.closer_id ?? null,
  }, { kind: "source", label: ctx.label });
  if (c.external_id && !contactId) await saveRef(db, ctx.source, "contact", c.external_id, res.contact.id);
  return { ...res, known: !!contactId || (!c.external_id && !res.createdProspect) };
}
const stageOf = (stages: Stage[], p: Prospect) => stages.find((s) => s.id === p.stage_id) ?? null;

/** Cas 1 : un rendez-vous de la source. */
export async function applyBooking(db: Db, ctx: IngestContext, b: SourceBooking, stats: IngestStats = emptyStats()): Promise<IngestStats> {
  stats.bookings++;
  const closerId = memberFor(ctx, b.closer), setterId = memberFor(ctx, b.setter);
  const [existing] = await db.list<Appt>("marketing_appointments", { where: [["eq", "source", ctx.source], ["eq", "external_id", b.external_id]], limit: 1 });
  const status = b.cancelled ? "annule" : "confirme";
  const result = b.cancelled ? "annule" : b.result;

  let prospectId: string;
  if (existing) {
    prospectId = existing.prospect_id;
    const moved = existing.starts_at !== b.starts_at;
    const patch: Record<string, unknown> = {};
    if (moved) { patch.starts_at = b.starts_at; patch.ends_at = b.ends_at; }
    if (existing.status !== status) patch.status = status;
    if ((existing.result ?? "a_venir") !== result) patch.result = result;
    if (closerId && existing.closer_id !== closerId) patch.closer_id = closerId;
    if (setterId && existing.setter_id !== setterId) patch.setter_id = setterId;
    if (b.title && existing.title !== b.title) patch.title = b.title;
    if (b.meeting_url && existing.meeting_url !== b.meeting_url) patch.meeting_url = b.meeting_url;
    if (Object.keys(patch).length) {
      await db.update("marketing_appointments", existing.id, patch);
      stats.updated++;
      if (patch.status === "annule") { stats.cancelled++; await logEvent(db, prospectId, "rdv_annule", { origine: ctx.label, appointment_id: existing.id }); }
      else if (moved) await logEvent(db, prospectId, "rdv_pris", { origine: `${ctx.label} (déplacé)`, appointment_id: existing.id, starts_at: b.starts_at });
    }
  } else {
    const l = await lead(db, ctx, b.contact, { setter_id: setterId, closer_id: closerId });
    if (l.createdContact) stats.contacts++;
    prospectId = l.prospect.id;
    const appt = await db.insert<Appt>("marketing_appointments", {
      prospect_id: prospectId, contact_id: l.contact.id, starts_at: b.starts_at, ends_at: b.ends_at, status, result, source: ctx.source, external_id: b.external_id,
      setter_id: setterId, closer_id: closerId, title: b.title ?? null, meeting_url: b.meeting_url ?? null,
    });
    stats.created++;
    await logEvent(db, prospectId, b.cancelled ? "rdv_annule" : "rdv_pris", { origine: ctx.label, appointment_id: appt.id, starts_at: b.starts_at });
    if (b.cancelled) stats.cancelled++;
  }

  // Le prospect suit le rendez-vous.
  const prospect = await db.get<Prospect>("marketing_prospects", prospectId);
  if (!prospect) return stats;
  const stages = await listStages(db, { includeInactive: true });
  const key = stageOf(stages, prospect)?.key ?? null;
  if (!b.cancelled) {
    if (key === "nouveau_lead" || key === null) await moveToStage(db, prospectId, "audit_reserve");
    await closeOpenTasks(db, prospectId, "a_appeler");
  }
  const patch: Parameters<typeof updateProspect>[2] = {};
  if (!prospect.closer_id && closerId) patch.closer_id = closerId;
  if (!prospect.setter_id && setterId) patch.setter_id = setterId;
  // L'outil de réservation est la source du résultat d'appel : ce qu'il dit remplace la saisie faite ici.
  if (result !== "a_venir" && prospect.call_result !== result) patch.call_result = result;
  if (result === "a_venir" && !prospect.call_result) patch.call_result = "a_venir";
  if (b.outcome && prospect.outcome !== b.outcome) patch.outcome = b.outcome;
  if (b.amount != null && b.outcome === "signe" && prospect.signed_amount == null) patch.signed_amount = b.amount;
  if (b.note && !prospect.call_note) patch.call_note = b.note;
  if (Object.keys(patch).length) await updateProspect(db, prospectId, patch, Object.fromEntries(ctx.members.map((m) => [m.id, m.name])));
  if (result === "present" && (key === "audit_reserve" || key === "nouveau_lead" || key === null)) await moveToStage(db, prospectId, "audit_effectue");
  return stats;
}

/** Cas 2 : un contact qui n'a pas pris de rendez-vous. */
export async function applyLead(db: Db, ctx: IngestContext, l: SourceLead, stats: IngestStats = emptyStats()): Promise<IngestStats> {
  stats.leads++;
  const tags = [...(l.contact.tags ?? []), ...(l.tag ? [l.tag] : [])];
  const res = await lead(db, ctx, { ...l.contact, tags });
  if (res.createdContact) stats.contacts++;
  // La tâche n'est créée qu'à la première rencontre : si le setter l'a terminée, un nouveau passage ne la recrée pas.
  if (res.known || !l.callable) return stats;
  const stages = await listStages(db, { includeInactive: true });
  if ((stageOf(stages, res.prospect)?.key ?? "nouveau_lead") !== "nouveau_lead") return stats;
  const appts = await db.list<Appt>("marketing_appointments", { where: [["eq", "prospect_id", res.prospect.id], ["eq", "status", "confirme"]], limit: 1 });
  if (appts.length) return stats;
  const { created } = await ensureTask(db, { prospect_id: res.prospect.id, kind: "a_appeler", assignee_id: res.prospect.setter_id ?? null, due_at: new Date().toISOString(), origin: "source", note: `Contact reçu de ${ctx.label} sans rendez-vous.` }, Object.fromEntries(ctx.members.map((m) => [m.id, m.name])));
  if (created) stats.tasks++;
  return stats;
}

/** Applique un lot. Une ligne en échec n'arrête pas les autres : elle est comptée et sera reprise au passage suivant. */
export async function applyAll(db: Db, ctx: IngestContext, bookings: SourceBooking[], leads: SourceLead[]): Promise<IngestStats> {
  const stats = emptyStats();
  // Les rendez-vous d'abord : un contact qui a un rendez-vous ne doit pas recevoir de tâche « À appeler ».
  for (const b of bookings) { try { await applyBooking(db, ctx, b, stats); } catch (e) { stats.errors.push(`rendez-vous ${b.external_id} : ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`); } }
  const booked = new Set(bookings.map((b) => b.contact.external_id).filter(Boolean));
  for (const l of leads) {
    if (l.contact.external_id && booked.has(l.contact.external_id)) continue;
    try { await applyLead(db, ctx, l, stats); } catch (e) { stats.errors.push(`contact ${l.contact.external_id ?? l.contact.email ?? "?"} : ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`); }
  }
  return stats;
}
