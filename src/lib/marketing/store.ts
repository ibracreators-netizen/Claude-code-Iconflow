import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type Session } from "@/lib/data/store";
import { computeSlots, type Slot } from "./slots";
import {
  DEFAULT_MARKETING_SETTINGS, type Appointment, type MarketingCounts, type MarketingSettings, type Prospect, type ProspectStatus, type ScheduledEmail,
} from "./types";

export interface NewProspect { name?: string | null; email?: string | null; phone?: string | null; source?: string | null; notes?: string | null; status?: ProspectStatus; opted_in_at?: string | null }

/** Accès aux données Marketing, scopé à la session (RLS en production, mémoire en démo). */
export interface MarketingStore {
  readonly session: Session;
  settings(): Promise<MarketingSettings>;
  saveSettings(patch: Partial<MarketingSettings>): Promise<MarketingSettings>;
  counts(): Promise<MarketingCounts>;
  prospects(opts?: { status?: ProspectStatus; q?: string }): Promise<Prospect[]>;
  prospect(id: string): Promise<Prospect | null>;
  createProspect(input: NewProspect): Promise<Prospect>;
  updateProspect(id: string, patch: Partial<NewProspect>): Promise<Prospect>;
  appointments(opts?: { from?: string; to?: string }): Promise<Appointment[]>;
  appointmentsForProspect(prospectId: string): Promise<Appointment[]>;
  book(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }): Promise<Appointment>;
  cancelAppointment(id: string): Promise<void>;
  reschedule(id: string, starts_at: string, ends_at: string): Promise<Appointment>;
  scheduledEmails(opts?: { status?: string }): Promise<ScheduledEmail[]>;
  availableSlots(days: number): Promise<Slot[]>;
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
  constructor(private sb: SupabaseClient, public readonly session: Session) {}
  private t(name: string) { return this.sb.from(name); }
  private ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }, fallback = "Opération impossible."): T {
    if (res.error) throw new StoreError(res.error.message, res.error.code);
    if (res.data == null) throw new StoreError(fallback);
    return res.data;
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
    return this.ok<Prospect>(await this.t("marketing_prospects").insert({
      name: input.name ?? null, email: input.email ?? null, phone: input.phone ?? null, source: input.source ?? "manuel",
      notes: input.notes ?? null, status: cleanStatus(input.status ?? "nouveau"), opted_in_at: input.opted_in_at ?? null, created_by: this.session.user.id,
    }).select("*").single());
  }
  async updateProspect(id: string, patch: Partial<NewProspect>): Promise<Prospect> {
    const values: Record<string, unknown> = { ...patch };
    if (patch.status) values.status = cleanStatus(patch.status);
    return this.ok<Prospect>(await this.t("marketing_prospects").update(values).eq("id", id).select("*").single(), "prospect_not_found");
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
    return (Array.isArray(data) ? data[0] : data) as Appointment;
  }
  async cancelAppointment(id: string): Promise<void> {
    const { error } = await this.sb.rpc("marketing_cancel_appointment", { p_id: id });
    if (error) throw new StoreError(error.message, error.code);
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
}
