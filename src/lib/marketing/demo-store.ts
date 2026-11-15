import "server-only";
import { StoreError, type Session } from "@/lib/data/store";
import { computeSlots, type Slot } from "./slots";
import { buildDashboard } from "./aggregate";
import type { MarketingStore, NewProspect } from "./store";
import {
  DEFAULT_MARKETING_SETTINGS, type Appointment, type InboxCounts, type InboxOverview, type InboxRow, type InboxStatus, type MarketingCounts,
  type MarketingDashboard, type MarketingSettings, type Prospect, type ProspectEvent, type ProspectEventKind, type ProspectStatus, type ScheduledEmail, type SchedulerBeat,
} from "./types";
import type { InboxRepo } from "./inbox-core";

interface MDB { settings: MarketingSettings; prospects: Prospect[]; appointments: Appointment[]; emails: ScheduledEmail[]; events: ProspectEvent[]; inbox: InboxRow[]; beat: SchedulerBeat | null }
const g = globalThis as unknown as { __iconflowMktDemo?: MDB };
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const iso = (d: Date) => d.toISOString();

/**
 * Sans base reliée, l'espace démarre VIDE : aucun prospect, rendez-vous ni email fictif.
 * Ce qui est créé à la main pendant la session vit en mémoire et disparaît au redémarrage.
 */
function seed(): MDB {
  return { settings: { ...DEFAULT_MARKETING_SETTINGS }, prospects: [], appointments: [], emails: [], events: [], inbox: [], beat: null };
}
function db(): MDB { if (!g.__iconflowMktDemo) g.__iconflowMktDemo = seed(); return g.__iconflowMktDemo; }
export function resetMarketingDemo() { g.__iconflowMktDemo = undefined; }

/* ─── Boîte de réception en mémoire (même circuit qu'en production, sans base) ─── */
const STUCK_MS = 5 * 60_000;
export const demoSettings = () => db().settings;
export const demoInboxRows = () => db().inbox;
export const demoBeat = () => db().beat;
export function demoSetBeat(beat: SchedulerBeat) { db().beat = beat; }
export function demoInboxCounts(): InboxCounts {
  const rows = db().inbox, n = (st: InboxStatus) => rows.filter((r) => r.status === st).length;
  const before = iso(new Date(Date.now() - STUCK_MS));
  return { recu: n("recu"), traite: n("traite"), erreur: n("erreur"), suspect: n("suspect"), stuck: rows.filter((r) => r.status === "recu" && r.received_at < before).length };
}
export function demoAddTestLead(payload: Record<string, unknown>): string {
  const now = iso(new Date()), id = uid("li");
  db().inbox.unshift({ id, request_id: `test-${id}`, site: String(payload.site ?? "test-interne"), landing_page: String(payload.landing_page ?? ""), page: String(payload.page ?? ""), referrer: null,
    utm: (payload.utm as Record<string, string>) ?? {}, payload, received_at: now, status: "recu", error: null, attempts: 0, processed_at: null, prospect_id: null, is_test: true, alert_status: null, alert_error: null, updated_at: now });
  return id;
}
export function demoInboxRepo(): InboxRepo {
  return {
    async upsertProspect(lead, receivedAt) {
      const d = db(), existing = d.prospects.find((p) => (p.email ?? "").toLowerCase() === lead.email);
      if (existing) {
        Object.assign(existing, { opted_in_at: existing.opted_in_at ?? receivedAt, name: existing.name ?? lead.name, phone: existing.phone ?? lead.phone, marque: existing.marque ?? lead.marque, utm: existing.utm ?? lead.utm,
          site: existing.site ?? lead.site, landing_page: existing.landing_page ?? lead.landing_page, referrer: existing.referrer ?? lead.referrer, updated_at: iso(new Date()) });
        return { id: existing.id, created: false };
      }
      const now = iso(new Date());
      const p: Prospect = { id: uid("mp"), name: lead.name, email: lead.email, phone: lead.phone, source: lead.source ?? "optin", marque: lead.marque, utm: lead.utm, site: lead.site, landing_page: lead.landing_page, referrer: lead.referrer,
        status: "nouveau", opted_in_at: receivedAt, notes: null, besoin: null, budget: null, next_action_at: null, next_action_note: null, unsubscribed_at: null, created_by: null, created_at: now, updated_at: now };
      d.prospects.unshift(p);
      d.events.push({ id: uid("mev"), prospect_id: p.id, kind: "cree", data: { source: p.source }, created_by: null, created_at: now }, { id: uid("mev"), prospect_id: p.id, kind: "opt_in", data: { source: p.source, landing_page: lead.landing_page }, created_by: null, created_at: now });
      return { id: p.id, created: true };
    },
    async mark(id, patch) { const r = db().inbox.find((x) => x.id === id); if (r) Object.assign(r, patch, { updated_at: iso(new Date()) }); },
    // Sans base reliée, aucun service d'envoi : l'alerte est toujours simulée (ou sans destinataire).
    async notify() { return { status: db().settings.alert_emails.length ? "simulee" : "aucun_destinataire" }; },
  };
}

export class DemoMarketing implements MarketingStore {
  readonly demo = true;
  constructor(public readonly session: Session) {}
  private log(prospectId: string, kind: ProspectEventKind, data: Record<string, unknown> = {}) {
    db().events.push({ id: uid("mev"), prospect_id: prospectId, kind, data, created_by: this.session.user.id, created_at: iso(new Date()) });
  }
  async settings() { return db().settings; }
  async saveSettings(patch: Partial<MarketingSettings>) { db().settings = { ...db().settings, ...patch }; return db().settings; }
  async counts(): Promise<MarketingCounts> {
    const c = demoInboxCounts();
    return { prospects: db().prospects.length, appointments: db().appointments.filter((a) => a.status === "confirme").length, emailsPending: db().emails.filter((e) => e.status === "pending").length, inboxAttention: c.erreur + c.suspect + c.stuck };
  }
  async inboxOverview(opts?: { status?: InboxStatus; limit?: number }): Promise<InboxOverview> {
    const rows = [...db().inbox].sort((a, b) => b.received_at.localeCompare(a.received_at)).filter((r) => !opts?.status || r.status === opts.status).slice(0, opts?.limit ?? 200);
    return { available: true, rows, counts: demoInboxCounts() };
  }
  async prospects(opts?: { status?: ProspectStatus; q?: string }) {
    let rows = [...db().prospects].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (opts?.status) rows = rows.filter((p) => p.status === opts.status);
    if (opts?.q) { const t = opts.q.toLowerCase(); rows = rows.filter((p) => (p.name ?? "").toLowerCase().includes(t) || (p.email ?? "").toLowerCase().includes(t)); }
    return rows;
  }
  async prospect(id: string) { return db().prospects.find((p) => p.id === id) ?? null; }
  async createProspect(input: NewProspect) {
    const email = input.email?.trim() || null;
    if (email && db().prospects.some((p) => (p.email ?? "").toLowerCase() === email.toLowerCase())) throw new StoreError("Cet élément existe déjà.", "23505");
    const now = iso(new Date());
    const p: Prospect = { id: uid("mp"), name: input.name ?? null, email, phone: input.phone ?? null, source: input.source ?? "manuel", marque: null, utm: null, status: input.status ?? "nouveau", opted_in_at: input.opted_in_at ?? null, notes: input.notes ?? null, besoin: input.besoin ?? null, budget: input.budget ?? null, next_action_at: input.next_action_at ?? null, next_action_note: input.next_action_note ?? null, unsubscribed_at: null, created_by: this.session.user.id, created_at: now, updated_at: now };
    db().prospects.unshift(p);
    this.log(p.id, "cree", { source: p.source });
    if (p.opted_in_at) this.log(p.id, "opt_in", { source: p.source, marque: p.marque });
    return p;
  }
  async updateProspect(id: string, patch: Partial<NewProspect>) {
    const p = db().prospects.find((x) => x.id === id); if (!p) throw new StoreError("prospect_not_found");
    const b = { status: p.status, besoin: p.besoin, budget: p.budget, next_action_at: p.next_action_at, next_action_note: p.next_action_note, notes: p.notes };
    Object.assign(p, patch, { updated_at: iso(new Date()) });
    if (patch.status && b.status !== p.status) this.log(p.id, "statut", { from: b.status, to: p.status });
    if (("besoin" in patch || "budget" in patch) && (b.besoin !== p.besoin || b.budget !== p.budget)) this.log(p.id, "qualification", { besoin: p.besoin, budget: p.budget });
    if (("next_action_at" in patch || "next_action_note" in patch) && (b.next_action_at !== p.next_action_at || b.next_action_note !== p.next_action_note)) this.log(p.id, "prochaine_action", { next_action_at: p.next_action_at, note: p.next_action_note });
    if ("notes" in patch && b.notes !== p.notes && patch.notes) this.log(p.id, "note", { excerpt: String(patch.notes).slice(0, 140) });
    return p;
  }
  async prospectEvents(prospectId: string): Promise<ProspectEvent[]> {
    return db().events.filter((e) => e.prospect_id === prospectId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async appointments(opts?: { from?: string; to?: string }) {
    let rows = [...db().appointments].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (opts?.from) rows = rows.filter((a) => a.starts_at >= opts.from!);
    if (opts?.to) rows = rows.filter((a) => a.starts_at <= opts.to!);
    return rows;
  }
  async appointmentsForProspect(prospectId: string) { return db().appointments.filter((a) => a.prospect_id === prospectId).sort((a, b) => b.starts_at.localeCompare(a.starts_at)); }
  async book(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }) {
    if (new Date(input.ends_at) <= new Date(input.starts_at)) throw new StoreError("bad_range");
    const s = new Date(input.starts_at).getTime(), e = new Date(input.ends_at).getTime();
    const overlap = db().appointments.some((a) => a.status === "confirme" && s < new Date(a.ends_at).getTime() && e > new Date(a.starts_at).getTime());
    if (overlap) throw new StoreError("slot_taken", "23P01");
    const now = iso(new Date());
    const appt: Appointment = { id: uid("ma"), prospect_id: input.prospect_id, starts_at: input.starts_at, ends_at: input.ends_at, status: "confirme", meeting_url: input.meeting_url ?? null, created_by: this.session.user.id, created_at: now, updated_at: now };
    db().appointments.push(appt);
    const p = db().prospects.find((x) => x.id === input.prospect_id); if (p && (p.status === "nouveau" || p.status === "relance")) { const from = p.status; p.status = "reserve"; this.log(p.id, "statut", { from, to: "reserve" }); }
    this.log(input.prospect_id, "rdv_pris", { appointment_id: appt.id, starts_at: appt.starts_at });
    // relances d'opt-in annulées (même logique que la transaction SQL)
    db().emails.forEach((m) => { if (m.prospect_id === input.prospect_id && m.template === "relance_optin" && (m.status === "pending" || m.status === "claimed")) m.status = "cancelled"; });
    // rappels programmés
    for (const off of db().settings.reminder_offsets_hours) {
      const send = new Date(s - off * 3600000);
      if (send.getTime() > Date.now()) db().emails.push({ id: uid("me"), prospect_id: input.prospect_id, appointment_id: appt.id, template: "rappel_rdv", params: { hours_before: off }, send_at: iso(send), status: "pending", idempotency_key: `rappel:${appt.id}:${off}`, claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: now, updated_at: now });
    }
    return appt;
  }
  async cancelAppointment(id: string) {
    const a = db().appointments.find((x) => x.id === id); if (!a) throw new StoreError("not_found");
    a.status = "annule"; a.updated_at = iso(new Date());
    db().emails.forEach((m) => { if (m.appointment_id === id && (m.status === "pending" || m.status === "claimed")) m.status = "cancelled"; });
    this.log(a.prospect_id, "rdv_annule", { appointment_id: id });
  }
  async reschedule(id: string, starts_at: string, ends_at: string) {
    const a = db().appointments.find((x) => x.id === id); if (!a) throw new StoreError("not_found");
    await this.cancelAppointment(id);
    return this.book({ prospect_id: a.prospect_id, starts_at, ends_at, meeting_url: a.meeting_url });
  }
  async scheduledEmails(opts?: { status?: string }) {
    let rows = [...db().emails].sort((a, b) => b.send_at.localeCompare(a.send_at));
    if (opts?.status) rows = rows.filter((e) => e.status === opts.status);
    return rows;
  }
  async availableSlots(days: number): Promise<Slot[]> {
    const busy = db().appointments.filter((a) => a.status === "confirme").map((a) => ({ start: a.starts_at, end: a.ends_at }));
    return computeSlots(db().settings, new Date(), days, busy);
  }
  async dashboard(opts: { days: number }): Promise<MarketingDashboard> {
    const periodDays = opts.days === 90 ? 90 : 30;
    return buildDashboard({ prospects: db().prospects, appointments: db().appointments, events: db().events, periodDays, now: new Date() });
  }
}

/** Worker de démo : traite la file en mémoire. Toujours DRY RUN (aucun service d'envoi en démo). */
export async function demoRunOutbox(limit: number): Promise<import("./worker").OutboxSummary> {
  const d = db();
  const due = d.emails.filter((e) => e.status === "pending" && new Date(e.send_at).getTime() <= Date.now()).slice(0, limit);
  const sum = { ran: true, claimed: due.length, sent: 0, simulated: 0, failed: 0, uncertain: 0, cancelled: 0, live: false };
  const now = iso(new Date());
  for (const row of due) {
    const prospect = d.prospects.find((p) => p.id === row.prospect_id) ?? null;
    row.attempts += 1; row.updated_at = now;
    // Invariant : relance annulée si le prospect a un RDV confirmé.
    if (row.template === "relance_optin" && prospect && (prospect.unsubscribed_at || d.appointments.some((a) => a.prospect_id === prospect.id && a.status === "confirme"))) { row.status = "cancelled"; row.last_error = prospect.unsubscribed_at ? "Prospect désinscrit" : "RDV confirmé : relance annulée"; sum.cancelled++; continue; }
    if (!prospect?.email) { row.status = "failed"; row.last_error = "Aucune adresse email"; sum.failed++; continue; }
    // DRY RUN : on simule
    row.status = "sent"; row.dry_run = true; row.sent_at = now; row.last_error = null; sum.simulated++;
  }
  return sum;
}
