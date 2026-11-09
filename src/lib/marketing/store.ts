import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type Session } from "@/lib/data/store";
import { computeSlots, type Slot } from "./slots";
import { buildDashboard } from "./aggregate";
import {
  DEFAULT_MARKETING_SETTINGS, type Appointment, type MarketingCounts, type MarketingDashboard, type MarketingSettings,
  type Prospect, type ProspectEvent, type ProspectEventKind, type ProspectStatus, type ScheduledEmail,
} from "./types";

export interface NewProspect {
  name?: string | null; email?: string | null; phone?: string | null; source?: string | null; notes?: string | null;
  status?: ProspectStatus; opted_in_at?: string | null;
  // Qualification + prochaine action (0016).
  besoin?: string | null; budget?: string | null; next_action_at?: string | null; next_action_note?: string | null;
}

/** Colonnes présentes depuis l'origine (0008) : seules à écrire si 0016 n'est pas encore appliquée. */
const CORE_PROSPECT_COLS = ["name", "email", "phone", "source", "notes", "status", "opted_in_at"] as const;

/** Accès aux données Marketing, scopé à la session (RLS en production, mémoire en démo). */
export interface MarketingStore {
  readonly session: Session;
  /** Vrai quand les données proviennent du magasin de démonstration (badge « Démo »). */
  readonly demo: boolean;
  settings(): Promise<MarketingSettings>;
  saveSettings(patch: Partial<MarketingSettings>): Promise<MarketingSettings>;
  counts(): Promise<MarketingCounts>;
  prospects(opts?: { status?: ProspectStatus; q?: string }): Promise<Prospect[]>;
  prospect(id: string): Promise<Prospect | null>;
  createProspect(input: NewProspect): Promise<Prospect>;
  updateProspect(id: string, patch: Partial<NewProspect>): Promise<Prospect>;
  prospectEvents(prospectId: string): Promise<ProspectEvent[]>;
  appointments(opts?: { from?: string; to?: string }): Promise<Appointment[]>;
  appointmentsForProspect(prospectId: string): Promise<Appointment[]>;
  book(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }): Promise<Appointment>;
  cancelAppointment(id: string): Promise<void>;
  reschedule(id: string, starts_at: string, ends_at: string): Promise<Appointment>;
  scheduledEmails(opts?: { status?: string }): Promise<ScheduledEmail[]>;
  availableSlots(days: number): Promise<Slot[]>;
  /** Agrégations réelles du tableau de bord (séries opt-ins, entonnoir, répartitions, RDV). */
  dashboard(opts: { days: number }): Promise<MarketingDashboard>;
}

const cleanStatus = (s: unknown): ProspectStatus => (["nouveau", "relance", "reserve", "converti", "perdu"].includes(s as string) ? (s as ProspectStatus) : "nouveau");
const mergeSettings = (raw: unknown): MarketingSettings => {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<MarketingSettings>;
  return {
    ...DEFAULT_MARKETING_SETTINGS,
    ...v,
    availability: Array.isArray(v.availability) ? v.availability.filter((w) => w && typeof w.weekday === "number" && typeof w.start === "string" && typeof w.end === "string") : [],
    reminder_offsets_hours: Array.isArray(v.reminder_offsets_hours) ? v.reminder_offsets_hours.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [],
    slot_minutes: typeof v.slot_minutes === "number" && v.slot_minutes > 0 ? v.slot_minutes : null,
    relance_delay_hours: typeof v.relance_delay_hours === "number" && v.relance_delay_hours > 0 ? v.relance_delay_hours : null,
    booking_public_enabled: v.booking_public_enabled === true,
    emails_live: v.emails_live === true,
    timezone: typeof v.timezone === "string" && v.timezone ? v.timezone : DEFAULT_MARKETING_SETTINGS.timezone,
  };
};

/* ─────────────────────────── Production (Supabase, RLS) ─────────────────────────── */
export class SupabaseMarketing implements MarketingStore {
  readonly demo = false;
  constructor(private sb: SupabaseClient, public readonly session: Session) {}
  private t(name: string) { return this.sb.from(name); }
  private ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }, fallback = "Opération impossible."): T {
    if (res.error) throw new StoreError(res.error.message, res.error.code);
    if (res.data == null) throw new StoreError(fallback);
    return res.data;
  }
  /** Table/colonne absente (migration 0016 pas encore appliquée) : on dégrade sans casser. */
  private missingSchema(e: { message?: string; code?: string } | null): boolean {
    return !!e && /42P01|42703|PGRST20[45]|does not exist|could not find/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
  }
  /** Journal best-effort : n'échoue JAMAIS l'action principale (table absente avant 0016, etc.). */
  private async logEvent(prospectId: string, kind: ProspectEventKind, data: Record<string, unknown> = {}) {
    try { await this.t("marketing_prospect_events").insert({ prospect_id: prospectId, kind, data, created_by: this.session.user.id }); }
    catch { /* best-effort */ }
  }

  async settings(): Promise<MarketingSettings> {
    const { data, error } = await this.t("marketing_settings").select("value").eq("key", "config").maybeSingle();
    if (error) throw new StoreError(error.message, error.code);
    return mergeSettings(data?.value);
  }
  async saveSettings(patch: Partial<MarketingSettings>): Promise<MarketingSettings> {
    const next = mergeSettings({ ...(await this.settings()), ...patch });
    const { error } = await this.t("marketing_settings").upsert({ key: "config", value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new StoreError(error.message, error.code);
    return next;
  }
  async counts(): Promise<MarketingCounts> {
    const [p, a, e] = await Promise.all([
      this.t("marketing_prospects").select("id", { count: "exact", head: true }),
      this.t("marketing_appointments").select("id", { count: "exact", head: true }).eq("status", "confirme"),
      this.t("marketing_scheduled_emails").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    return { prospects: p.count ?? 0, appointments: a.count ?? 0, emailsPending: e.count ?? 0 };
  }
  async prospects(opts?: { status?: ProspectStatus; q?: string }): Promise<Prospect[]> {
    let q = this.t("marketing_prospects").select("*").order("created_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.q) { const term = `%${opts.q.replace(/[%_]/g, "")}%`; q = q.or(`name.ilike.${term},email.ilike.${term}`); }
    const { data, error } = await q;
    if (error) throw new StoreError(error.message, error.code);
    return (data ?? []) as Prospect[];
  }
  async prospect(id: string): Promise<Prospect | null> {
    const { data, error } = await this.t("marketing_prospects").select("*").eq("id", id).maybeSingle();
    if (error) throw new StoreError(error.message, error.code);
    return (data as Prospect) ?? null;
  }
  async createProspect(input: NewProspect): Promise<Prospect> {
    const p = this.ok<Prospect>(await this.t("marketing_prospects").insert({
      name: input.name ?? null, email: input.email ?? null, phone: input.phone ?? null, source: input.source ?? "manuel",
      notes: input.notes ?? null, status: cleanStatus(input.status ?? "nouveau"), opted_in_at: input.opted_in_at ?? null, created_by: this.session.user.id,
    }).select("*").single());
    await this.logEvent(p.id, "cree", { source: p.source });
    if (p.opted_in_at) await this.logEvent(p.id, "opt_in", { source: p.source, marque: p.marque ?? null });
    return p;
  }
  async updateProspect(id: string, patch: Partial<NewProspect>): Promise<Prospect> {
    const before = await this.prospect(id);
    const values: Record<string, unknown> = { ...patch };
    if (patch.status) values.status = cleanStatus(patch.status);
    let res = await this.t("marketing_prospects").update(values).eq("id", id).select("*").single();
    if (this.missingSchema(res.error)) {
      // Colonnes 0016 pas encore en base : on applique au moins le cœur (statut/notes/contact).
      const core: Record<string, unknown> = {};
      for (const k of CORE_PROSPECT_COLS) if (k in values) core[k] = values[k];
      res = await this.t("marketing_prospects").update(core).eq("id", id).select("*").single();
    }
    const after = this.ok<Prospect>(res, "prospect_not_found");
    await this.emitDiff(before, after, patch);
    return after;
  }
  /** Journalise ce qui a changé après une mise à jour (chronologie de la fiche). */
  private async emitDiff(before: Prospect | null, after: Prospect, patch: Partial<NewProspect>) {
    if (!before) return;
    if (patch.status && before.status !== after.status) await this.logEvent(after.id, "statut", { from: before.status, to: after.status });
    if (("besoin" in patch || "budget" in patch) && (before.besoin !== after.besoin || before.budget !== after.budget)) await this.logEvent(after.id, "qualification", { besoin: after.besoin ?? null, budget: after.budget ?? null });
    if (("next_action_at" in patch || "next_action_note" in patch) && (before.next_action_at !== after.next_action_at || before.next_action_note !== after.next_action_note)) await this.logEvent(after.id, "prochaine_action", { next_action_at: after.next_action_at ?? null, note: after.next_action_note ?? null });
    if ("notes" in patch && before.notes !== after.notes && patch.notes) await this.logEvent(after.id, "note", { excerpt: String(patch.notes).slice(0, 140) });
  }
  async prospectEvents(prospectId: string): Promise<ProspectEvent[]> {
    const { data, error } = await this.t("marketing_prospect_events").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false });
    if (error) { if (this.missingSchema(error)) return []; throw new StoreError(error.message, error.code); }
    return (data ?? []) as ProspectEvent[];
  }
  async appointments(opts?: { from?: string; to?: string }): Promise<Appointment[]> {
    let q = this.t("marketing_appointments").select("*").order("starts_at");
    if (opts?.from) q = q.gte("starts_at", opts.from);
    if (opts?.to) q = q.lte("starts_at", opts.to);
    const { data, error } = await q;
    if (error) throw new StoreError(error.message, error.code);
    return (data ?? []) as Appointment[];
  }
  async appointmentsForProspect(prospectId: string): Promise<Appointment[]> {
    const { data, error } = await this.t("marketing_appointments").select("*").eq("prospect_id", prospectId).order("starts_at", { ascending: false });
    if (error) throw new StoreError(error.message, error.code);
    return (data ?? []) as Appointment[];
  }
  async book(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }): Promise<Appointment> {
    const { data, error } = await this.sb.rpc("marketing_book_appointment", { p_prospect: input.prospect_id, p_start: input.starts_at, p_end: input.ends_at, p_meeting_url: input.meeting_url ?? null });
    if (error) throw new StoreError(error.message, error.code);
    const appt = (Array.isArray(data) ? data[0] : data) as Appointment;
    await this.logEvent(input.prospect_id, "rdv_pris", { appointment_id: appt.id, starts_at: appt.starts_at });
    return appt;
  }
  async cancelAppointment(id: string): Promise<void> {
    const { data: row } = await this.t("marketing_appointments").select("prospect_id").eq("id", id).maybeSingle();
    const { error } = await this.sb.rpc("marketing_cancel_appointment", { p_id: id });
    if (error) throw new StoreError(error.message, error.code);
    const prospectId = (row as { prospect_id?: string } | null)?.prospect_id;
    if (prospectId) await this.logEvent(prospectId, "rdv_annule", { appointment_id: id });
  }
  async reschedule(id: string, starts_at: string, ends_at: string): Promise<Appointment> {
    const current = this.ok<{ prospect_id: string; meeting_url: string | null }>(await this.t("marketing_appointments").select("prospect_id, meeting_url").eq("id", id).maybeSingle(), "not_found");
    await this.cancelAppointment(id);
    return this.book({ prospect_id: current.prospect_id, starts_at, ends_at, meeting_url: current.meeting_url });
  }
  async scheduledEmails(opts?: { status?: string }): Promise<ScheduledEmail[]> {
    let q = this.t("marketing_scheduled_emails").select("*").order("send_at", { ascending: false }).limit(200);
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new StoreError(error.message, error.code);
    return (data ?? []) as ScheduledEmail[];
  }
  async availableSlots(days: number): Promise<Slot[]> {
    const settings = await this.settings();
    const now = new Date();
    const to = new Date(now.getTime() + (days + 1) * 86400000).toISOString();
    const busy = (await this.appointments({ from: now.toISOString(), to })).filter((a) => a.status === "confirme").map((a) => ({ start: a.starts_at, end: a.ends_at }));
    return computeSlots(settings, now, days, busy);
  }
  async dashboard(opts: { days: number }): Promise<MarketingDashboard> {
    const periodDays = opts.days === 90 ? 90 : 30;
    const now = new Date();
    const since = new Date(now.getTime() - periodDays * 86400000).toISOString();
    const [pRes, aRes, eRes] = await Promise.all([
      this.t("marketing_prospects").select("*").limit(5000),
      this.t("marketing_appointments").select("*").limit(5000),
      this.t("marketing_prospect_events").select("*").gte("created_at", since).limit(5000),
    ]);
    if (pRes.error) throw new StoreError(pRes.error.message, pRes.error.code);
    if (aRes.error) throw new StoreError(aRes.error.message, aRes.error.code);
    // Événements absents avant 0016 : entonnoir dégradé (conversion non mesurée), le reste intact.
    const events = this.missingSchema(eRes.error) ? [] : (eRes.data ?? []) as ProspectEvent[];
    return buildDashboard({ prospects: (pRes.data ?? []) as Prospect[], appointments: (aRes.data ?? []) as Appointment[], events, periodDays, now });
  }
}
