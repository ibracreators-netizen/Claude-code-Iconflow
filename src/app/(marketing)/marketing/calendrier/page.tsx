import type { Metadata } from "next";
import { crmPage, isAdmin, members } from "@/lib/marketing/crm-server";
import { partsInZone, zonedTimeToUtc } from "@/lib/marketing/slots";
import { googleEnv, googleReady, myGoogleAccount } from "@/lib/marketing/google/sync";
import type { Contact, Prospect } from "@/lib/marketing/types";
import { CALL_RESULT } from "@/lib/marketing/types";
import { PageHeader } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { CalendarView, type CalItem } from "./calendar-view";
import { GooglePanel } from "./google-panel";

export const metadata: Metadata = { title: "Calendrier" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
interface EventRow { id: string; profile_id: string; calendar_name: string | null; title: string | null; starts_at: string; ends_at: string; all_day: boolean; kind: "rdv" | "bloque"; contact_id: string | null; appointment_id: string | null; html_link: string | null }
const FLASH: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Compte Google connecté. Choisis ci-dessous les agendas à afficher." },
  refuse: { tone: "warn", text: "Connexion annulée : l'accès n'a pas été accordé dans Google." },
  config: { tone: "warn", text: "Google n'est pas encore configuré sur l'hébergeur (voir les variables ci-dessous)." },
  etat: { tone: "warn", text: "La connexion a expiré ou a été lancée depuis un autre navigateur. Recommence." },
  sans_jeton: { tone: "warn", text: "Google n'a pas renvoyé de jeton de renouvellement. Retire l'accès de l'application dans ton compte Google (myaccount.google.com/permissions), puis reconnecte-toi." },
  portee: { tone: "warn", text: "La lecture des agendas n'a pas été accordée : la case doit rester cochée sur l'écran de Google." },
  erreur: { tone: "warn", text: "La connexion à Google a échoué. Réessaie dans un instant." },
  droits: { tone: "warn", text: "Le module Calendrier n'est pas accordé à ton compte." },
};

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_calendrier");
  const settings = await crm.store.settings(), tz = settings.timezone;
  const view = one(sp.vue) === "liste" ? "liste" : "semaine";

  // Semaine affichée : du lundi au dimanche, dans le fuseau des réglages.
  const now = new Date();
  const today = partsInZone(now, tz);
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.semaine)) ? one(sp.semaine).split("-").map(Number) : [today.y, today.mo, today.d];
  const ref = new Date(Date.UTC(asked[0], asked[1] - 1, asked[2], 12));
  const monday = new Date(ref.getTime() - ((ref.getUTCDay() + 6) % 7) * 86_400_000);
  const dayAt = (i: number) => new Date(monday.getTime() + i * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const from = view === "liste" ? now : zonedTimeToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, tz);
  const to = new Date(from.getTime() + (view === "liste" ? 30 : 7) * 86_400_000);

  const [appts, events, team, prospects, contacts, google] = await Promise.all([
    crm.store.appointments({ from: from.toISOString(), to: to.toISOString() }).catch(() => []),
    crm.db.list<EventRow>("marketing_calendar_events", { where: [["gte", "starts_at", new Date(from.getTime() - 86_400_000).toISOString()], ["lt", "starts_at", to.toISOString()]], order: ["starts_at", "asc"], limit: 2000 }).catch(() => [] as EventRow[]),
    members(), crm.db.list<Prospect>("marketing_prospects").catch(() => [] as Prospect[]), crm.db.list<Contact>("marketing_contacts").catch(() => [] as Contact[]),
    myGoogleAccount(crm.session.user.id),
  ]);
  const prospect = new Map(prospects.map((p) => [p.id, p])), contact = new Map(contacts.map((c) => [c.id, c]));
  const place = (iso: string) => { const p = partsInZone(new Date(iso), tz); return { day: ymd(new Date(Date.UTC(p.y, p.mo - 1, p.d))), minutes: p.h * 60 + p.mi }; };

  const items: CalItem[] = [];
  for (const a of appts) {
    if (a.status !== "confirme") continue;
    const p = prospect.get(a.prospect_id), c = (a.contact_id ?? p?.contact_id) ? contact.get((a.contact_id ?? p?.contact_id)!) : null, s = place(a.starts_at);
    items.push({ id: `a-${a.id}`, kind: "rdv", title: c?.name ?? p?.name ?? c?.email ?? p?.email ?? "Rendez-vous", subtitle: [a.title, a.source === "iclosed" ? "iClosed" : a.source === "interne" || !a.source ? "pris dans l'app" : a.source, a.result && a.result !== "a_venir" ? CALL_RESULT[a.result] : null].filter(Boolean).join(" · "),
      starts_at: a.starts_at, ends_at: a.ends_at, day: s.day, start: s.minutes, minutes: Math.max(15, Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000)), allDay: false,
      member: a.closer_id ?? a.setter_id ?? p?.closer_id ?? p?.setter_id ?? null, calendar: a.source === "iclosed" ? "iClosed" : "Rendez-vous de l'app", href: `/marketing/prospects/${a.prospect_id}`, external: null });
  }
  for (const e of events) {
    if (e.appointment_id) continue;   // déjà affiché comme rendez-vous : une seule fois
    if (Date.parse(e.ends_at) <= from.getTime()) continue;
    const c = e.contact_id ? contact.get(e.contact_id) : null, s = place(e.starts_at);
    items.push({ id: `g-${e.id}`, kind: e.kind, title: e.title ?? (e.kind === "bloque" ? "Créneau bloqué" : "Rendez-vous"), subtitle: [c ? `Contact : ${c.name ?? c.email}` : null, e.calendar_name].filter(Boolean).join(" · "),
      starts_at: e.starts_at, ends_at: e.ends_at, day: s.day, start: e.all_day ? 0 : s.minutes, minutes: e.all_day ? 0 : Math.max(15, Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000)), allDay: e.all_day,
      member: e.profile_id, calendar: e.calendar_name ?? "Google Agenda", href: c ? `/marketing/contacts/${c.id}` : null, external: e.html_link });
  }
  items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const flash = FLASH[one(sp.google)];
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Calendrier" description="Les rendez-vous de l'outil de réservation et les agendas Google de l'équipe, en lecture seule. Un même rendez-vous n'apparaît qu'une fois." actions={crm.demo ? <DemoBadge /> : undefined} />
      {flash ? <p role="status" className={`mb-4 rounded-lg border px-3 py-2.5 text-[13px] ${flash.tone === "ok" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>{flash.text}</p> : null}
      <CalendarView items={items} members={team.map((m) => ({ id: m.id, name: m.name }))} view={view} week={{ monday: ymd(monday), days: Array.from({ length: 7 }, (_, i) => ymd(dayAt(i))), prev: ymd(dayAt(-7)), next: ymd(dayAt(7)), today: ymd(new Date(Date.UTC(today.y, today.mo - 1, today.d))) }} timezone={tz} />
      <GooglePanel account={google} ready={googleReady()} env={isAdmin(crm.session) ? googleEnv() : null} noDatabase={crm.demo} />
    </>
  );
}
