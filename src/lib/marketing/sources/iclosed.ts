/**
 * Adaptateur iClosed (https://developer.iclosed.io — API publique v1, lue le 15/11/2026).
 *
 *  - Accès : en-tête `Authorization: Bearer <ICLOSED_API_KEY>` (la clé commence par « iclosed_ »).
 *  - Limite : 20 requêtes par 10 secondes et par route (offre Startup) → on espace les appels.
 *  - L'API n'a pas de filtre « modifié depuis » : on lit les rendez-vous du plus récemment modifié au
 *    plus ancien et on s'arrête au dernier déjà vu. La toute première fois, on remonte l'historique
 *    par tranches (date de création croissante), sur plusieurs passages s'il le faut.
 *  - Les notifications (webhooks) d'iClosed ne sont PAS signées à ce jour : on ne croit jamais leur
 *    contenu, on s'en sert seulement pour savoir quels rendez-vous relire par l'API.
 *
 * `mapCall` et `mapContact` sont pures : elles se vérifient hors ligne sur les exemples de la documentation.
 */
import type { CallResult, Outcome } from "../types";
import type { PullResult, SourceAdapter, SourceBooking, SourceCursor, SourceLead } from "./types";

const BASE = "https://public.api.iclosed.io/v1";
const PAGE = 100;
const GAP_MS = 650;                    // ~15 requêtes / 10 s : sous la limite de 20
const OVERLAP_MS = 5 * 60_000;

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const iso = (v: unknown): string | null => { const s = str(v); if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const plain = (html: string | null) => (html ? html.replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) || null : null);

const NO_SHOW = new Set(["NO_SHOW"]), CANCELLED = new Set(["CONTACT_CANCELLED", "ADMIN_CANCELLED"]);
const HELD = new Set(["WON", "NO_SALE", "QUALIFIED", "UNQUALIFIED", "APPROVED", "REJECTED"]);

/** Un rendez-vous iClosed (objet `eventCalls[]`) → notre forme commune. null si l'objet est inexploitable. */
export function mapCall(raw: unknown): SourceBooking | null {
  const c = obj(raw), id = str(c.id), start = iso(c.dateTimeUTC);
  if (!id || !start) return null;
  const event = obj(c.event), contact = obj(c.contact), user = obj(c.user);
  const minutes = Number(c.duration ?? event.duration) || 30;
  const unit = String(c.durationUnit ?? event.durationUnit ?? "MINUTES").toUpperCase();
  const end = new Date(Date.parse(start) + minutes * (unit.startsWith("HOUR") ? 3_600_000 : 60_000)).toISOString();

  const cancelled = !!(str(c.cancelledBy) || str(c.cancelReason));
  const done = arr(c.task).filter((t) => t.completed === true || str(t.outcome)).pop() ?? null;
  const outcomeRaw = (str(done?.outcome) ?? "").toUpperCase(), reason = (str(done?.noSaleReason) ?? "").toUpperCase();
  let result: CallResult = "a_venir", outcome: Outcome | null = null;
  if (cancelled || CANCELLED.has(reason)) result = "annule";
  else if (NO_SHOW.has(reason)) result = "absent";
  else if (HELD.has(outcomeRaw)) {
    result = "present";
    outcome = outcomeRaw === "WON" ? "signe" : outcomeRaw === "NO_SALE" ? (reason === "FOLLOW_UP_SCHEDULE" ? "en_reflexion" : "non_signe") : null;
  }
  const won = arr(c.deals).filter((d) => String(d.transactionType ?? "").toUpperCase() === "WON");
  const amount = won.length ? won.reduce((s, d) => s + (Number(d.value) || 0), 0) : null;

  const utm: Record<string, string> = {};
  for (const u of arr(c.utm)) { const k = str(u.utmKey), v = str(u.utmValue); if (k && v) utm[k.toLowerCase()] = v.slice(0, 200); }
  // Le setter n'est pas un champ de l'objet : il apparaît comme une réponse de type « utilisateur » (champ « set-by »).
  let setter: SourceBooking["setter"] = null;
  for (const a of arr(c.secondaryAnswers)) {
    if (!/set/i.test(String(a.customFieldIdentifier ?? "") + String(a.statement ?? ""))) continue;
    const u = obj(arr(a.answer).map((x) => x.user).find(Boolean));
    const name = [str(u.firstName), str(u.lastName)].filter(Boolean).join(" ");
    if (name) { setter = { name, email: str(u.email) }; break; }
  }
  const closerName = [str(user.firstName), str(user.lastName)].filter(Boolean).join(" ");
  return {
    external_id: id,
    contact: { external_id: str(c.contactId), email: str(c.inviteeEmail) ?? str(contact.email), phone: str(c.phoneNumber) ?? str(contact.phoneNumber), name: str(c.inviteeName), utm: Object.keys(utm).length ? utm : null },
    starts_at: start, ends_at: end, cancelled, result, outcome, amount: outcome === "signe" ? amount : null,
    title: str(event.name), meeting_url: str(c.locationLinkInvitee) ?? str(c.locationLink),
    closer: closerName || str(user.email) ? { email: str(user.email), name: closerName || null } : null, setter,
    note: plain(str(done?.notes)),
  };
}

/** Un contact iClosed sans rendez-vous (objet `contacts[]`) → cas 2. null s'il a déjà un rendez-vous ou n'a aucune coordonnée. */
export function mapContact(raw: unknown): SourceLead | null {
  const c = obj(raw), id = str(c.id), status = (str(c.status) ?? "").toUpperCase();
  if (!id || /CALL_BOOKED/.test(status)) return null;
  const email = str(c.email), phone = str(c.phoneNumber), name = [str(c.firstName), str(c.lastName)].filter(Boolean).join(" ") || null;
  if (!email && !phone) return null;
  const disqualified = status === "DISQUALIFIED";
  return { contact: { external_id: id, email, phone, name }, callable: !disqualified, tag: disqualified ? "disqualifié (iClosed)" : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function iclosedAdapter(env: { key?: string; fetchImpl?: typeof fetch } = {}): SourceAdapter {
  const key = () => (env.key ?? process.env.ICLOSED_API_KEY ?? "").trim();
  const doFetch = env.fetchImpl ?? fetch;
  let last = 0, requests = 0;

  async function get(path: string, params: Record<string, string | number>): Promise<J> {
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
    const url = `${BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
    for (let attempt = 0; ; attempt++) {
      last = Date.now(); requests++;
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${key()}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (res.status === 429 && attempt < 2) { const body = obj(await res.json().catch(() => ({}))); await sleep(Math.min(10, Number(body.retryAfter) || Number(res.headers.get("retry-after")) || 3) * 1000); continue; }
      if (res.status === 401 || res.status === 403) throw new Error("iClosed refuse la clé (ICLOSED_API_KEY) : vérifie qu'elle est valide et active.");
      if (!res.ok) throw new Error(`iClosed a répondu ${res.status} sur ${path}.`);
      return obj(await res.json());
    }
  }
  const calls = async (params: Record<string, string | number>) => arr(obj((await get("/eventCalls", { limit: PAGE, eventType: "ALL", ...params })).data).eventCalls);
  const contacts = async (params: Record<string, string | number>) => arr(obj((await get("/contacts", { limit: PAGE, ...params })).data).contacts);

  return {
    source: "iclosed", label: "iClosed",
    configured: () => !!key(),

    async pull(cursor: SourceCursor, deadline: number): Promise<PullResult> {
      requests = 0;
      const out: PullResult = { bookings: [], leads: [], cursor: { ...cursor }, more: false, requests: 0 };
      const started = new Date().toISOString();
      const push = (rows: J[]) => { for (const r of rows) { const b = mapCall(r); if (b) out.bookings.push(b); } };

      if (!cursor.backfill_done) {
        // Premier passage : tout l'historique, par date de création croissante, en reprenant où l'on s'est arrêté.
        let page = Number(cursor.backfill_page ?? 0);
        while (Date.now() < deadline && out.bookings.length < 300) {
          const rows = await calls({ orderColumn: "createdAt", orderBy: "asc", page });
          push(rows); page++;
          if (rows.length < PAGE) { out.cursor.backfill_done = true; out.cursor.calls_updated_at = started; break; }
        }
        out.cursor.backfill_page = page;
        out.more = !out.cursor.backfill_done;
      } else {
        // Passages suivants : du plus récemment modifié au plus ancien, jusqu'au dernier déjà vu.
        const since = Date.parse(String(cursor.calls_updated_at ?? "")) - OVERLAP_MS;
        for (let page = 0; page < 20 && Date.now() < deadline; page++) {
          const rows = await calls({ orderColumn: "updatedAt", orderBy: "desc", page });
          const fresh = rows.filter((r) => { const t = Date.parse(String(r.updatedAt ?? "")); return Number.isNaN(since) || Number.isNaN(t) || t >= since; });
          push(fresh);
          if (fresh.length < rows.length || rows.length < PAGE) { out.cursor.calls_updated_at = started; break; }
          if (page === 19) out.more = true;
        }
      }

      // Contacts sans rendez-vous, entrés depuis le dernier passage.
      if (Date.now() < deadline) {
        const from = Date.parse(String(cursor.contacts_from ?? ""));
        const params: Record<string, string | number> = { statuses: "POTENTIAL,QUALIFIED,DISQUALIFIED", orderColumn: "joinedTime", orderBy: "asc" };
        if (!Number.isNaN(from)) params.timeFrom = new Date(from - OVERLAP_MS).toISOString();
        let page = Number(cursor.contacts_page ?? 0), complete = false;
        while (Date.now() < deadline && out.leads.length < 300) {
          const rows = await contacts({ ...params, page });
          for (const r of rows) { const l = mapContact(r); if (l) out.leads.push(l); }
          page++;
          if (rows.length < PAGE) { complete = true; break; }
        }
        if (complete) { out.cursor.contacts_from = started; out.cursor.contacts_page = 0; } else { out.cursor.contacts_page = page; out.more = true; }
      } else out.more = true;

      out.requests = requests;
      return out;
    },

    async fetchBookings(ids: string[]): Promise<SourceBooking[]> {
      const clean = [...new Set(ids.filter((i) => /^\d+$/.test(i)))].slice(0, 50);
      if (!clean.length) return [];
      return (await calls({ ids: clean.join(",") })).map(mapCall).filter((b): b is SourceBooking => !!b);
    },

    parseWebhook(body: unknown) {
      const b = obj(body), event = obj(b.event);
      // Rendez-vous pris / annulé / déplacé : event.uuid ; résultat saisi : uuid à la racine.
      const ids = [str(event.uuid), /outcome/i.test(String(b.hookType ?? "")) ? str(b.uuid) : null].filter((x): x is string => !!x && /^\d+$/.test(x));
      return { bookingIds: ids, refresh: ids.length === 0 };
    },
  };
}
