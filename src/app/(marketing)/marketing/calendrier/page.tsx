import type { Metadata } from "next";
import { canAccess } from "@/lib/permissions";
import { crmPage, isAdmin, members, salesRole } from "@/lib/marketing/crm-server";
import { partsInZone, zonedTimeToUtc } from "@/lib/marketing/slots";
import { googleEnv, googleReady, myGoogleAccount } from "@/lib/marketing/google/sync";
import type { Db } from "@/lib/marketing/db";
import type { Appointment, Contact, Prospect } from "@/lib/marketing/types";
import { CalendarView, type CalItem, type Tone } from "./calendar-view";
import { addDays, dayOf, hhmm, isDay, rangeOf, type CalView } from "./dates";

export const metadata: Metadata = { title: "Calendrier" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
interface EventRow { id: string; profile_id: string; google_event_id?: string | null; calendar_name: string | null; title: string | null; starts_at: string; ends_at: string; all_day: boolean; kind: "rdv" | "bloque"; contact_id: string | null; appointment_id: string | null; html_link: string | null }
const FLASH: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Compte Google connecté. Choisis les agendas à afficher dans « Mon agenda Google »." },
  refuse: { tone: "warn", text: "Connexion annulée : l'accès n'a pas été accordé dans Google." },
  config: { tone: "warn", text: "Google n'est pas encore configuré sur l'hébergeur (voir « Mon agenda Google »)." },
  etat: { tone: "warn", text: "La connexion a expiré ou a été lancée depuis un autre navigateur. Recommence." },
  sans_jeton: { tone: "warn", text: "Google n'a pas renvoyé de jeton de renouvellement. Retire l'accès de l'application dans ton compte Google (myaccount.google.com/permissions), puis reconnecte-toi." },
  portee: { tone: "warn", text: "La lecture des agendas n'a pas été accordée : la case doit rester cochée sur l'écran de Google." },
  erreur: { tone: "warn", text: "La connexion à Google a échoué. Réessaie dans un instant." },
  droits: { tone: "warn", text: "Le module Calendrier n'est pas accordé à ton compte." },
};
const VIEWS: CalView[] = ["mois", "semaine", "liste"];
const SOURCE: Record<string, string> = { iclosed: "iClosed", interne: "pris dans l'app", manuel: "saisi à la main", import: "import GoHighLevel", google: "Google Agenda" };
const minutesBetween = (a: string, b: string) => Math.max(15, Math.round((Date.parse(b) - Date.parse(a)) / 60_000));

/** Statut affiché d'un rendez-vous confirmé : le résultat saisi, sinon « Confirmé » (à venir) ou « Résultat à saisir » (passé). */
function apptStatus(a: Appointment, now: number): { label: string; tone: Tone } {
  switch (a.result) {
    case "present": return { label: "Présent", tone: "ok" };
    case "absent": return { label: "Absent", tone: "bad" };
    case "reporte": return { label: "Reporté", tone: "warn" };
    case "annule": return { label: "Annulé", tone: "muted" };
    default: return Date.parse(a.ends_at) < now ? { label: "Résultat à saisir", tone: "warn" } : { label: "Confirmé", tone: "ok" };
  }
}
/** Lignes lues par identifiants, par paquets de 100 (la requête reste courte). */
async function byIds<T>(db: Db, table: string, ids: string[], columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...(await db.list<T>(table, { where: [["in", "id", chunk]], limit: chunk.length, columns })));
  }
  return out;
}

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_calendrier");
  const settings = await crm.store.settings(), tz = settings.timezone;
  const now = new Date(), t = partsInZone(now, tz), today = dayOf(t.y, t.mo, t.d);

  // Adresse : ?vue=mois|semaine|liste&jour=AAAA-MM-JJ&membre=… (l'ancienne ?semaine=AAAA-MM-JJ reste comprise).
  const legacy = one(sp.semaine), asked = one(sp.vue) as CalView;
  const view: CalView = VIEWS.includes(asked) ? asked : isDay(legacy) ? "semaine" : "mois";
  const day = isDay(one(sp.jour)) ? one(sp.jour) : isDay(legacy) ? legacy : today;
  const { first, last } = rangeOf(view, day);
  const midnight = (d: string) => { const [y, mo, dd] = d.split("-").map(Number); return zonedTimeToUtc(y, mo, dd, 0, 0, tz); };
  const from = midnight(first).toISOString(), to = midnight(addDays(last, 1)).toISOString();

  const role = salesRole(crm.session), me = crm.session.user.id;
  const canBook = canAccess(crm.session.profile, "marketing_prospects");
  // Lus sous les droits du membre : un setter ou un closer ne reçoit que ses rendez-vous et son propre agenda Google.
  const [appts, events, team, google, slots] = await Promise.all([
    crm.db.list<Appointment>("marketing_appointments", { where: [["eq", "status", "confirme"], ["gte", "starts_at", from], ["lt", "starts_at", to]], order: ["starts_at", "asc"], limit: 3000 }).catch(() => [] as Appointment[]),
    crm.db.list<EventRow>("marketing_calendar_events", { where: [["lt", "starts_at", to], ["gt", "ends_at", from]], order: ["starts_at", "asc"], limit: 3000 }).catch(() => [] as EventRow[]),
    members(),
    myGoogleAccount(me),
    // Créneaux libres proposés dans « Nouveau rendez-vous » : seulement si des disponibilités sont réglées.
    canBook && settings.slot_minutes && settings.availability.length ? crm.store.availableSlots(60).catch(() => []) : Promise.resolve([]),
  ]);
  const prospects = await byIds<Prospect>(crm.db, "marketing_prospects", [...new Set(appts.map((a) => a.prospect_id))], "id,name,email,contact_id,setter_id,closer_id").catch(() => [] as Prospect[]);
  const prospect = new Map(prospects.map((p) => [p.id, p]));
  const contactIds = [...new Set([...appts.map((a) => a.contact_id ?? prospect.get(a.prospect_id)?.contact_id), ...events.map((e) => e.contact_id)].filter((x): x is string => !!x))];
  const contacts = await byIds<Contact>(crm.db, "marketing_contacts", contactIds, "id,name,email").catch(() => [] as Contact[]);
  const contact = new Map(contacts.map((c) => [c.id, c])), name = new Map(team.map((m) => [m.id, m.name]));
  const place = (iso: string) => { const p = partsInZone(new Date(iso), tz); return { day: dayOf(p.y, p.mo, p.d), minutes: p.h * 60 + p.mi }; };

  const items: CalItem[] = [];
  for (const a of appts) {
    const p = prospect.get(a.prospect_id), cid = a.contact_id ?? p?.contact_id ?? null, c = cid ? contact.get(cid) : undefined, s = place(a.starts_at);
    const who = c?.name ?? p?.name ?? c?.email ?? p?.email ?? null;
    const closer = a.closer_id ?? p?.closer_id ?? null, setter = a.setter_id ?? p?.setter_id ?? null;
    // Importé de Google sans closer ni setter : le membre dont c'est l'agenda.
    const owner = a.source === "google" && !closer && !setter && a.created_by && name.has(a.created_by) ? a.created_by : null;
    const lead = closer && name.has(closer) ? `Closer : ${name.get(closer)}` : setter && name.has(setter) ? `Setter : ${name.get(setter)}` : owner ? `Agenda de ${name.get(owner)}` : null;
    items.push({
      id: `a-${a.id}`, kind: "rdv", title: who ?? a.title ?? "Rendez-vous",
      subtitle: [a.title && a.title !== who ? a.title : null, SOURCE[a.source ?? "interne"] ?? a.source, role ? null : lead].filter(Boolean).join(" · "),
      status: apptStatus(a, now.getTime()), day: s.day, start: s.minutes, minutes: minutesBetween(a.starts_at, a.ends_at), allDay: false,
      members: [...new Set([a.closer_id, a.setter_id, p?.closer_id, p?.setter_id, owner].filter((x): x is string => !!x))],
      href: `/marketing/crm/${a.prospect_id}`, external: null,
    });
  }
  // Le même événement dans les agendas de deux membres : une seule fois, au nom des deux.
  const owners = new Map<string, string[]>(), shown: EventRow[] = [];
  for (const e of events) {
    if (e.appointment_id) continue;   // déjà affiché comme rendez-vous de l'app : une seule fois
    const key = e.google_event_id ?? e.id, seen = owners.get(key);
    if (seen) { if (!seen.includes(e.profile_id)) seen.push(e.profile_id); continue; }
    owners.set(key, [e.profile_id]); shown.push(e);
  }
  for (const e of shown) {
    const c = e.contact_id ? contact.get(e.contact_id) : undefined, who = owners.get(e.google_event_id ?? e.id) ?? [e.profile_id];
    const base = {
      kind: e.kind, title: e.title ?? (e.kind === "bloque" ? "Créneau bloqué" : "Rendez-vous"),
      subtitle: [c ? `Contact : ${c.name ?? c.email}` : null, e.calendar_name ?? "Google Agenda", role ? null : who.map((id) => name.get(id)).filter(Boolean).join(", ") || null].filter(Boolean).join(" · "),
      status: e.kind === "bloque" ? { label: "Bloqué", tone: "muted" as const } : { label: "Google", tone: "info" as const },
      members: who, href: c ? `/marketing/contacts/${c.id}` : null, external: e.html_link,
    };
    if (e.all_day) {
      // Journée entière : les dates telles que Google les donne (fin exclue), sur chaque jour couvert.
      const startDay = e.starts_at.slice(0, 10), lastDay = addDays(e.ends_at.slice(0, 10), -1);
      for (let d = startDay, k = 0; k < 62 && (d <= lastDay || k === 0); d = addDays(d, 1), k++) if (d >= first && d <= last) items.push({ ...base, id: `g-${e.id}-${d}`, day: d, start: 0, minutes: 0, allDay: true });
    } else {
      const s = place(e.starts_at);
      items.push({ ...base, id: `g-${e.id}`, day: s.day, start: s.minutes, minutes: minutesBetween(e.starts_at, e.ends_at), allDay: false });
    }
  }

  const pickList = role ? [] : team.filter((m) => m.marketing_role !== "media_buyer").map((m) => ({ id: m.id, name: m.name }));
  const wanted = one(sp.membre), member = pickList.some((m) => m.id === wanted) ? wanted : "";
  const free = slots.slice(0, 600).map((s) => { const a = place(s.start); return { day: a.day, time: hhmm(a.minutes), minutes: minutesBetween(s.start, s.end) }; });

  return (
    <CalendarView key={`${view}|${first}`} view={view} day={day} today={today} nowMinutes={t.h * 60 + t.mi} first={first} last={last}
      items={items} members={pickList} me={{ id: me, name: name.get(me) ?? crm.session.profile.display_name ?? crm.session.user.email }} pickMember={!role} member={member}
      timezone={tz} canBook={canBook} slotMinutes={settings.slot_minutes} slots={free}
      google={{ account: google, ready: googleReady(), env: isAdmin(crm.session) ? googleEnv() : null, noDatabase: crm.demo }} flash={FLASH[one(sp.google)] ?? null} />
  );
}
