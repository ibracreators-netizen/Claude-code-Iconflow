/**
 * Google Agenda : fonctions pures (traduction d'un événement, rapprochement avec un contact, repérage
 * d'un rendez-vous déjà reçu de l'outil de réservation). Vérifiables hors ligne.
 */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export interface GoogleCalendarInfo { id: string; name: string; primary: boolean; selected: boolean }
export interface CalendarEvent {
  google_event_id: string; calendar_id: string; calendar_name: string | null; title: string | null;
  starts_at: string; ends_at: string; all_day: boolean; kind: "rdv" | "bloque"; attendees: string[]; html_link: string | null; cancelled: boolean;
  /** Nom affiché par Google pour un invité (email → nom), s'il le donne. Sert à nommer un contact créé ; jamais copié dans marketing_calendar_events. */
  attendee_names?: Record<string, string>;
  /** Lien de visio Google Meet de l'événement (https), s'il y en a un. */
  meeting_url?: string | null;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Adresse de la page de consentement. Lecture seule, accès hors ligne (jeton de renouvellement). */
export function authUrl(o: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }): string {
  const p = new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code", scope: GOOGLE_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state: o.state });
  if (o.loginHint) p.set("login_hint", o.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export function mapCalendar(raw: unknown, previous: GoogleCalendarInfo[] = []): GoogleCalendarInfo | null {
  const c = obj(raw), id = str(c.id); if (!id) return null;
  const before = previous.find((p) => p.id === id);
  // Par défaut, seul l'agenda principal est affiché : le membre choisit ensuite.
  return { id, name: str(c.summaryOverride) ?? str(c.summary) ?? id, primary: c.primary === true, selected: before ? before.selected : c.primary === true };
}

/** Un événement Google → notre forme. `owner` : email du compte, exclu des invités. null si inexploitable. */
export function mapEvent(raw: unknown, cal: { id: string; name: string | null }, owner: string | null): CalendarEvent | null {
  const e = obj(raw), id = str(e.id); if (!id) return null;
  const s = obj(e.start), en = obj(e.end);
  const allDay = !!str(s.date) && !str(s.dateTime);
  const start = str(s.dateTime) ?? (str(s.date) ? `${str(s.date)}T00:00:00Z` : null), end = str(en.dateTime) ?? (str(en.date) ? `${str(en.date)}T00:00:00Z` : null);
  const a = start ? Date.parse(start) : NaN, b = end ? Date.parse(end) : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const mine = (owner ?? "").toLowerCase();
  const people = (Array.isArray(e.attendees) ? e.attendees : []).map(obj).filter((x) => x.self !== true && x.resource !== true);
  const attendees = [...new Set(people.map((x) => (str(x.email) ?? "").toLowerCase()).filter((m) => m && m !== mine))].slice(0, 30);
  const names: Record<string, string> = {};
  for (const x of people) { const m = (str(x.email) ?? "").toLowerCase(), n = str(x.displayName); if (n && attendees.includes(m) && !names[m]) names[m] = n.slice(0, 120); }
  const meet = str(e.hangoutLink);
  return {
    google_event_id: id, calendar_id: cal.id, calendar_name: cal.name, title: str(e.summary), starts_at: new Date(a).toISOString(), ends_at: new Date(Math.max(b, a + 60_000)).toISOString(), all_day: allDay,
    kind: attendees.length ? "rdv" : "bloque", attendees, html_link: str(e.htmlLink), cancelled: str(e.status) === "cancelled",
    attendee_names: names, meeting_url: meet && /^https:\/\/\S+$/i.test(meet) && meet.length <= 400 ? meet : null,
  };
}

/** Le contact dont l'email figure parmi les invités (les membres de l'équipe ne comptent pas). */
export function matchContact(ev: Pick<CalendarEvent, "attendees">, contactIdByEmail: Map<string, string>, teamEmails: Set<string>): string | null {
  for (const email of ev.attendees) { if (teamEmails.has(email)) continue; const id = contactIdByEmail.get(email); if (id) return id; }
  return null;
}

export interface KnownAppointment { id: string; starts_at: string; contact_id: string | null; status: string }
/**
 * Le même rendez-vous peut arriver par l'outil de réservation ET par Google (l'outil l'écrit dans l'agenda).
 * On le reconnaît à son heure de début (à cinq minutes près) et au contact invité : il ne s'affiche alors qu'une fois.
 */
export function matchAppointment(ev: Pick<CalendarEvent, "starts_at">, contactId: string | null, appointments: KnownAppointment[]): string | null {
  if (!contactId) return null;
  const t = Date.parse(ev.starts_at);
  return appointments.find((a) => a.contact_id === contactId && a.status !== "annule" && Math.abs(Date.parse(a.starts_at) - t) <= 5 * 60_000)?.id ?? null;
}
