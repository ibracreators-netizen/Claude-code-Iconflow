import "server-only";
import { StoreError, type Session } from "@/lib/data/store";
import { computeSlots, type Slot } from "./slots";
import { buildDashboard } from "./aggregate";
import type { MarketingStore, NewProspect } from "./store";
import {
  DEFAULT_MARKETING_SETTINGS, type Appointment, type MarketingCounts, type MarketingDashboard, type MarketingSettings,
  type Prospect, type ProspectEvent, type ProspectEventKind, type ProspectStatus, type ScheduledEmail,
} from "./types";

interface MDB { settings: MarketingSettings; prospects: Prospect[]; appointments: Appointment[]; emails: ScheduledEmail[]; events: ProspectEvent[] }
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
  // Constructeur de prospect avec valeurs par défaut (seed démo — données fictives).
  const mkP = (o: {
    id: string; name: string; email: string; status: ProspectStatus; source: string; opt: number; upd?: number;
    marque?: string | null; utm?: Record<string, string> | null; phone?: string | null; notes?: string | null;
    besoin?: string | null; budget?: string | null; next?: number | null; nextNote?: string | null;
  }): Prospect => ({
    id: o.id, name: o.name, email: o.email, phone: o.phone ?? null, source: o.source, marque: o.marque ?? null, utm: o.utm ?? null,
    status: o.status, opted_in_at: iso(at(o.opt, 10)), notes: o.notes ?? null, besoin: o.besoin ?? null, budget: o.budget ?? null,
    next_action_at: o.next == null ? null : iso(at(o.next, 9)), next_action_note: o.nextNote ?? null,
    unsubscribed_at: null, created_by: null, created_at: iso(at(o.opt, 10)), updated_at: iso(at(o.upd ?? o.opt, 12)),
  });
  const UTM_META = { utm_source: "meta", utm_medium: "cpc", utm_campaign: "sprint-nov" };
  const UTM_TIKTOK = { utm_source: "tiktok", utm_medium: "paid", utm_campaign: "ugc-beaute" };
  const UTM_GOOGLE = { utm_source: "google", utm_medium: "cpc", utm_campaign: "brand" };

  const prospects: Prospect[] = [
    mkP({ id: "mp-1", name: "Camille Besson", email: "camille@exemple.fr", phone: "+33 6 12 34 56 78", source: "landing-sprint", marque: "Besson Skin", status: "reserve", opt: -3, upd: -1, besoin: "Relancer l'acquisition, 4 UGC/mois", budget: "4 000 €/mois", next: 0, nextNote: "Confirmer le brief avant le RDV", notes: "Marque de cosmétiques, ~15k€/mois ads." }),
    mkP({ id: "mp-2", name: "Yanis Cohen", email: "yanis@exemple.fr", source: "instagram", marque: "Yanis Cosmetics", status: "nouveau", opt: -1 }),
    mkP({ id: "mp-3", name: "Sofia Marchetti", email: "sofia@exemple.fr", source: "recommandation", status: "relance", opt: -6, upd: -2, next: -1, nextNote: "Rappeler — pas de réponse au mail", notes: "A ouvert 2 mails, pas encore réservé." }),
    mkP({ id: "mp-4", name: "Thomas Keller", email: "thomas@exemple.fr", source: "landing-sprint", marque: "Keller Beauty", status: "converti", opt: -20, upd: -5, besoin: "Sprint créatif complet", budget: "Sprint signé", notes: "Signé le sprint." }),
    mkP({ id: "mp-5", name: "Inès Rahmani", email: "ines@exemple.fr", phone: "+33 6 22 10 44 88", source: "meta-ads", marque: "Rahmani Cosmétiques", utm: UTM_META, status: "reserve", opt: -4, upd: -2, besoin: "Lancement gamme soin", budget: "2–3k/mois", next: 2, nextNote: "Préparer la proposition" }),
    mkP({ id: "mp-6", name: "Lucas Moreau", email: "lucas@exemple.fr", source: "tiktok-ads", utm: UTM_TIKTOK, status: "nouveau", opt: -2 }),
    mkP({ id: "mp-7", name: "Emma Lefèvre", email: "emma@exemple.fr", source: "instagram", status: "perdu", opt: -30, upd: -24, notes: "Budget trop juste pour l'instant." }),
    mkP({ id: "mp-8", name: "Noah Garcia", email: "noah@exemple.fr", source: "recommandation", marque: "Garcia Studio", status: "converti", opt: -38, upd: -34 }),
    mkP({ id: "mp-9", name: "Chloé Dubois", email: "chloe@exemple.fr", phone: "+33 7 01 02 03 04", source: "meta-ads", marque: "Dubois Paris", utm: UTM_META, status: "relance", opt: -8, upd: -6, besoin: "Scaler Meta", budget: "6 000 €/mois", next: 1, nextNote: "Envoyer l'étude de cas" }),
    mkP({ id: "mp-10", name: "Adam Benali", email: "adam@exemple.fr", source: "optin", status: "nouveau", opt: -1 }),
    mkP({ id: "mp-11", name: "Jade Rousseau", email: "jade@exemple.fr", source: "youtube", marque: "Rousseau Beauté", status: "reserve", opt: -5, upd: -3, next: 3, nextNote: "Relire le script avant l'appel" }),
    mkP({ id: "mp-12", name: "Nathan Girard", email: "nathan@exemple.fr", source: "tiktok-ads", utm: UTM_TIKTOK, status: "perdu", opt: -26, upd: -20 }),
    mkP({ id: "mp-13", name: "Léa Fontaine", email: "lea@exemple.fr", source: "landing-sprint", marque: "LeaFit", status: "converti", opt: -44, upd: -40 }),
    mkP({ id: "mp-14", name: "Maxime Petit", email: "maxime@exemple.fr", source: "reservation", status: "nouveau", opt: -3 }),
    mkP({ id: "mp-15", name: "Sarah Nguyen", email: "sarah@exemple.fr", source: "google-ads", marque: "Nguyen Cosmetics", utm: UTM_GOOGLE, status: "relance", opt: -12, upd: -10, next: 0, nextNote: "Rappel : proposer un créneau" }),
  ];

  const appt = (id: string, prospect_id: string, day: number, status: Appointment["status"], meeting_url: string | null = null): Appointment =>
    ({ id, prospect_id, starts_at: iso(at(day, 10)), ends_at: iso(at(day, 10, 30)), status, meeting_url, created_by: null, created_at: iso(at(Math.min(day, 0) - 1, 9)), updated_at: iso(at(Math.min(day, 0) - 1, 9)) });
  const appointments: Appointment[] = [
    appt("ma-1", "mp-1", 2, "confirme", "https://meet.exemple.fr/camille"),
    appt("ma-2", "mp-5", 4, "confirme"),
    appt("ma-3", "mp-11", 9, "confirme"),
    appt("ma-4", "mp-4", -15, "confirme"),
    appt("ma-5", "mp-8", -32, "confirme"),
    appt("ma-6", "mp-13", -40, "confirme"),
    appt("ma-7", "mp-9", 1, "annule"),
  ];

  const emails: ScheduledEmail[] = [
    { id: "me-1", prospect_id: "mp-1", appointment_id: "ma-1", template: "rappel_rdv", params: { hours_before: 24 }, send_at: iso(at(1, 10)), status: "pending", idempotency_key: "rappel:ma-1:24", claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: iso(at(-1, 9)), updated_at: iso(at(-1, 9)) },
    { id: "me-2", prospect_id: "mp-3", appointment_id: null, template: "relance_optin", params: {}, send_at: iso(at(-1, 10)), status: "pending", idempotency_key: "relance:mp-3", claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: iso(at(-4, 10)), updated_at: iso(at(-4, 10)) },
    { id: "me-3", prospect_id: "mp-15", appointment_id: null, template: "relance_optin", params: {}, send_at: iso(at(1, 10)), status: "pending", idempotency_key: "relance:mp-15", claimed_by: null, claimed_at: null, attempts: 0, last_error: null, provider_message_id: null, dry_run: true, sent_at: null, created_at: iso(at(-10, 10)), updated_at: iso(at(-10, 10)) },
  ];

  // Journal d'événements : opt-in + création pour tous, puis les étapes clés (statut, RDV, qualif, note, relance).
  const events: ProspectEvent[] = [];
  const dayOf = (isoStr: string) => Math.round((Date.parse(isoStr) - now) / 86400000);
  const mkE = (prospect_id: string, kind: ProspectEventKind, day: number, data: Record<string, unknown> = {}, h = 11) =>
    events.push({ id: uid("mev"), prospect_id, kind, data, created_by: null, created_at: iso(at(day, h)) });
  for (const p of prospects) {
    mkE(p.id, "cree", dayOf(p.created_at), { source: p.source }, 10);
    if (p.opted_in_at) mkE(p.id, "opt_in", dayOf(p.opted_in_at), { source: p.source, marque: p.marque }, 10);
  }
  mkE("mp-1", "qualification", -2, { besoin: "Relancer l'acquisition, 4 UGC/mois", budget: "4 000 €/mois" });
  mkE("mp-1", "statut", -1, { from: "nouveau", to: "reserve" });
  mkE("mp-1", "rdv_pris", -1, { appointment_id: "ma-1" });
  mkE("mp-3", "note", -3, { excerpt: "A ouvert 2 mails, pas encore réservé." });
  mkE("mp-3", "statut", -2, { from: "nouveau", to: "relance" });
  mkE("mp-3", "relance_programmee", -4, { send_at: iso(at(-1, 10)) });
  mkE("mp-4", "statut", -16, { from: "nouveau", to: "reserve" });
  mkE("mp-4", "rdv_pris", -15, { appointment_id: "ma-4" });
  mkE("mp-4", "statut", -5, { from: "reserve", to: "converti" });
  mkE("mp-5", "qualification", -3, { besoin: "Lancement gamme soin", budget: "2–3k/mois" });
  mkE("mp-5", "statut", -2, { from: "nouveau", to: "reserve" });
  mkE("mp-5", "rdv_pris", -2, { appointment_id: "ma-2" });
  mkE("mp-7", "statut", -24, { from: "relance", to: "perdu" });
  mkE("mp-8", "rdv_pris", -32, { appointment_id: "ma-5" });
  mkE("mp-8", "statut", -34, { from: "reserve", to: "converti" });
  mkE("mp-9", "statut", -6, { from: "nouveau", to: "relance" });
  mkE("mp-11", "statut", -3, { from: "nouveau", to: "reserve" });
  mkE("mp-11", "rdv_pris", -3, { appointment_id: "ma-3" });
  mkE("mp-12", "statut", -20, { from: "relance", to: "perdu" });
  mkE("mp-13", "rdv_pris", -40, { appointment_id: "ma-6" });
  mkE("mp-13", "statut", -40, { from: "reserve", to: "converti" });
  mkE("mp-15", "statut", -10, { from: "nouveau", to: "relance" });
  events.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return { settings, prospects, appointments, emails, events };
}
function db(): MDB { if (!g.__iconflowMktDemo) g.__iconflowMktDemo = seed(); return g.__iconflowMktDemo; }
export function resetMarketingDemo() { g.__iconflowMktDemo = undefined; }

export class DemoMarketing implements MarketingStore {
  readonly demo = true;
  constructor(public readonly session: Session) {}
  private log(prospectId: string, kind: ProspectEventKind, data: Record<string, unknown> = {}) {
    db().events.push({ id: uid("mev"), prospect_id: prospectId, kind, data, created_by: this.session.user.id, created_at: iso(new Date()) });
  }
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
