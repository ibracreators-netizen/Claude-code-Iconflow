/**
 * Appels à Google : échange du code, renouvellement de l'accès, lecture des agendas et des événements.
 * Uniquement des lectures (GET) côté Agenda : l'app n'écrit jamais dans Google.
 */
import { mapCalendar, mapEvent, type CalendarEvent, type EventCheck, type GoogleCalendarInfo } from "./core";

export class GoogleAuthError extends Error { constructor(message: string, public invalid = false) { super(message); this.name = "GoogleAuthError"; } }
export interface GoogleConfig { clientId: string; clientSecret: string; redirectUri: string }

export function googleConfig(): GoogleConfig | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim(), clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const redirectUri = (process.env.GOOGLE_REDIRECT_URL ?? "").trim() || (base ? `${base}/api/marketing/google/callback` : "");
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

type F = typeof fetch;
async function token(body: Record<string, string>, f: F): Promise<Record<string, unknown>> {
  const res = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // invalid_grant : l'accès a été retiré côté Google, ou le jeton a expiré → le membre doit reconnecter.
    throw new GoogleAuthError(String(json.error_description ?? json.error ?? `Google a répondu ${res.status}`), json.error === "invalid_grant");
  }
  return json;
}
export async function exchangeCode(cfg: GoogleConfig, code: string, f: F = fetch): Promise<{ accessToken: string; refreshToken: string | null; scope: string }> {
  const j = await token({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }, f);
  return { accessToken: String(j.access_token ?? ""), refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null, scope: String(j.scope ?? "") };
}
export async function refreshAccess(cfg: GoogleConfig, refreshToken: string, f: F = fetch): Promise<string> {
  const j = await token({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }, f);
  if (typeof j.access_token !== "string") throw new GoogleAuthError("Google n'a pas renvoyé d'accès.");
  return j.access_token;
}

async function get(url: string, access: string, f: F): Promise<Record<string, unknown>> {
  const res = await f(url, { headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`Google refuse l'accès (${res.status}).`, res.status === 401);
  if (!res.ok) throw new Error(`Google Agenda a répondu ${res.status}.`);
  return (await res.json()) as Record<string, unknown>;
}
export async function listCalendars(access: string, previous: GoogleCalendarInfo[] = [], f: F = fetch): Promise<GoogleCalendarInfo[]> {
  const j = await get("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250", access, f);
  return (Array.isArray(j.items) ? j.items : []).map((c) => mapCalendar(c, previous)).filter((c): c is GoogleCalendarInfo => !!c).sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "fr"));
}
/**
 * Événements d'un agenda sur une fenêtre, récurrences dépliées. Quatre pages au plus (1 000 événements) :
 * `truncated` dit qu'il en restait. Un agenda lu en partie ne sert pas à repérer les événements retirés.
 */
export async function listEvents(access: string, cal: { id: string; name: string | null }, owner: string | null, window: { from: string; to: string }, f: F = fetch): Promise<{ events: CalendarEvent[]; truncated: boolean }> {
  const out: CalendarEvent[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 4; page++) {
    const p = new URLSearchParams({ timeMin: window.from, timeMax: window.to, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    if (pageToken) p.set("pageToken", pageToken);
    const j = await get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${p.toString()}`, access, f);
    for (const raw of Array.isArray(j.items) ? j.items : []) { const e = mapEvent(raw, cal, owner); if (e && !e.cancelled) out.push(e); }
    pageToken = typeof j.nextPageToken === "string" ? j.nextPageToken : null;
    if (!pageToken) break;
  }
  return { events: out, truncated: !!pageToken };
}

/**
 * Un événement précis, relu chez Google (lecture seule) avant d'annuler un rendez-vous dont l'événement n'est plus
 * dans la lecture : « gone » seulement si Google ne le connaît plus (404, 410) ou l'a annulé ; sinon l'événement
 * tel qu'il est maintenant (peut-être déplacé hors de la fenêtre lue). Toute autre réponse est une erreur : rien n'est annulé.
 */
export async function getEvent(access: string, cal: { id: string; name: string | null }, owner: string | null, eventId: string, f: F = fetch): Promise<EventCheck> {
  const res = await f(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events/${encodeURIComponent(eventId)}`, { headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (res.status === 404 || res.status === 410) return { state: "gone" };
  if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`Google refuse l'accès (${res.status}).`, res.status === 401);
  if (!res.ok) throw new Error(`Google Agenda a répondu ${res.status}.`);
  const e = mapEvent(await res.json(), cal, owner);
  if (!e) throw new Error("Événement Google illisible.");
  return e.cancelled ? { state: "gone" } : { state: "present", event: e };
}
