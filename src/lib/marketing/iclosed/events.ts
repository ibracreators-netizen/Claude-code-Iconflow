/**
 * iClosed — domaine normalisé des événements entrants (webhooks), indépendant du transport.
 *
 * ⚠️ CONTRAT NON PROUVÉ. Les formes ci-dessous reprennent le guide développeur iClosed
 * (consulté le 6/11/2026) mais AUCUN payload réel n'a été vérifié sur le compte. Avant de
 * figer : confirmer avec de vrais exemples par déclencheur. Tant que ce n'est pas prouvé, le
 * récepteur live reste OFF (voir receiver, phase I). Ce module ne parle pas au réseau ni à la base :
 * il valide et NORMALISE seulement. Il tolère des champs supplémentaires (z.object les ignore) mais
 * exige les quelques identifiants stables sur lesquels on s'appuie, sans jamais les deviner.
 *
 * Pièges documentés repris ici :
 *  - Les contacts sont en camelCase (id, accountId, updatedAt, questionsAndAnswers) ;
 *    les appels sont en snake_case (utc_start_time, questions_and_answers).
 *  - Pour un appel : event.uuid = ID de l'appel, event_type.uuid = ID du type, invitee.uuid = ID du contact.
 *    NE PAS confondre ces trois UUID.
 *  - « Call booked » ne couvre PAS le report : report et annulation ont leurs propres déclencheurs.
 */
import { z } from "zod";

export type IclosedKind = "contact" | "booking" | "reschedule" | "cancel";

/** Base commune à tout événement normalisé. `occurred_at` sert à ordonner (un événement plus ancien ne doit pas écraser un plus récent). */
interface NormalizedBase {
  provider: "iclosed";
  kind: IclosedKind;
  raw_type: string;          // le `type`/`hookType` brut reçu (traçabilité)
  account_id: string | null;
  occurred_at: string | null; // horodatage source si disponible (sinon le récepteur datera la réception)
}
export interface NormalizedContact extends NormalizedBase {
  kind: "contact";
  contact_external_id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  questions_and_answers: unknown;
  tracking: unknown;
}
export interface NormalizedBooking extends NormalizedBase {
  kind: "booking";
  call_external_id: string;
  event_type_id: string | null;
  contact_external_id: string | null;
  starts_at: string | null;  // UTC ISO tel que fourni
  ends_at: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  questions_and_answers: unknown;
  tracking: unknown;
}
export interface NormalizedReschedule extends NormalizedBase {
  kind: "reschedule";
  call_external_id: string;
  old_starts_at: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
}
export interface NormalizedCancel extends NormalizedBase {
  kind: "cancel";
  call_external_id: string;
}
export type NormalizedEvent = NormalizedContact | NormalizedBooking | NormalizedReschedule | NormalizedCancel;

const nstr = z.string().trim().optional().nullable();

// z.object ignore (strip) les clés inconnues → tolérance aux champs supplémentaires, sans les propager.
const contactShape = z.object({
  type: z.string().optional(),
  hookType: z.string().optional(),
  id: z.string().optional(),
  accountId: z.string().optional(),
  email: nstr,
  phone: nstr,
  name: nstr,
  updatedAt: z.string().optional(),
  questionsAndAnswers: z.unknown().optional(),
  tracking: z.unknown().optional(),
});
const uuidObj = z.object({ uuid: z.string().optional() }).optional();
const callShape = z.object({
  type: z.string().optional(),
  hookType: z.string().optional(),
  accountId: z.string().optional(),
  account_id: z.string().optional(),
  event: uuidObj,
  event_type: uuidObj,
  invitee: z.object({ uuid: z.string().optional(), email: nstr, phone: nstr, name: nstr }).optional(),
  utc_start_time: z.string().optional(),
  utc_end_time: z.string().optional(),
  old_utc_start_time: z.string().optional(),
  new_utc_start_time: z.string().optional(),
  new_utc_end_time: z.string().optional(),
  occurred_at: z.string().optional(),
  questions_and_answers: z.unknown().optional(),
  tracking: z.unknown().optional(),
});

export type NormalizeResult = { ok: true; event: NormalizedEvent } | { ok: false; error: string };

/** Associe un `type`/`hookType` iClosed à notre `kind`. Renvoie null si inconnu (on ne devine pas). */
function kindOf(raw: string | undefined): IclosedKind | null {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("contact")) return "contact"; // newContactCreated / contactUpdated / "Contact created|updated"
  if (t.includes("reschedul")) return "reschedule";
  if (t.includes("cancel")) return "cancel";
  if (t.includes("book")) return "booking"; // callBooked / "Call booked"
  return null;
}

/**
 * Normalise un payload iClosed brut. `declaredType` = type connu hors corps (ex. en-tête),
 * sinon on lit `type`/`hookType` dans le corps. Aucune supposition : si le type ou un ID requis
 * manque, on renvoie une erreur et l'appelant met l'événement en quarantaine pour revue.
 */
export function normalizeIclosed(payload: unknown, declaredType?: string): NormalizeResult {
  if (!payload || typeof payload !== "object") return { ok: false, error: "payload_not_object" };
  const body = payload as Record<string, unknown>;
  const kind = kindOf(declaredType ?? (body.type as string) ?? (body.hookType as string));
  if (!kind) return { ok: false, error: "unknown_event_type" };
  const rawType = String(declaredType ?? body.type ?? body.hookType ?? kind);

  if (kind === "contact") {
    const p = contactShape.safeParse(body);
    if (!p.success) return { ok: false, error: "contact_schema_invalid" };
    const d = p.data;
    if (!d.id) return { ok: false, error: "contact_missing_id" };
    return { ok: true, event: { provider: "iclosed", kind, raw_type: rawType, account_id: d.accountId ?? null, occurred_at: d.updatedAt ?? null, contact_external_id: d.id, email: d.email ?? null, phone: d.phone ?? null, name: d.name ?? null, questions_and_answers: d.questionsAndAnswers ?? null, tracking: d.tracking ?? null } };
  }

  const p = callShape.safeParse(body);
  if (!p.success) return { ok: false, error: "call_schema_invalid" };
  const d = p.data;
  const callId = d.event?.uuid;
  if (!callId) return { ok: false, error: "call_missing_event_uuid" };
  const accountId = d.accountId ?? d.account_id ?? null;

  if (kind === "booking") {
    return { ok: true, event: { provider: "iclosed", kind, raw_type: rawType, account_id: accountId, occurred_at: d.occurred_at ?? null, call_external_id: callId, event_type_id: d.event_type?.uuid ?? null, contact_external_id: d.invitee?.uuid ?? null, starts_at: d.utc_start_time ?? null, ends_at: d.utc_end_time ?? null, email: d.invitee?.email ?? null, phone: d.invitee?.phone ?? null, name: d.invitee?.name ?? null, questions_and_answers: d.questions_and_answers ?? null, tracking: d.tracking ?? null } };
  }
  if (kind === "reschedule") {
    return { ok: true, event: { provider: "iclosed", kind, raw_type: rawType, account_id: accountId, occurred_at: d.occurred_at ?? d.new_utc_start_time ?? null, call_external_id: callId, old_starts_at: d.old_utc_start_time ?? d.utc_start_time ?? null, new_starts_at: d.new_utc_start_time ?? null, new_ends_at: d.new_utc_end_time ?? null } };
  }
  return { ok: true, event: { provider: "iclosed", kind, raw_type: rawType, account_id: accountId, occurred_at: d.occurred_at ?? null, call_external_id: callId } };
}
