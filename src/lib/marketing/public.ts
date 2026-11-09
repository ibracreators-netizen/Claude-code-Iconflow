import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { computeSlots } from "./slots";
import { DEFAULT_MARKETING_SETTINGS, type Appointment, type MarketingSettings, type Prospect } from "./types";
import { DemoMarketing } from "./demo-store";

/**
 * Flux publics de l'espace Marketing (sans session) : opt-in (webhook) et réservation en ligne.
 * Ils passent par la clé service (hors RLS) et valident tout côté serveur ; limitation de débit en mémoire.
 * Aucune source n'est branchée dans cette itération : ces points existent mais ne sont pas exposés.
 */

const mergeSettings = (raw: unknown): MarketingSettings => ({ ...DEFAULT_MARKETING_SETTINGS, ...((raw && typeof raw === "object" ? raw : {}) as Partial<MarketingSettings>) });
const BOOK_DAYS = 30;

// Limiteur de débit simple en mémoire (par instance). Suffisant pour un MVP ; documenté comme tel.
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}

const email = z.string().trim().toLowerCase().email();
const optinSchema = z.object({
  name: z.string().trim().max(160).optional().nullable(),
  email,
  phone: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
  marque: z.string().trim().max(120).optional().nullable(),
  // Clés libres : chaque régie publicitaire a les siennes (utm_*, fbclid, gclid…).
  utm: z.record(z.string().max(80), z.string().max(200)).optional().nullable(),
});
const bookingSchema = z.object({
  slot_start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(160),
  email,
  phone: z.string().trim().max(40).optional().nullable(),
  website: z.string().max(0).optional(), // champ piège anti-robots (doit rester vide)
});

export type PublicResult = { ok: true; message: string; when?: string } | { ok: false; error: string; code?: number };

function admin() { const a = createAdminClient(); if (!a) throw new Error("service_key_missing"); return a; }
/** Journal best-effort (clé service, hors RLS). N'échoue jamais le flux public (table absente avant 0016, etc.). */
async function logEvent(a: NonNullable<ReturnType<typeof createAdminClient>>, prospectId: string, kind: string, data: Record<string, unknown> = {}) {
  const { error } = await a.from("marketing_prospect_events").insert({ prospect_id: prospectId, kind, data });
  void error;
}
async function settings(): Promise<MarketingSettings> {
  if (!isSupabaseConfigured()) return (await new DemoMarketing({ user: { id: "public", email: "" }, profile: { role: "agency" } as never, demo: true }).settings());
  const { data } = await admin().from("marketing_settings").select("value").eq("key", "config").maybeSingle();
  return mergeSettings(data?.value);
}

/** Opt-in reçu d'un formulaire (webhook). Secret partagé obligatoire. Déduplication par email. */
export async function ingestOptin(secret: string | null, payload: unknown, rateKey = "optin"): Promise<PublicResult> {
  const expected = (process.env.MARKETING_OPTIN_SECRET ?? "").trim();
  if (!expected) return { ok: false, error: "L'ingestion d'opt-in n'est pas configurée (MARKETING_OPTIN_SECRET absent).", code: 503 };
  if (!secret || secret !== expected) return { ok: false, error: "Secret invalide.", code: 401 };
  if (rateLimited(`optin:${rateKey}`, 30, 60_000)) return { ok: false, error: "Trop de requêtes. Réessaie dans une minute.", code: 429 };
  const parsed = optinSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Données d'opt-in invalides.", code: 400 };
  if (!isSupabaseConfigured()) return { ok: true, message: "Opt-in reçu (démo : non persisté)." };
  const a = admin();
  const now = new Date().toISOString();
  const existing = (await a.from("marketing_prospects").select("*").ilike("email", parsed.data.email).maybeSingle()).data as Prospect | null;
  let prospect: Prospect;
  if (existing) {
    prospect = (await a.from("marketing_prospects").update({
      opted_in_at: existing.opted_in_at ?? now,
      name: existing.name ?? parsed.data.name ?? null,
      phone: existing.phone ?? parsed.data.phone ?? null,
      // marque et utm suivent la même règle que name/phone : on complète,
      // on n'écrase jamais une valeur déjà enregistrée.
      marque: existing.marque ?? parsed.data.marque ?? null,
      utm: existing.utm ?? parsed.data.utm ?? null,
    }).eq("id", existing.id).select("*").single()).data as Prospect;
    // Nouvel opt-in sur un prospect qui n'en avait pas encore : on l'horodate dans le journal.
    if (!existing.opted_in_at) await logEvent(a, prospect.id, "opt_in", { source: prospect.source, marque: prospect.marque ?? null });
  } else {
    prospect = (await a.from("marketing_prospects").insert({
      name: parsed.data.name ?? null,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      source: parsed.data.source ?? "optin",
      marque: parsed.data.marque ?? null,
      utm: parsed.data.utm ?? null,
      status: "nouveau",
      opted_in_at: now,
    }).select("*").single()).data as Prospect;
    await logEvent(a, prospect.id, "cree", { source: prospect.source });
    await logEvent(a, prospect.id, "opt_in", { source: prospect.source, marque: prospect.marque ?? null });
  }
  await scheduleRelanceIfNeeded(prospect);
  return { ok: true, message: "Opt-in enregistré." };
}

/** Programme une relance si le délai est configuré, le prospect non désinscrit et sans RDV confirmé ni relance en file. */
async function scheduleRelanceIfNeeded(prospect: Prospect) {
  const s = await settings();
  if (!s.relance_delay_hours || prospect.unsubscribed_at) return;
  const a = admin();
  const [{ count: booked }, { count: queued }] = await Promise.all([
    a.from("marketing_appointments").select("id", { count: "exact", head: true }).eq("prospect_id", prospect.id).eq("status", "confirme"),
    a.from("marketing_scheduled_emails").select("id", { count: "exact", head: true }).eq("prospect_id", prospect.id).eq("template", "relance_optin").in("status", ["pending", "claimed"]),
  ]);
  if ((booked ?? 0) > 0 || (queued ?? 0) > 0) return;
  const sendAt = new Date(Date.now() + s.relance_delay_hours * 3600000).toISOString();
  await a.from("marketing_scheduled_emails").insert({ prospect_id: prospect.id, template: "relance_optin", params: {}, send_at: sendAt, idempotency_key: `relance:${prospect.id}:${Date.now()}` });
}

/** Réservation publique d'un créneau. Désactivée tant que booking_public_enabled est faux. */
export async function submitPublicBooking(payload: unknown, rateKey = "book"): Promise<PublicResult> {
  const s = await settings();
  if (!s.booking_public_enabled) return { ok: false, error: "La réservation en ligne n'est pas ouverte pour le moment.", code: 403 };
  const parsed = bookingSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Vérifie les champs du formulaire.", code: 400 };
  if (parsed.data.website) return { ok: true, message: "Merci." }; // piège anti-robots : on fait comme si
  if (rateLimited(`book:${rateKey}`, 8, 60_000)) return { ok: false, error: "Trop de tentatives. Réessaie dans une minute.", code: 429 };
  if (!s.slot_minutes) return { ok: false, error: "Aucun créneau n'est proposé pour le moment.", code: 409 };
  const start = new Date(parsed.data.slot_start);
  const end = new Date(start.getTime() + s.slot_minutes * 60000);

  if (!isSupabaseConfigured()) return { ok: true, message: "Réservation (démo : non persistée).", when: start.toISOString() };
  const a = admin();
  // Le créneau doit figurer dans les disponibilités réelles (pas de fausse promesse).
  const busy = ((await a.from("marketing_appointments").select("starts_at, ends_at, status").gte("starts_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + (BOOK_DAYS + 1) * 86400000).toISOString())).data as Appointment[] | null ?? []).filter((x) => x.status === "confirme").map((x) => ({ start: x.starts_at, end: x.ends_at }));
  const slots = computeSlots(s, new Date(), BOOK_DAYS, busy);
  if (!slots.some((sl) => sl.start === start.toISOString())) return { ok: false, error: "Ce créneau n'est plus disponible. Choisis-en un autre.", code: 409 };

  // Prospect (créé si inconnu), puis réservation atomique (l'exclusion refuse deux réservations du même créneau).
  const existing = (await a.from("marketing_prospects").select("*").ilike("email", parsed.data.email).maybeSingle()).data as Prospect | null;
  const prospect = existing
    ? existing
    : ((await a.from("marketing_prospects").insert({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone ?? null, source: "reservation", status: "nouveau", opted_in_at: new Date().toISOString() }).select("*").single()).data as Prospect);
  if (!existing) { await logEvent(a, prospect.id, "cree", { source: "reservation" }); await logEvent(a, prospect.id, "opt_in", { source: "reservation" }); }
  const { error } = await a.rpc("marketing_book_appointment", { p_prospect: prospect.id, p_start: start.toISOString(), p_end: end.toISOString(), p_meeting_url: null });
  if (error) return { ok: false, error: /23P01|exclusion/i.test(error.message) ? "Ce créneau vient d'être réservé. Choisis-en un autre." : "La réservation a échoué. Réessaie.", code: 409 };
  await logEvent(a, prospect.id, "rdv_pris", { starts_at: start.toISOString() });
  return { ok: true, message: "Rendez-vous confirmé.", when: start.toISOString() };
}

/** Désinscription d'un prospect des emails commerciaux (lien dans les relances). */
export async function unsubscribeProspect(prospectId: string): Promise<PublicResult> {
  if (!/^[0-9a-f-]{10,}$/i.test(prospectId)) return { ok: false, error: "Lien invalide.", code: 400 };
  if (!isSupabaseConfigured()) return { ok: true, message: "Désinscription enregistrée (démo)." };
  const a = admin();
  await a.from("marketing_prospects").update({ unsubscribed_at: new Date().toISOString() }).eq("id", prospectId);
  await a.from("marketing_scheduled_emails").update({ status: "cancelled", last_error: "Prospect désinscrit" }).eq("prospect_id", prospectId).eq("template", "relance_optin").in("status", ["pending", "claimed"]);
  return { ok: true, message: "Vous êtes désinscrit. Vous ne recevrez plus d'emails de relance." };
}

/** Données de la page publique de réservation (sans session) : activée ? créneaux proposés ? */
export async function publicBookingData(days = BOOK_DAYS): Promise<{ enabled: boolean; timezone: string; slotMinutes: number | null; slots: { start: string; end: string }[] }> {
  const s = await settings();
  if (!s.booking_public_enabled || !s.slot_minutes || !s.availability.length) return { enabled: false, timezone: s.timezone, slotMinutes: s.slot_minutes, slots: [] };
  if (!isSupabaseConfigured()) { const demo = await new DemoMarketing({ user: { id: "public", email: "" }, profile: { role: "agency" } as never, demo: true }).availableSlots(days); return { enabled: true, timezone: s.timezone, slotMinutes: s.slot_minutes, slots: demo }; }
  const a = admin();
  const busy = ((await a.from("marketing_appointments").select("starts_at, ends_at, status").gte("starts_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + (days + 1) * 86400000).toISOString())).data as Appointment[] | null ?? []).filter((x) => x.status === "confirme").map((x) => ({ start: x.starts_at, end: x.ends_at }));
  return { enabled: true, timezone: s.timezone, slotMinutes: s.slot_minutes, slots: computeSlots(s, new Date(), days, busy) };
}
