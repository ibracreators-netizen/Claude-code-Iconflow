import "server-only";
import { cache } from "react";
import { allowedModulesIn, canAccess, type ModuleKey } from "@/lib/permissions";
import { crmPage, facts, salesRole, type Crm } from "./crm-server";
import { requireMarketingSpace } from "./session";
import { listStages } from "./crm";
import { buildFunnel } from "./funnel";
import { readBeat } from "./inbox";
import { schedulerState } from "./inbox-core";
import { calendar, dayRange, todoSummary, type TodoSummary } from "./todo-server";
import { euro } from "./ui";
import type { Db } from "./db";
import type { MarketingStore } from "./store";
import type { Contact, MarketingTask, Prospect, Stage } from "./types";

/*
 * Lectures de l'Accueil, des Notifications et de Rechercher (espace Marketing).
 * Tout passe par la base de la session : un setter ou un closer ne lit que ce qui lui est attribué (RLS en
 * production, même filtre sans base). Aucun chiffre n'est inventé : une lecture qui échoue retire sa tuile.
 */

/** Page ouverte à tout membre de l'espace (Rechercher, Notifications) : l'accès aux données de la session et ses droits. */
export interface MemberCrm { store: MarketingStore; crm: Crm | null; can: (m: ModuleKey) => boolean }
export async function memberCrm(): Promise<MemberCrm> {
  const store = await requireMarketingSpace();
  const profile = store.session.profile;
  // La base de la session ne dépend pas du module : on passe par le premier module permis (il y en a au moins un).
  const first = allowedModulesIn(profile, "marketing")[0];
  return { store, can: (m) => canAccess(profile, m), crm: first ? await crmPage(first) : null };
}

/** Prénom pour « Bienvenue, … » : premier mot du nom affiché, sinon le début de l'adresse email. */
export function firstName(displayName: string | null | undefined, email: string): string {
  const raw = displayName?.trim().split(/\s+/)[0] || email.split("@")[0] || "";
  return raw ? raw[0].toUpperCase() + raw.slice(1) : "";
}

/** Début et fin du jour en cours dans le fuseau de l'équipe (instants UTC). */
export function dayBounds(tz: string, now = new Date()): { start: string; end: string } { return dayRange(tz, now); }

/**
 * Ce qui attend le membre connecté (tâches, prochaines actions, rendez-vous du jour, résultats d'appel à saisir),
 * sur la même base que Tâches › Éléments à faire. Lu une fois par requête : la cloche du cadre, la tuile Tâches de
 * l'Accueil, la page Notifications et le Tableau de bord s'en servent. null : pas d'accès aux Tâches.
 */
export const myTodoSummary = cache(async (tz: string): Promise<TodoSummary | null> => {
  const store = await requireMarketingSpace();
  if (!canAccess(store.session.profile, "marketing_taches")) return null;
  return todoSummary(await crmPage("marketing_taches"), { who: store.session.user.id, role: salesRole(store.session), tz });
});

const DAY = 86_400_000;
const uniqById = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

/* ─────────────────────────── Accueil : les quatre tuiles ─────────────────────────── */

export type HomeTileKey = "taches" | "pipeline" | "prospects" | "rdv" | "contacts" | "leads" | "rdvPris";
/** `late` : tâches dont l'échéance est passée (tuile Tâches). */
export interface HomeTile { key: HomeTileKey; value: number; late?: number }

/** Tuiles possibles, dans l'ordre : une tuile dont le module n'est pas permis laisse sa place à la suivante. */
const TILES: Array<{ key: HomeTileKey; module: ModuleKey }> = [
  { key: "taches", module: "marketing_taches" },
  { key: "pipeline", module: "marketing_prospects" },
  { key: "prospects", module: "marketing_prospects" },
  { key: "rdv", module: "marketing_calendrier" },
  { key: "contacts", module: "marketing_contacts" },
  { key: "leads", module: "marketing_dashboard" },
  { key: "rdvPris", module: "marketing_dashboard" },
];

export async function homeTiles(crm: Crm, can: (m: ModuleKey) => boolean, tz: string): Promise<HomeTile[]> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY).toISOString(), { start, end } = dayBounds(tz, new Date(now));
  // Lectures partagées entre deux tuiles : faites une seule fois, et seulement si une tuile en a besoin.
  type Recent = Pick<Prospect, "id" | "value" | "stage_id">;
  let recentP: Promise<Recent[]> | null = null;
  const recent = () => (recentP ??= crm.db.list<Recent>("marketing_prospects", { where: [["gte", "created_at", since]], columns: "id,value,stage_id" }));
  // Leads et RDV pris : le même calcul que le Tableau de bord sur 30 jours (cohorte des leads arrivés), pour que les chiffres concordent.
  let cohortP: Promise<{ leads: number; booked: number }> | null = null;
  const cohort = () => (cohortP ??= facts(crm).then((f) => buildFunnel({
    prospects: f.prospects, appointments: f.appointments, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id),
    from: since, to: new Date(now + 60_000).toISOString(), by: "landing_page",
  }).total));

  const load: Record<HomeTileKey, () => Promise<HomeTile>> = {
    // À faire aujourd'hui : les éléments en retard, du jour ou sans date de Tâches › Éléments à faire (tâches,
    // prochaines actions, rendez-vous du jour, résultats d'appel à saisir).
    taches: async () => {
      const todo = await myTodoSummary(tz);
      if (!todo) throw new Error("accès aux tâches refusé");
      return { key: "taches", value: todo.today, late: todo.late };
    },
    // Valeur des affaires en cours seulement : un prospect gagné ou perdu n'est plus dans le pipeline.
    pipeline: async () => {
      const [rows, stages] = await Promise.all([recent(), listStages(crm.db, { includeInactive: true })]);
      const closed = new Set(stages.filter((s) => s.kind !== "ouvert").map((s) => s.id));
      return { key: "pipeline", value: rows.filter((p) => !(p.stage_id && closed.has(p.stage_id))).reduce((s, p) => s + (Number(p.value) || 0), 0) };
    },
    prospects: async () => ({ key: "prospects", value: (await recent()).length }),
    rdv: async () => ({ key: "rdv", value: await crm.db.count("marketing_appointments", [["eq", "status", "confirme"], ["gte", "starts_at", start], ["lt", "starts_at", end]]) }),
    contacts: async () => ({ key: "contacts", value: await crm.db.count("marketing_contacts", [["gte", "created_at", since]]) }),
    // Media buyer : des chiffres sans coordonnées (mêmes faits que l'entonnoir du tableau de bord).
    leads: async () => ({ key: "leads", value: (await cohort()).leads }),
    rdvPris: async () => ({ key: "rdvPris", value: (await cohort()).booked }),
  };

  const permitted = TILES.filter((t) => can(t.module));
  const out: HomeTile[] = [];
  for (let i = 0; i < permitted.length && out.length < 4;) {
    const batch = permitted.slice(i, i + 4 - out.length);
    i += batch.length;
    const got = await Promise.all(batch.map((t) => load[t.key]().catch((e) => { console.error(`[accueil] tuile ${t.key} :`, e instanceof Error ? e.message : e); return null; })));
    out.push(...got.filter((t): t is HomeTile => t !== null));
  }
  return out;
}

/* ─────────────────────────── Noms affichés (tâches, rendez-vous) ─────────────────────────── */

async function prospectNames(crm: Crm, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const prospects = await crm.db.list<Pick<Prospect, "id" | "name" | "email" | "contact_id">>("marketing_prospects", { where: [["in", "id", [...new Set(ids)]]], columns: "id,name,email,contact_id" }).catch(() => []);
  const cIds = [...new Set(prospects.map((p) => p.contact_id).filter((x): x is string => !!x))];
  const contacts = cIds.length ? await crm.db.list<Pick<Contact, "id" | "name" | "email">>("marketing_contacts", { where: [["in", "id", cIds]], columns: "id,name,email" }).catch(() => []) : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  for (const p of prospects) { const c = p.contact_id ? byId.get(p.contact_id) : undefined; out.set(p.id, c?.name ?? p.name ?? c?.email ?? p.email ?? "Prospect"); }
  return out;
}

/* ─────────────────────────── Notifications ─────────────────────────── */

export type NoticeKind = "planificateur" | "reception" | "tache" | "rdv" | "rdv_plus" | "actions" | "taches";
/** Ce qui demande une action. `when` : le moment affiché à droite (« il y a 3 h ») ; `href` absent : ligne sans lien. */
export interface Notice { key: string; kind: NoticeKind; title: string; subtitle: string; when: string | null; href?: string }

const MAX_ROWS = 10;
const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

/**
 * Notifications. Hors planificateur et leads reçus, elles reprennent exactement ce qui attend le membre dans
 * Tâches › Éléments à faire (`myTodoSummary`) : tâches, prochaines actions, résultats d'appel à saisir. La cloche du
 * cadre compte les mêmes éléments.
 */
export async function noticesFor({ store, crm, can }: MemberCrm, tz: string): Promise<Notice[]> {
  const profile = store.session.profile, me = store.session.user.id;
  const now = new Date(), { start } = dayBounds(tz, now);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: tz });
  const since = (iso: string | null | undefined) => (iso ? ago(iso, tz, now.getTime()) : null);
  const at = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });

  const [beat, counts, todo, late] = await Promise.all([
    // Planificateur : seulement pour l'agence, hors démonstration (comme l'alerte du cadre). Lecture seule, sans envoyer d'alerte.
    !store.demo && profile.role === "agency" ? readBeat().then((b) => ({ b })).catch(() => null) : Promise.resolve(null),
    can("marketing_reception") ? store.counts().catch(() => null) : Promise.resolve(null),
    crm ? myTodoSummary(tz).catch(() => null) : Promise.resolve(null),
    // Les tâches en retard affichées une par une (les plus anciennes) ; leur nombre total vient du résumé.
    crm && can("marketing_taches") ? crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "status", "ouverte"], ["eq", "assignee_id", me], ["lt", "due_at", start]], order: ["due_at", "asc"], limit: MAX_ROWS }).catch(() => [] as MarketingTask[]) : Promise.resolve([] as MarketingTask[]),
  ]);

  const out: Notice[] = [];
  if (beat) {
    const state = schedulerState(beat.b, now.getTime());
    if (state === "arrete" || state === "jamais") out.push({
      key: "planificateur", kind: "planificateur", title: state === "jamais" ? "Planificateur jamais exécuté" : "Planificateur arrêté",
      subtitle: "Les leads reçus sont en sécurité, mais ils n'entrent plus dans Prospects tout seuls.", when: since(beat.b?.last_run_at),
      href: can("marketing_reception") ? "/marketing/reglages/reception" : undefined,
    });
  }
  const attention = counts?.inboxAttention ?? 0;
  if (attention > 0) out.push({
    key: "reception", kind: "reception", title: `${attention} ${plural(attention, "lead reçu", "leads reçus")} à vérifier`,
    subtitle: "En erreur, suspect, ou en attente depuis plus de 5 minutes.", when: null, href: "/marketing/reglages/reception",
  });
  if (!todo) return out;

  const results = todo.results.slice(0, MAX_ROWS);
  const ids = [...late.map((t) => t.prospect_id), ...results.map((r) => r.prospectId)].filter((x): x is string => !!x);
  const names = crm ? await prospectNames(crm, ids) : new Map<string, string>();

  for (const t of late) {
    const who = t.prospect_id ? names.get(t.prospect_id) : undefined;
    out.push({ key: `t-${t.id}`, kind: "tache", title: t.title || "Tâche", subtitle: [`En retard · échéance ${day.format(new Date(t.due_at as string))}`, who].filter(Boolean).join(" · "), when: since(t.due_at), href: "/marketing/taches" });
  }
  // Nombre exact (compté par la base), pas seulement les lignes lues.
  const moreLate = Math.max(0, todo.tasks.late - late.length);
  if (moreLate > 0) out.push({ key: "t-plus", kind: "tache", title: `${moreLate} autre${moreLate > 1 ? "s" : ""} ${plural(moreLate, "tâche")} en retard`, subtitle: "Toutes tes tâches, triées par échéance.", when: null, href: "/marketing/taches" });

  for (const r of results) {
    out.push({ key: `r-${r.key}`, kind: "rdv", title: (r.prospectId ? names.get(r.prospectId) : undefined) ?? r.note ?? "Rendez-vous", subtitle: `Résultat à saisir · rendez-vous du ${at.format(new Date(r.due as string))}`,
      when: since(r.due), href: r.prospectId && can("marketing_prospects") ? `/marketing/crm/${r.prospectId}` : "/marketing/taches" });
  }
  const moreResults = todo.results.length - results.length;
  if (moreResults > 0) out.push({ key: "r-plus", kind: "rdv_plus", title: `${moreResults} autre${moreResults > 1 ? "s" : ""} ${plural(moreResults, "rendez-vous", "rendez-vous")} sans résultat`, subtitle: "Les 30 derniers jours, dans Tâches.", when: null, href: "/marketing/taches" });

  // Prochaines actions des prospects (saisies sur la fiche) : une ligne, comme le reste des tâches.
  const actions = todo.actions.length;
  if (actions > 0) {
    const today = calendar(tz, now).today;
    const lateA = todo.actions.filter((a) => !!a.day && a.day < today).length, todayA = todo.actions.filter((a) => a.day === today).length;
    const parts = [lateA ? `${lateA} en retard` : null, todayA ? `${todayA} pour aujourd'hui` : null].filter(Boolean);
    out.push({
      key: "actions", kind: "actions", title: `${actions} ${plural(actions, "prochaine action", "prochaines actions")}`,
      subtitle: parts.length ? `Dont ${parts.join(" et ")}.` : "À venir.", when: null, href: "/marketing/taches",
    });
  }
  // Le reste de mes tâches ouvertes (sans retard).
  const rest = todo.tasks.open - todo.tasks.late;
  if (rest > 0) out.push({
    key: "taches", kind: "taches", title: `${rest} ${plural(rest, "tâche")} à faire`,
    subtitle: todo.tasks.today > 0 ? `Dont ${todo.tasks.today} pour aujourd'hui.` : "À venir ou sans échéance.", when: null, href: "/marketing/taches",
  });
  return out;
}

/** « il y a 3 h », « il y a 2 j », puis la date courte. */
function ago(iso: string, tz: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(min)) return "";
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}

/* ─────────────────────────── Rechercher ─────────────────────────── */

export interface SearchHit { id: string; href: string; name: string; sub: string; meta?: string }
/** `null` : section masquée (module non permis). */
export interface SearchResults { prospects: SearchHit[] | null; contacts: SearchHit[] | null }

const MAX_HITS = 10;
/**
 * Lignes dont les colonnes contiennent le texte tapé, ou tous ses mots dans n'importe quel ordre (« martin sarah »
 * trouve « Sarah Martin »). Un seul filtre « search » par requête : le second passage lit le mot le plus long, puis trie ici.
 */
async function findText<T extends { id: string }>(db: Db, table: string, cols: string[], term: string, order: [string, "asc" | "desc"], limit: number): Promise<T[]> {
  const exact = db.list<T>(table, { where: [["search", cols, term]], order, limit }).catch(() => [] as T[]);
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter(Boolean))];
  // Un numéro tapé en morceaux (« +33 6 23 ») n'est pas une liste de mots : il garde sa recherche exacte (et normalisée, plus bas).
  if (words.length < 2 || /^[\d\s+().-]+$/.test(term)) return exact;
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  const hay = (r: T) => cols.map((c) => String((r as unknown as Record<string, unknown>)[c] ?? "")).join(" ").toLowerCase();
  const [a, b] = await Promise.all([exact, db.list<T>(table, { where: [["search", cols, longest]], order, limit: 200 }).catch(() => [] as T[])]);
  return uniqById([...a, ...b.filter((r) => words.every((w) => hay(r).includes(w)))]).slice(0, limit);
}

/** Recherche « contient » dans les prospects (nom, email, téléphone, entreprise) et les contacts, 10 de chaque au plus. */
export async function searchCrm(crm: Crm | null, q: string, can: (m: ModuleKey) => boolean): Promise<SearchResults> {
  const showP = !!crm && can("marketing_prospects"), showC = !!crm && can("marketing_contacts");
  const term = q.trim().slice(0, 80);
  if (!crm || (!showP && !showC) || term.length < 2) return { prospects: showP ? [] : null, contacts: showC ? [] : null };

  // Un numéro se cherche aussi dans sa forme normalisée (+33…) : « 06 12 » trouve « +33 6 12… », comme « +33 6 12 » ou « 0033 6 12 ».
  const digits = term.replace(/\D/g, "");
  const phone = !/^[\d\s+().-]+$/.test(term) || digits.length < 4 ? null
    : term.trim().startsWith("+") ? `+${digits}` : digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+33${digits.slice(1)}` : digits;
  const [byText, byPhone] = await Promise.all([
    findText<Contact>(crm.db, "marketing_contacts", ["name", "email", "phone", "company"], term, ["updated_at", "desc"], 40),
    phone ? crm.db.list<Contact>("marketing_contacts", { where: [["search", ["phone_norm"], phone]], order: ["updated_at", "desc"], limit: 40 }).catch(() => [] as Contact[]) : Promise.resolve([] as Contact[]),
  ]);
  const contacts = uniqById([...byText, ...byPhone]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  let prospects: SearchHit[] | null = null;
  if (showP) {
    const ids = contacts.map((c) => c.id).slice(0, 40);
    const [direct, linked, stages] = await Promise.all([
      findText<Prospect>(crm.db, "marketing_prospects", ["name", "email", "phone", "title", "marque"], term, ["created_at", "desc"], MAX_HITS),
      ids.length ? crm.db.list<Prospect>("marketing_prospects", { where: [["in", "contact_id", ids]], order: ["created_at", "desc"], limit: MAX_HITS }).catch(() => [] as Prospect[]) : Promise.resolve([] as Prospect[]),
      listStages(crm.db, { includeInactive: true }).catch(() => [] as Stage[]),
    ]);
    const list = uniqById([...direct, ...linked]).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_HITS);
    const absent = [...new Set(list.map((p) => p.contact_id).filter((id): id is string => !!id && !contactById.has(id)))];
    if (absent.length) for (const c of await crm.db.list<Contact>("marketing_contacts", { where: [["in", "id", absent]] }).catch(() => [] as Contact[])) contactById.set(c.id, c);
    const stageName = new Map(stages.map((s) => [s.id, s.name]));
    prospects = list.map((p) => {
      const c = p.contact_id ? contactById.get(p.contact_id) : undefined;
      return {
        id: p.id, href: `/marketing/crm/${p.id}`, name: c?.name ?? p.name ?? c?.email ?? p.email ?? p.title ?? "Prospect",
        sub: [p.stage_id ? stageName.get(p.stage_id) : null, c?.email ?? p.email ?? c?.phone ?? p.phone].filter(Boolean).join(" · "),
        meta: Number(p.value) > 0 ? euro.format(Number(p.value)) : undefined,
      };
    });
  }
  return {
    prospects,
    contacts: showC ? contacts.slice(0, MAX_HITS).map((c) => ({ id: c.id, href: `/marketing/contacts/${c.id}`, name: c.name ?? c.email ?? c.phone ?? "Contact", sub: [c.company, c.email ?? c.phone].filter(Boolean).join(" · ") })) : null,
  };
}
