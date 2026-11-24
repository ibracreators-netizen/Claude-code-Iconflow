/**
 * Appels de Google Agenda → Prospects. À chaque lecture d'un compte Google, chaque rendez-vous avec un invité
 * extérieur à l'équipe devient un rendez-vous de l'app (source « google »), rattaché au prospect et au contact
 * de l'invité (créés s'ils n'existent pas). Écrit contre `Db`, sans rien côté serveur : vérifiable hors ligne
 * (scripts/google-calls-selfcheck.ts). Mêmes règles que l'ingestion d'iClosed (sources/ingest.ts) :
 *
 *  - Rejouable : un événement = un rendez-vous, repéré par (source « google », identifiant Google). Le même
 *    événement dans les agendas de deux membres ne crée qu'un rendez-vous et qu'un prospect.
 *  - Contact : le premier invité extérieur qui a déjà une fiche (email, sans tenir compte des majuscules) ;
 *    sinon le premier invité extérieur, pour qui une fiche est créée (origine « source », « Google Agenda »).
 *  - Prospect : l'affaire en cours du contact, ou une affaire qui porte cet email ; sinon une nouvelle, en
 *    « Audit réservé ». Une affaire encore à la toute première étape passe en « Audit réservé » ; plus loin,
 *    son étape ne change pas.
 *  - Attribution : le propriétaire de l'agenda devient closer ou setter du rendez-vous selon son rôle d'appel ;
 *    sur le prospect, on ne remplit qu'une attribution vide (jamais d'écrasement).
 *  - Suivi : un événement déplacé met à jour les heures (le résultat saisi reste) ; un événement retiré de
 *    l'agenda (dans la fenêtre lue) annule le rendez-vous, sauf si un autre compte a encore cet événement.
 *    Un rendez-vous déjà annulé (dans l'app ou par une lecture précédente) n'est plus jamais rétabli.
 *  - Réglage « google_calls_to_prospects » (allumé par défaut) : éteint, plus rien n'est créé ; les rendez-vous
 *    déjà importés suivent encore l'agenda (heure, annulation). Rien n'est jamais supprimé.
 */
import type { Db } from "../db";
import { ensureStages, listStages, logEvent, normalizeEmail, openProspect, updateProspect, upsertContact, upsertLead, type ProspectPatch } from "../crm";
import { afterBooking, automationSettings, type AutomationContext } from "../automations";
import type { Appointment, Contact, Member, Prospect, Stage } from "../types";
import { matchAppointment, matchContact, type CalendarEvent, type KnownAppointment } from "./core";

export const GOOGLE_CALLS_SETTING = "google_calls_to_prospects";
export const GOOGLE_SOURCE = "google";
export const GOOGLE_LABEL = "Google Agenda";
export const GOOGLE_CALLS_HELP = "Chaque rendez-vous de l'agenda Google avec un invité extérieur devient un prospect, relié au contact qui a le même e-mail (ou à un nouveau contact).";

const T = { contacts: "marketing_contacts", prospects: "marketing_prospects", appts: "marketing_appointments", events: "marketing_calendar_events" } as const;
type Appt = Appointment & { source?: string; external_id?: string | null; contact_id?: string | null; setter_id?: string | null; closer_id?: string | null; result?: string; title?: string | null };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
const sameTime = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/* ─────────────────────────── Réglage ─────────────────────────── */

/** Valeur lue dans marketing_settings → allumé ou éteint. Allumé tant que l'administrateur ne l'a pas éteint. */
export function readGoogleCallsSetting(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw && typeof raw === "object" && typeof (raw as { enabled?: unknown }).enabled === "boolean") return (raw as { enabled: boolean }).enabled;
  return true;
}
export async function googleCallsEnabled(db: Db): Promise<boolean> { return readGoogleCallsSetting(await db.setting(GOOGLE_CALLS_SETTING)); }

/* ─────────────────────────── Règles pures ─────────────────────────── */

export type CallRole = "closer" | "setter";
/**
 * Rôle d'appel du propriétaire d'un agenda : « closer » ou « setter » (marketing_role, y compris un administrateur
 * qui a choisi un rôle d'appel), sinon aucun. Un compte « marketing » sans rôle précisé est un setter (même règle que la base).
 */
export function ownerCallRole(p: { role?: string | null; marketing_role?: string | null } | null | undefined): CallRole | null {
  if (!p) return null;
  if (p.marketing_role === "closer" || p.marketing_role === "setter") return p.marketing_role;
  return p.role === "marketing" && p.marketing_role !== "media_buyer" ? "setter" : null;
}

/** Étape d'un prospect qui a un rendez-vous : « Audit réservé » si elle existe, sinon la première étape ouverte après la première, sinon la première. */
export function bookedStage(stages: Stage[]): Stage | null {
  const active = stages.filter((s) => s.active !== false).sort((a, b) => a.position - b.position);
  return active.find((s) => s.key === "audit_reserve") ?? active.slice(1).find((s) => s.kind === "ouvert") ?? active[0] ?? null;
}

/** Invités extérieurs à l'équipe (emails valides, en minuscules, dans l'ordre de Google). */
export function externalGuests(ev: Pick<CalendarEvent, "attendees">, team: Set<string>): string[] {
  return [...new Set(ev.attendees.map((a) => normalizeEmail(a)).filter((m): m is string => !!m && !team.has(m)))];
}

/** Événements déjà rapprochés d'un rendez-vous d'un autre outil (iClosed, pris dans l'app) : identifiant Google → rendez-vous. */
export function otherToolMatches(events: CalendarEvent[], contactByEmail: Map<string, string>, team: Set<string>, appointments: KnownAppointment[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) {
    if (out.has(e.google_event_id)) continue;
    const id = matchAppointment(e, matchContact(e, contactByEmail, team), appointments);
    if (id) out.set(e.google_event_id, id);
  }
  return out;
}

export interface GoogleCallLink { appointment_id: string; contact_id: string | null; prospect_id: string }

/**
 * Lignes de marketing_calendar_events d'un compte : mêmes colonnes qu'avant. Un événement importé pointe vers son
 * rendez-vous et son contact : le Tableau de bord et le Calendrier ne l'affichent qu'une fois, avec le lien vers la fiche.
 */
export function calendarRows(account: { id: string; profile_id: string }, events: CalendarEvent[], ctx: { contactByEmail: Map<string, string>; team: Set<string>; matched: Map<string, string>; links: Map<string, GoogleCallLink> }, syncedAt = new Date().toISOString()) {
  return events.map((e) => {
    const other = ctx.matched.get(e.google_event_id), link = other ? undefined : ctx.links.get(e.google_event_id);
    return {
      account_id: account.id, profile_id: account.profile_id, calendar_id: e.calendar_id, calendar_name: e.calendar_name, google_event_id: e.google_event_id, title: e.title,
      starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day, kind: e.kind, attendees: e.attendees,
      contact_id: link?.contact_id ?? matchContact(e, ctx.contactByEmail, ctx.team), appointment_id: other ?? link?.appointment_id ?? null, html_link: e.html_link, synced_at: syncedAt,
    };
  });
}

/* ─────────────────────────── Import ─────────────────────────── */

export interface GoogleCallsInput {
  /** Compte Google lu (marketing_google_accounts.id). */
  accountId: string;
  /** Propriétaire de l'agenda : son rôle d'appel, et s'il a encore accès (un compte retiré ne crée plus rien). */
  owner: { id: string; role: CallRole | null; active?: boolean };
  /** Tous les événements lus pour ce compte (tous agendas choisis). */
  events: CalendarEvent[];
  /** Emails de l'équipe (en minuscules) : ils ne sont jamais pris pour l'invité. */
  teamEmails: Set<string>;
  /** Événements déjà rapprochés d'un rendez-vous d'un autre outil (voir `otherToolMatches`). */
  matched: Map<string, string>;
  /** Agendas effectivement relus cette fois : un événement n'a « disparu » que d'un agenda relu. */
  calendarsRead: string[];
  /** Fenêtre lue chez Google. */
  window: { from: string; to: string };
  /** Équipe (noms dans la chronologie, contexte des automatisations). */
  members?: Member[];
  /** Forcé (vérifications, équipe illisible) ; sinon lu dans les réglages. */
  enabled?: boolean;
  automation?: AutomationContext;
  /** Créations au plus par passage, et heure limite (ms) : le reste est repris au passage suivant. */
  maxCreates?: number;
  deadline?: number;
  now?: Date;
}
export interface GoogleCallStats {
  /** Rendez-vous créés, prospects et contacts créés, rendez-vous rattachés à un prospect existant. */
  created: number; prospects: number; contacts: number; linked: number;
  /** Rendez-vous mis à jour (heure, titre, attribution vide remplie), annulés, et créations remises au passage suivant. */
  updated: number; cancelled: number; deferred: number;
  errors: string[];
}
export const emptyGoogleCallStats = (): GoogleCallStats => ({ created: 0, prospects: 0, contacts: 0, linked: 0, updated: 0, cancelled: 0, deferred: 0, errors: [] });

/** Rendez-vous déjà importés de Google, par identifiant d'événement. */
async function googleAppointments(db: Db, ids: string[]): Promise<Map<string, Appt>> {
  const out = new Map<string, Appt>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (const a of await db.list<Appt>(T.appts, { where: [["eq", "source", GOOGLE_SOURCE], ["in", "external_id", chunk]] })) if (a.external_id && !out.has(a.external_id)) out.set(a.external_id, a);
  }
  return out;
}

/** Remplit l'attribution vide du prospect avec le propriétaire de l'agenda (chronologie « attribution »). */
async function fillProspectRole(db: Db, prospect: Prospect, owner: GoogleCallsInput["owner"], names: Record<string, string>): Promise<Prospect> {
  const patch: ProspectPatch = {};
  if (owner.role === "closer" && !prospect.closer_id) patch.closer_id = owner.id;
  if (owner.role === "setter" && !prospect.setter_id) patch.setter_id = owner.id;
  return Object.keys(patch).length ? (await updateProspect(db, prospect.id, patch, names)).after : prospect;
}

/** Annule un rendez-vous importé : le résultat ne passe à « annulé » que s'il était encore « à venir ». */
async function cancel(db: Db, a: Appt, motif: string, stats: GoogleCallStats): Promise<void> {
  const still = (a.result ?? "a_venir") === "a_venir";
  await db.update(T.appts, a.id, still ? { status: "annule", result: "annule" } : { status: "annule" });
  stats.cancelled++;
  await logEvent(db, a.prospect_id, "rdv_annule", { origine: GOOGLE_LABEL, motif, appointment_id: a.id });
  // Le résultat porté par le prospect suit, s'il n'a pas d'autre rendez-vous confirmé.
  const p = await db.get<Prospect>(T.prospects, a.prospect_id);
  if (still && p?.call_result === "a_venir" && !(await db.list<Appt>(T.appts, { where: [["eq", "prospect_id", p.id], ["eq", "status", "confirme"]], limit: 1 })).length) await db.update(T.prospects, p.id, { call_result: "annule" });
}

/** Un événement déjà importé : il suit l'agenda (heure, titre, lien de visio), et l'attribution vide se remplit. */
async function follow(db: Db, a: Appt, e: CalendarEvent, input: GoogleCallsInput, names: Record<string, string>, stats: GoogleCallStats): Promise<void> {
  const patch: Record<string, unknown> = {};
  const moved = !e.all_day && (!sameTime(a.starts_at, e.starts_at) || !sameTime(a.ends_at, e.ends_at));
  if (moved) { patch.starts_at = e.starts_at; patch.ends_at = e.ends_at; }
  if (e.title && a.title !== e.title) patch.title = e.title;
  if (e.meeting_url && !a.meeting_url) patch.meeting_url = e.meeting_url;
  const role = input.owner.role;
  const fill = (role === "closer" && !a.closer_id) || (role === "setter" && !a.setter_id);
  if (fill) patch[role === "closer" ? "closer_id" : "setter_id"] = input.owner.id;
  if (!Object.keys(patch).length) return;
  await db.update(T.appts, a.id, patch);
  stats.updated++;
  if (moved) await logEvent(db, a.prospect_id, "rdv_pris", { origine: "déplacé dans Google Agenda", appointment_id: a.id, starts_at: e.starts_at });
  if (fill) { const p = await db.get<Prospect>(T.prospects, a.prospect_id); if (p) await fillProspectRole(db, p, input.owner, names); }
}

/** Nouveau rendez-vous : contact et prospect rapprochés (ou créés), rendez-vous rattaché, chronologie. */
async function create(db: Db, e: CalendarEvent, guests: string[], input: GoogleCallsInput, stages: { active: Stage[]; all: Stage[]; closed: Set<string> }, names: Record<string, string>, stats: GoogleCallStats, automation: () => Promise<AutomationContext>): Promise<GoogleCallLink> {
  const setterId = input.owner.role === "setter" ? input.owner.id : null, closerId = input.owner.role === "closer" ? input.owner.id : null;
  const booked = bookedStage(stages.active), first = stages.active[0] ?? null, closedStages = stages.closed;

  // Contact : le premier invité extérieur qui a déjà une fiche, sinon le premier invité extérieur.
  let email = guests[0], contact: Contact | null = null;
  for (const g of guests) { const [c] = await db.list<Contact>(T.contacts, { where: [["ieq", "email", g]], limit: 1 }); if (c) { contact = c; email = g; break; } }
  const name = e.attendee_names?.[email] ?? null;
  let createdContact = false, createdProspect = false;

  // Prospect : l'affaire en cours du contact, sinon une affaire qui porte cet email.
  let prospect = contact ? await openProspect(db, contact.id, stages.all) : null;
  if (!prospect) {
    const sameEmail = await db.list<Prospect>(T.prospects, { where: [["ieq", "email", email]], order: ["created_at", "desc"], limit: 10 });
    if (sameEmail.length && !contact) { const r = await upsertContact(db, { email, name, source: GOOGLE_LABEL }); contact = r.contact; createdContact = r.created; }
    // Une ancienne affaire sans fiche contact est rattachée à la fiche (une personne, une fiche).
    for (const p of sameEmail) if (!p.contact_id && contact) await db.update(T.prospects, p.id, { contact_id: contact.id });
    const open = sameEmail.find((p) => !p.stage_id || !closedStages.has(p.stage_id));
    prospect = open ? ((await db.get<Prospect>(T.prospects, open.id)) ?? open) : null;
  }

  if (!prospect) {
    const res = await upsertLead(db, { contact_id: contact?.id ?? null, email, name, source: GOOGLE_LABEL, stage_key: booked?.key ?? null, setter_id: setterId, closer_id: closerId }, { kind: "source", label: GOOGLE_LABEL });
    contact = res.contact; prospect = res.prospect; createdContact ||= res.createdContact; createdProspect = res.createdProspect;
  } else {
    if (!contact) { const r = await upsertContact(db, { email, name, source: GOOGLE_LABEL }); contact = r.contact; createdContact = r.created; }
    if (!prospect.contact_id) prospect = await db.update<Prospect>(T.prospects, prospect.id, { contact_id: contact.id });
    // Encore à la toute première étape : passage en « Audit réservé ». Plus loin, l'étape ne change pas.
    if (booked && first && booked.id !== first.id && (!prospect.stage_id || prospect.stage_id === first.id)) prospect = (await updateProspect(db, prospect.id, { stage_id: booked.id }, names)).after;
    prospect = await fillProspectRole(db, prospect, input.owner, names);
    stats.linked++;
  }
  if (!prospect.call_result) prospect = await db.update<Prospect>(T.prospects, prospect.id, { call_result: "a_venir" });

  let appt: Appt;
  try {
    appt = await db.insert<Appt>(T.appts, {
      prospect_id: prospect.id, contact_id: contact.id, starts_at: e.starts_at, ends_at: e.ends_at, status: "confirme", result: "a_venir",
      source: GOOGLE_SOURCE, external_id: e.google_event_id, calendar_event_id: e.google_event_id, title: e.title, meeting_url: e.meeting_url ?? null,
      created_by: input.owner.id, setter_id: setterId, closer_id: closerId,
    });
  } catch (err) {
    // Un autre compte vient d'importer le même événement (index unique source + identifiant) : on reprend le sien.
    const [again] = await db.list<Appt>(T.appts, { where: [["eq", "source", GOOGLE_SOURCE], ["eq", "external_id", e.google_event_id]], limit: 1 });
    if (!again) throw err;
    return { appointment_id: again.id, contact_id: again.contact_id ?? contact.id, prospect_id: again.prospect_id };
  }
  stats.created++;
  if (createdContact) stats.contacts++;
  if (createdProspect) stats.prospects++;
  await logEvent(db, prospect.id, "rdv_pris", { origine: "depuis Google Agenda", appointment_id: appt.id, starts_at: e.starts_at });
  // Règle « rendez-vous pris » des automatisations, comme pour iClosed : tâche « À appeler » fermée, rappels si demandés.
  await afterBooking(db, prospect, appt, await automation());
  return { appointment_id: appt.id, contact_id: contact.id, prospect_id: prospect.id };
}

/**
 * Importe les appels d'un compte Google. Une erreur sur un événement n'arrête pas les autres : elle est comptée.
 * Renvoie, pour chaque événement relié à un rendez-vous importé confirmé, ce rendez-vous et son contact
 * (à écrire dans marketing_calendar_events, voir `calendarRows`). À appeler AVANT de remplacer les lignes du compte :
 * les lignes de la lecture précédente servent à repérer les événements retirés de l'agenda.
 */
export async function importGoogleCalls(db: Db, input: GoogleCallsInput): Promise<{ links: Map<string, GoogleCallLink>; stats: GoogleCallStats }> {
  const stats = emptyGoogleCallStats(), links = new Map<string, GoogleCallLink>();
  let enabled = input.enabled;
  if (enabled === undefined) { try { enabled = await googleCallsEnabled(db); } catch (e) { enabled = false; stats.errors.push(`réglage illisible : ${msg(e)}`); } }
  if (input.owner.active === false) enabled = false;
  const names = Object.fromEntries((input.members ?? []).map((m) => [m.id, m.name]));
  let auto = input.automation ?? null;
  const automation = async () => (auto ??= { settings: await automationSettings(db), members: input.members ?? [], effects: { notifyMember: async () => ({ status: "simulee" }), now: () => new Date() } });
  const now = (input.now ?? new Date()).getTime(), deadline = input.deadline ?? Number.POSITIVE_INFINITY, maxCreates = input.maxCreates ?? Number.POSITIVE_INFINITY;

  // Un événement par identifiant (il peut figurer dans deux agendas du même compte). Les appels à venir d'abord, puis les plus récents.
  const byId = new Map<string, CalendarEvent>();
  for (const e of input.events) if (!byId.has(e.google_event_id)) byId.set(e.google_event_id, e);
  const ordered = [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.starts_at), tb = Date.parse(b.starts_at), fa = ta >= now, fb = tb >= now;
    return fa !== fb ? (fa ? -1 : 1) : fa ? ta - tb : tb - ta;
  });
  const known = await googleAppointments(db, [...byId.keys()]);

  let stages: { active: Stage[]; all: Stage[]; closed: Set<string> } | null = null, attempts = 0;
  for (const e of ordered) {
    try {
      const other = input.matched.get(e.google_event_id), found = known.get(e.google_event_id);
      if (other) {
        // Déjà reçu d'un autre outil : celui-là fait foi. Un import Google en double, encore sans résultat, est annulé.
        if (found && found.status === "confirme" && (found.result ?? "a_venir") === "a_venir") await cancel(db, found, "doublon d'un rendez-vous déjà reçu d'un autre outil", stats);
        continue;
      }
      if (found) {
        // Un rendez-vous annulé (dans l'app ou par une lecture précédente) n'est plus rétabli ni relié.
        if (found.status !== "confirme") continue;
        await follow(db, found, e, input, names, stats);
        links.set(e.google_event_id, { appointment_id: found.id, contact_id: found.contact_id ?? null, prospect_id: found.prospect_id });
        continue;
      }
      if (!enabled || e.all_day) continue;
      const guests = externalGuests(e, input.teamEmails);
      if (!guests.length) continue;   // entre membres de l'équipe : pas un prospect
      if (attempts >= maxCreates || Date.now() >= deadline) { stats.deferred++; continue; }
      attempts++;
      if (!stages) { const active = await ensureStages(db), all = await listStages(db, { includeInactive: true }); stages = { active, all, closed: new Set(all.filter((s) => s.kind !== "ouvert").map((s) => s.id)) }; }
      links.set(e.google_event_id, await create(db, e, guests, input, stages, names, stats, automation));
    } catch (err) {
      stats.errors.push(`événement ${e.google_event_id.slice(0, 16)} : ${msg(err)}`);
    }
  }

  // Événements retirés de l'agenda du propriétaire, dans la fenêtre lue et dans un agenda relu.
  // (Tri explicite : marketing_calendar_events n'a pas de colonne created_at, le tri par défaut de SupabaseDb.)
  try {
    const from = Date.parse(input.window.from), to = Date.parse(input.window.to), read = new Set(input.calendarsRead);
    const before = await db.list<{ google_event_id: string; calendar_id: string; starts_at: string }>(T.events, { where: [["eq", "account_id", input.accountId]], columns: "google_event_id,calendar_id,starts_at", order: ["starts_at", "asc"], limit: 5000 });
    const gone = [...new Set(before.filter((r) => !byId.has(r.google_event_id) && read.has(r.calendar_id) && Date.parse(r.starts_at) >= from && Date.parse(r.starts_at) < to).map((r) => r.google_event_id))];
    const appts = gone.length ? await googleAppointments(db, gone) : new Map<string, Appt>();
    for (const id of gone) {
      const a = appts.get(id);
      if (!a || a.status !== "confirme") continue;
      try {
        const [elsewhere] = await db.list<{ id: string }>(T.events, { where: [["eq", "google_event_id", id], ["neq", "account_id", input.accountId]], columns: "id", order: ["starts_at", "asc"], limit: 1 });
        if (!elsewhere) await cancel(db, a, "événement retiré de l'agenda Google", stats);
      } catch (err) { stats.errors.push(`annulation ${id.slice(0, 16)} : ${msg(err)}`); }
    }
  } catch (err) { stats.errors.push(`événements retirés : ${msg(err)}`); }
  return { links, stats };
}
