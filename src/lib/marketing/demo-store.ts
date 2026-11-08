import "server-only";
import { StoreError, type Session } from "@/lib/data/store";
import { computeSlots, type Slot } from "./slots";
import type { MarketingStore, NewProspect } from "./store";
import {
  DEFAULT_MARKETING_SETTINGS, type Appointment, type MarketingCounts, type MarketingSettings, type Prospect, type ProspectStatus, type ScheduledEmail,
} from "./types";

interface MDB { settings: MarketingSettings; prospects: Prospect[]; appointments: Appointment[]; emails: ScheduledEmail[] }
const g = globalThis as unknown as { __iconflowMktDemo?: MDB };
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const iso = (d: Date) => d.toISOString();

function seed(): MDB {
  const now = Date.now();
  const at = (days: number, h: number, m = 0) => { const d = new Date(now + days * 86400000); d.setUTCHours(h, m, 0, 0); return d; };
  const settings: MarketingSettings = {
    ...DEFAULT_MARKETING_SETTINGS,
    availability: [1, 2, 3, 4, 5].flatMap((weekday) => [{ weekday, start: "09:00", end: "12:00" }, { weekday, start: "14:00", end: "17:00" }]),
    slot_minutes: 30, min_notice_hours: 12, booking_public_enabled: true, emails_live: false,
    reminder_offsets_hours: [24, 1], relance_delay_hours: 48,
  };
  const prospects: Prospect[] = [
    { id: "mp-1", name: "Camille Besson", email: "camille@exemple.fr", phone: "+33 6 12 34 56 78", source: "landing-sprint", marque: "Besson Skin", utm: null, status: "reserve", opted_in_at: iso(at(-3, 9)), notes: "Marque de cosmétiques, ~15k€/mois ads.", unsubscribed_at: null, created_by: null, created_at: iso(at(-3, 9)), updated_at: iso(at(-1, 9)) },
    { id: "mp-2", name: "Yanis Cohen", email: "yanis@exemple.fr", phone: null, source: "instagram", marque: "Yanis Cosmetics", utm: null, status: "nouveau", opted_in_at: iso(at(-1, 14)), notes: null, unsubscribed_at: null, created_by: null, created_at: iso(at(-1, 14)), updated_at: iso(at(-1, 14)) },
    { id: "mp-3", name: "Sofia Marchetti", email: "sofia@exemple.fr", phone: null, source: "recommandation", marque: null, utm: null, status: "relance", opted_in_at: iso(at(-6, 10)), notes: "A ouvert 2 mails, pas encore réservé.", unsubscribed_at: null, created_by: null, created_at: iso(at(-6, 10)), updated_at: iso(at(-2, 10)) },
    { id: "mp-4", name: "Thomas Keller", email: "thomas@exemple.fr", phone: null, source: "landing-sprint", marque: "Keller Beauty", utm: null, status: "converti", opted_in_at: iso(at(-20, 11)), notes: "Signé le sprint.", unsubscribed_at: null, created_by: null, created_at: iso(at(-20, 11)), updated_at: iso(at(-5, 11)) },
  ];
  const appointments: Appointment[] = [
    { id: "ma-1", prospect_id: "mp-1", starts_at: iso(at(2, 9)), ends_at: iso(at(2, 9, 30)), status: "confirme", meeting_url: "https://meet.exemple.fr/camille", created_by: null, created_at: iso(at(-1, 9)), updated_at: iso(at(-1, 9)) },
  ];
  const emails: ScheduledEmail[] = [
    { id: "me-1", prospect_id: "mp-1", appointment_id: "ma-1", template: "rappel_rdv", params: { hours_before: 24 }, send_at: iso(at(1, 9)), status: "pending", idempotency_key: "rappel:ma-1:24", claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: iso(at(-1, 9)), updated_at: iso(at(-1, 9)) },
    { id: "me-2", prospect_id: "mp-3", appointment_id: null, template: "relance_optin", params: {}, send_at: iso(at(-1, 10)), status: "pending", idempotency_key: "relance:mp-3", claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: iso(at(-4, 10)), updated_at: iso(at(-4, 10)) },
  ];
  return { settings, prospects, appointments, emails };
}
function db(): MDB { if (!g.__iconflowMktDemo) g.__iconflowMktDemo = seed(); return g.__iconflowMktDemo; }
export function resetMarketingDemo() { g.__iconflowMktDemo = undefined; }

export class DemoMarketing implements MarketingStore {
  constructor(public readonly session: Session) {}
  async settings() { return db().settings; }
  async saveSettings(patch: Partial<MarketingSettings>) { db().settings = { ...db().settings, ...patch }; return db().settings; }
  async counts(): Promise<MarketingCounts> {
    return { prospects: db().prospects.length, appointments: db().appointments.filter((a) => a.status === "confirme").length, emailsPending: db().emails.filter((e) => e.status === "pending").length };
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
    const p: Prospect = { id: uid("mp"), name: input.name ?? null, email, phone: input.phone ?? null, source: input.source ?? "manuel", marque: null, utm: null, status: input.status ?? "nouveau", opted_in_at: input.opted_in_at ?? null, notes: input.notes ?? null, unsubscribed_at: null, created_by: this.session.user.id, created_at: now, updated_at: now };
    db().prospects.unshift(p); return p;
  }
  async updateProspect(id: string, patch: Partial<NewProspect>) {
    const p = db().prospects.find((x) => x.id === id); if (!p) throw new StoreError("prospect_not_found");
    Object.assign(p, patch, { updated_at: iso(new Date()) }); return p;
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
    const p = db().prospects.find((x) => x.id === input.prospect_id); if (p && (p.status === "nouveau" || p.status === "relance")) p.status = "reserve";
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
