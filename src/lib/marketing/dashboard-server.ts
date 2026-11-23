import "server-only";
import { after } from "next/server";
import { canAccess } from "@/lib/permissions";
import type { Db } from "./db";
import { members, salesRole, stagesFor, type Crm } from "./crm-server";
import { canSeeKpiLinkEntries, kpiLinkData } from "./kpi-links-server";
import { googleReady, myGoogleAccount, syncGoogleDue } from "./google/sync";
import type { Appointment, Contact, KpiEntry, Member, Prospect } from "./types";

/*
 * Tableau de bord Marketing, côté serveur : ce que l'équipe déclare chaque jour (membres et liens de saisie),
 * les appels des prochains jours (rendez-vous de l'app et agendas Google) et un petit état des prospects.
 * Tout est lu sous les droits de la personne connectée : un setter ou un closer ne reçoit que ses propres lignes.
 */

/* ─────────────────────────── Performances déclarées ─────────────────────────── */

export type PersonRole = "setter" | "closer" | "media_buyer" | "admin" | "equipe";
/** Une personne qui saisit (ou doit saisir) ses chiffres : un membre (`m:<id>`) ou une personne autorisée par lien (`l:<id>`). */
export interface Person {
  who: string; name: string; role: PersonRole; viaLink: boolean;
  /** Fiche du membre (Équipe), pour qui gère l'équipe. */
  href: string | null;
  /** Attendu chaque jour : setters et closers membres, personnes actives par lien. */
  expected: boolean;
  /** Dernière saisie connue (horodatage), si on la connaît. */
  lastEntryAt: string | null;
}
/** Une saisie d'un jour, membre ou lien confondus. */
export interface DeclaredRow { who: string; day: string; at: string; metrics: Record<string, unknown> }
export interface DeclaredData {
  /** `equipe` : toute l'équipe (membre de l'agence avec le droit KPI) ; `moi` : ses propres chiffres (setter, closer) ; `aucun` : pas le droit KPI. */
  scope: "equipe" | "moi" | "aucun";
  rows: DeclaredRow[]; people: Person[];
  /** Migration 0026 absente : aucune saisie de membre ne peut être lue. */
  membersMissing: boolean;
  /** Migration 0028 absente : les saisies faites par lien ne sont pas comptées. */
  linksMissing: boolean;
  /** Lecture plafonnée atteinte : les jours les plus anciens peuvent manquer. */
  truncated: boolean;
}

/** Saisies lues au plus, par source (membres, liens). Bien au-delà d'une équipe de dix personnes sur 180 jours. */
const READ_MAX = 6000;
const roleOf = (m: Member): PersonRole => m.marketing_role ?? (m.admin ? "admin" : "equipe");

/**
 * Saisies des membres (0026) et des personnes autorisées par lien (0028) depuis `fromDay`, avec les personnes concernées.
 * Pour un commercial, la base ne renvoie que ses propres saisies et aucune saisie par lien.
 */
export async function declaredData(crm: Crm, fromDay: string): Promise<DeclaredData> {
  const profile = crm.session.profile, me = crm.session.user.id, role = salesRole(crm.session);
  const scope: DeclaredData["scope"] = !canAccess(profile, "marketing_classement") ? "aucun" : role ? "moi" : canSeeKpiLinkEntries(crm) ? "equipe" : "moi";
  if (scope === "aucun") return { scope, rows: [], people: [], membersMissing: false, linksMissing: false, truncated: false };

  const [mine, links, team] = await Promise.all([
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", fromDay]], order: ["day", "desc"], limit: READ_MAX }).catch(() => null),
    scope === "equipe" ? kpiLinkData(crm, fromDay, READ_MAX).catch(() => null) : Promise.resolve({ names: [], entries: [] }),
    members(),
  ]);
  // Un commercial ne voit que lui, même si une saisie d'un autre arrivait jusqu'ici.
  const memberRows = (mine ?? []).filter((e) => scope === "equipe" || e.profile_id === me);
  const rows: DeclaredRow[] = [
    ...memberRows.map((e) => ({ who: `m:${e.profile_id}`, day: e.day, at: e.updated_at || e.created_at, metrics: e.metrics ?? {} })),
    ...(links?.entries ?? []).map((e) => ({ who: `l:${e.person_id}`, day: e.day, at: e.updated_at || e.created_at, metrics: e.metrics ?? {} })),
  ];

  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.who) || r.at > latest.get(r.who)!) latest.set(r.who, r.at);
  const withRows = new Set(rows.map((r) => r.who));
  const byId = new Map(team.map((m) => [m.id, m]));
  const manages = scope === "equipe" && canAccess(profile, "marketing_equipe");
  const people: Person[] = [];
  const memberPerson = (id: string, m: Member | undefined, fallback: string): Person => {
    const r = m ? roleOf(m) : "equipe";
    return { who: `m:${id}`, name: m?.name ?? fallback, role: r, viaLink: false, href: manages && m ? `/marketing/equipe/${id}` : null, expected: r === "setter" || r === "closer", lastEntryAt: latest.get(`m:${id}`) ?? null };
  };
  if (scope === "moi") {
    const self = byId.get(me);
    people.push({ ...memberPerson(me, self, crm.session.profile.display_name || "Moi"), role: role ?? (self ? roleOf(self) : "equipe"), expected: true });
  } else {
    for (const m of team) if (m.marketing_role === "setter" || m.marketing_role === "closer" || withRows.has(`m:${m.id}`)) people.push(memberPerson(m.id, m, m.name));
    for (const who of withRows) if (who.startsWith("m:") && !byId.has(who.slice(2))) people.push(memberPerson(who.slice(2), undefined, "Ancien membre"));
    for (const n of links?.names ?? []) {
      const who = `l:${n.id}`;
      if (!n.active && !withRows.has(who)) continue;
      people.push({ who, name: n.name, role: n.role, viaLink: true, href: null, expected: n.active, lastEntryAt: latest.get(who) ?? n.last_entry_at ?? null });
    }
    const named = new Set(people.map((p) => p.who));
    for (const who of withRows) if (who.startsWith("l:") && !named.has(who)) people.push({ who, name: "Personne supprimée", role: "equipe", viaLink: true, href: null, expected: false, lastEntryAt: latest.get(who) ?? null });
  }
  return {
    scope, rows, people,
    membersMissing: mine === null, linksMissing: scope === "equipe" && links === null,
    truncated: (mine?.length ?? 0) >= READ_MAX || (links?.entries.length ?? 0) >= READ_MAX,
  };
}

/* ─────────────────────────── Appels à venir ─────────────────────────── */

export interface UpcomingCall {
  id: string; startsAt: string; endsAt: string;
  /** Nom du prospect ou du contact, sinon le titre de l'événement. */
  title: string; detail: string | null;
  /** Membres concernés (pour le filtre Setters / Closers) et le nom affiché. */
  memberIds: string[]; memberName: string | null;
  source: "app" | "google"; sourceDetail: string | null;
  /** Fiche dans l'app (prospect ou contact), sinon l'événement dans Google Agenda. */
  href: string | null; external: string | null; joinUrl: string | null;
}
export interface UpcomingData {
  /** `false` : le Calendrier n'est pas accordé à ce compte (la base ne renverrait rien). */
  allowed: boolean;
  calls: UpcomingCall[];
  google: { ready: boolean; connected: boolean; invalid: boolean; lastSync: string | null };
}
interface EventRow { id: string; profile_id: string; calendar_name: string | null; title: string | null; starts_at: string; ends_at: string; all_day: boolean; kind: "rdv" | "bloque"; contact_id: string | null; appointment_id: string | null; html_link: string | null }
const SOURCE: Record<string, string> = { iclosed: "iClosed", interne: "Pris dans l'app", manuel: "Saisi à la main", import: "Import GoHighLevel" };
const httpUrl = (u: string | null | undefined) => (u && /^https:\/\//i.test(u.trim()) ? u.trim() : null);

async function byIds<T>(db: Db, table: string, ids: string[], columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...(await db.list<T>(table, { where: [["in", "id", chunk]], limit: chunk.length, columns })));
  }
  return out;
}

/**
 * Appels de `now` à `until` : les rendez-vous confirmés de l'app et les événements Google avec au moins un invité
 * (un créneau bloqué n'est pas un appel ; un événement déjà relié à un rendez-vous de l'app n'est montré qu'une fois).
 */
export async function upcomingCalls(crm: Crm, opts: { now: Date; until: Date }): Promise<UpcomingData> {
  const profile = crm.session.profile, me = crm.session.user.id;
  const ready = googleReady();
  const account = ready ? await myGoogleAccount(me).catch(() => null) : null;
  const google = { ready, connected: !!account?.connected, invalid: account?.status === "invalide", lastSync: account?.lastSync ?? null };
  if (!canAccess(profile, "marketing_calendrier")) return { allowed: false, calls: [], google };

  const nowIso = opts.now.toISOString(), untilIso = opts.until.toISOString();
  // Un appel commencé il y a moins de trois heures peut être encore en cours : on le garde s'il n'est pas fini.
  const since = new Date(opts.now.getTime() - 3 * 3_600_000).toISOString();
  const [appts, events, team] = await Promise.all([
    crm.db.list<Appointment>("marketing_appointments", { where: [["eq", "status", "confirme"], ["gte", "starts_at", since], ["lt", "starts_at", untilIso]], order: ["starts_at", "asc"], limit: 500 }).catch(() => [] as Appointment[]),
    crm.db.list<EventRow>("marketing_calendar_events", { where: [["lt", "starts_at", untilIso], ["gt", "ends_at", nowIso]], order: ["starts_at", "asc"], limit: 500 }).catch(() => [] as EventRow[]),
    members(),
  ]);
  const live = appts.filter((a) => a.ends_at > nowIso && (a.result ?? "a_venir") === "a_venir");
  const calls = events.filter((e) => e.kind === "rdv" && !e.all_day && !e.appointment_id);
  const prospects = await byIds<Prospect>(crm.db, "marketing_prospects", [...new Set(live.map((a) => a.prospect_id))], "id,name,email,contact_id,setter_id,closer_id").catch(() => [] as Prospect[]);
  const prospect = new Map(prospects.map((p) => [p.id, p]));
  const contactIds = [...new Set([...live.map((a) => a.contact_id ?? prospect.get(a.prospect_id)?.contact_id), ...calls.map((e) => e.contact_id)].filter((x): x is string => !!x))];
  const contacts = await byIds<Contact>(crm.db, "marketing_contacts", contactIds, "id,name,email").catch(() => [] as Contact[]);
  const contact = new Map(contacts.map((c) => [c.id, c])), name = new Map(team.map((m) => [m.id, m.name]));
  const canProspects = canAccess(profile, "marketing_prospects"), canContacts = canAccess(profile, "marketing_contacts");

  const out: UpcomingCall[] = [];
  for (const a of live) {
    const p = prospect.get(a.prospect_id), cid = a.contact_id ?? p?.contact_id ?? null, c = cid ? contact.get(cid) : undefined;
    const who = c?.name ?? p?.name ?? c?.email ?? p?.email ?? null;
    const closer = a.closer_id ?? p?.closer_id ?? null, setter = a.setter_id ?? p?.setter_id ?? null;
    const lead = closer && name.has(closer) ? closer : setter && name.has(setter) ? setter : null;
    out.push({
      id: `a-${a.id}`, startsAt: a.starts_at, endsAt: a.ends_at, title: who ?? a.title ?? "Rendez-vous", detail: a.title && a.title !== who ? a.title : null,
      memberIds: [...new Set([closer, setter].filter((x): x is string => !!x))], memberName: lead ? name.get(lead) ?? null : null,
      source: "app", sourceDetail: SOURCE[a.source ?? "interne"] ?? null,
      href: canProspects ? `/marketing/crm/${a.prospect_id}` : null, external: null, joinUrl: httpUrl(a.meeting_url),
    });
  }
  for (const e of calls) {
    const c = e.contact_id ? contact.get(e.contact_id) : undefined, who = c?.name ?? c?.email ?? null;
    out.push({
      id: `g-${e.id}`, startsAt: e.starts_at, endsAt: e.ends_at, title: who ?? e.title ?? "Rendez-vous", detail: who && e.title && e.title !== who ? e.title : null,
      memberIds: [e.profile_id], memberName: name.get(e.profile_id) ?? null,
      source: "google", sourceDetail: e.calendar_name,
      href: c && canContacts ? `/marketing/contacts/${c.id}` : null, external: httpUrl(e.html_link), joinUrl: null,
    });
  }
  out.sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.title.localeCompare(y.title, "fr"));
  return { allowed: true, calls: out, google };
}

/**
 * Sans planificateur, les agendas Google se mettent à jour quand le Tableau de bord s'affiche : APRÈS la réponse
 * (la page n'attend pas), les comptes dont la copie date de plus de dix minutes sont relus, deux au plus.
 * Une seule relance par minute et par serveur : plusieurs onglets ouverts ne relisent pas le même compte en même temps.
 */
const kick = globalThis as unknown as { __iconflowGoogleKick?: number };
export function refreshGoogleAfterResponse(): void {
  if (!googleReady()) return;
  const now = Date.now();
  if (now - (kick.__iconflowGoogleKick ?? 0) < 60_000) return;
  kick.__iconflowGoogleKick = now;
  after(async () => {
    await syncGoogleDue({ limit: 2 }).catch((e) => console.error("[google] synchronisation depuis le Tableau de bord :", e instanceof Error ? e.message : e));
  });
}

/* ─────────────────────────── Prospects (petit état) ─────────────────────────── */

export interface ProspectSummary { open: number; signed: number; amount: number }
/**
 * Prospects en cours (étape « ouverte ») et signés sur la période (passés à une étape « Gagné » depuis `fromIso`),
 * avec la somme de leurs montants signés HT. Lus sous les droits du compte : un commercial ne compte que les siens.
 * `null` sans accès aux Prospects.
 */
export async function prospectSummary(crm: Crm, fromIso: string): Promise<ProspectSummary | null> {
  if (!canAccess(crm.session.profile, "marketing_prospects")) return null;
  try {
    const stages = await stagesFor(crm);
    const open = stages.filter((s) => s.kind === "ouvert").map((s) => s.id), won = stages.filter((s) => s.kind === "gagne").map((s) => s.id);
    const [count, signed] = await Promise.all([
      open.length ? crm.db.count("marketing_prospects", [["in", "stage_id", open]]) : Promise.resolve(0),
      won.length ? crm.db.list<Pick<Prospect, "id" | "signed_amount">>("marketing_prospects", { where: [["in", "stage_id", won], ["gte", "stage_changed_at", fromIso]], columns: "id,signed_amount", limit: 5000 }) : Promise.resolve([]),
    ]);
    return { open: count, signed: signed.length, amount: Math.round(signed.reduce((s, p) => s + (Number(p.signed_amount) || 0), 0) * 100) / 100 };
  } catch { return null; }
}
