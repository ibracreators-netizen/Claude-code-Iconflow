import "server-only";
import { ensureStages, listStages } from "./crm";
import type { Crm } from "./crm-server";
import { partsInZone } from "./slots";
import { TASK_KIND, type Appointment, type Contact, type MarketingRole, type MarketingTask, type Prospect, type TaskKind, type TaskStatus } from "./types";

/**
 * Page Tâches : ce que la journée demande à un membre (« Éléments à faire »), et les listes de tâches.
 * Un élément est une tâche, ou ce que l'ancien « Mon espace » montrait : la prochaine action d'un prospect,
 * un rendez-vous du jour à tenir, un résultat d'appel à saisir. Les dates sont calculées dans le fuseau de l'espace.
 */
export type TodoKind = "tache" | "action" | "rdv" | "resultat";
export interface TodoItem {
  key: string;
  kind: TodoKind;
  taskId: string | null;
  taskKind: TaskKind | null;
  status: TaskStatus;
  title: string;
  /** Type affiché : « À appeler », « Relance », « Prochaine action », « Rendez-vous »… */
  label: string;
  note: string | null;
  prospectId: string | null;
  prospectName: string | null;
  phone: string | null;
  assigneeId: string | null;
  origin: MarketingTask["origin"] | null;
  meetingUrl: string | null;
  /** Échéance (UTC) et jour local (AAAA-MM-JJ). */
  due: string | null;
  day: string | null;
  /** Échéance lisible : « Aujourd'hui · 14:00 », « Demain · 09:00 », « lun. 17 nov. », « Sans échéance ». */
  when: string;
  /** Date et heure locales, pour la fenêtre de modification. */
  date: string | null;
  time: string | null;
  /** « Terminée le 18 nov. » / « Annulée le 18 nov. » */
  doneWhen: string | null;
  /** Prochaine action d'un prospect : valeurs d'origine, pour pouvoir annuler. */
  nextAt: string | null;
  nextNote: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (key: string, days: number) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };

/** Le calendrier de l'espace : jour local d'un instant, aujourd'hui, demain, et l'échéance en mots. */
export function calendar(tz: string, now = new Date()) {
  const at = (iso: string) => { const p = partsInZone(new Date(iso), tz); return { day: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}`, y: p.y }; };
  const today = at(now.toISOString()).day, tomorrow = shift(today, 1), yesterday = shift(today, -1);
  const short = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const plain = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "numeric", month: "short" });
  const when = (iso: string | null): string => {
    if (!iso) return "Sans échéance";
    const { day, time, y } = at(iso), date = new Date(iso);
    if (day === today) return `Aujourd'hui · ${time}`;
    if (day === tomorrow) return `Demain · ${time}`;
    if (day === yesterday) return "Hier";
    if (day < today) return y === Number(today.slice(0, 4)) ? short.format(date) : long.format(date);
    return y === Number(today.slice(0, 4)) ? `${short.format(date)} · ${time}` : long.format(date);
  };
  const on = (iso: string | null) => (iso ? (at(iso).day === today ? "aujourd'hui" : `le ${(at(iso).y === Number(today.slice(0, 4)) ? plain : long).format(new Date(iso))}`) : null);
  return { at, today, tomorrow, when, on };
}

/** Nom et téléphone des prospects cités (par lots : une liste d'identifiants trop longue ne passe pas dans une requête). */
async function namesFor(crm: Crm, ids: Array<string | null>): Promise<Map<string, { name: string; phone: string | null }>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / 100) }, (_, i) => list.slice(i * 100, i * 100 + 100));
  const prospects = (await Promise.all(chunks(uniq).map((part) => crm.db.list<Prospect>("marketing_prospects", { where: [["in", "id", part]], columns: "id,name,email,phone,contact_id", limit: part.length }).catch(() => [] as Prospect[])))).flat();
  const cids = [...new Set(prospects.map((p) => p.contact_id).filter((x): x is string => !!x))];
  const contacts = (await Promise.all(chunks(cids).map((part) => crm.db.list<Contact>("marketing_contacts", { where: [["in", "id", part]], columns: "id,name,email,phone", limit: part.length }).catch(() => [] as Contact[])))).flat();
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return new Map(prospects.map((p) => { const c = p.contact_id ? byId.get(p.contact_id) : undefined; return [p.id, { name: c?.name ?? p.name ?? c?.email ?? p.email ?? "Prospect", phone: c?.phone ?? p.phone ?? null }]; }));
}

type Cal = ReturnType<typeof calendar>;
const blank = (cal: Cal, key: string, kind: TodoKind, due: string | null): TodoItem => ({
  key, kind, taskId: null, taskKind: null, status: "ouverte", title: "", label: "", note: null, prospectId: null, prospectName: null, phone: null, assigneeId: null,
  origin: null, meetingUrl: null, due, day: due ? cal.at(due).day : null, when: cal.when(due), date: due ? cal.at(due).day : null, time: due ? cal.at(due).time : null,
  doneWhen: null, nextAt: null, nextNote: null,
});
function fromTask(cal: Cal, t: MarketingTask): TodoItem {
  const done = t.status === "faite" ? "Terminée" : t.status === "annulee" ? "Annulée" : null, at = t.done_at ?? t.updated_at;
  return { ...blank(cal, `t:${t.id}`, "tache", t.due_at), taskId: t.id, taskKind: t.kind, status: t.status, title: t.title, label: TASK_KIND[t.kind] ?? "Tâche", note: t.note,
    prospectId: t.prospect_id, assigneeId: t.assignee_id, origin: t.origin, doneWhen: done ? `${done} ${cal.on(at) ?? ""}`.trim() : null };
}
async function withNames(crm: Crm, items: TodoItem[]): Promise<TodoItem[]> {
  const names = await namesFor(crm, items.map((i) => i.prospectId));
  return items.map((i) => { const n = i.prospectId ? names.get(i.prospectId) : undefined; return n ? { ...i, prospectName: n.name, phone: n.phone } : i; });
}
const byDue = (a: TodoItem, b: TodoItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title, "fr");

/**
 * Éléments à faire d'un membre : ses tâches ouvertes, les prochaines actions de ses prospects, et pour le closing
 * ses rendez-vous du jour et les résultats d'appel à saisir (30 derniers jours, comme l'ancien « Mon espace »).
 * `role` : null pour un membre de l'agence (il voit les deux côtés, setter et closer).
 */
export async function todoItems(crm: Crm, opts: { who: string; role: MarketingRole | null; tz: string }): Promise<TodoItem[]> {
  const { who, role } = opts, now = new Date(), cal = calendar(opts.tz, now), closing = role !== "setter";
  const owners = role === "setter" ? ["setter_id"] : role === "closer" ? ["closer_id"] : ["setter_id", "closer_id"];
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString(), until = new Date(now.getTime() + 36 * 3_600_000).toISOString();
  const [tasks, stages, nexts, appts, closerOf] = await Promise.all([
    crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "status", "ouverte"], ["eq", "assignee_id", who]], order: ["due_at", "asc"], limit: 500 }),
    crm.demo ? ensureStages(crm.db).then(() => listStages(crm.db, { includeInactive: true })) : listStages(crm.db, { includeInactive: true }),
    Promise.all(owners.map((col) => crm.db.list<Prospect>("marketing_prospects", { where: [["eq", col, who], ["notnull", "next_action_at"]], limit: 500 }).catch(() => [] as Prospect[]))),
    closing ? crm.db.list<Appointment>("marketing_appointments", { where: [["eq", "status", "confirme"], ["gte", "starts_at", since], ["lte", "starts_at", until]], order: ["starts_at", "asc"], limit: 2000 }).catch(() => [] as Appointment[]) : Promise.resolve([] as Appointment[]),
    closing ? crm.db.list<Prospect>("marketing_prospects", { where: [["eq", "closer_id", who]], columns: "id", limit: 5000 }).catch(() => [] as Prospect[]) : Promise.resolve([] as Prospect[]),
  ]);
  const closed = new Set(stages.filter((s) => s.kind !== "ouvert").map((s) => s.id)), mine = new Set(closerOf.map((p) => p.id));
  const items = tasks.map((t) => fromTask(cal, t));
  // Une tâche « Résultat à saisir » existe déjà (automatisation) : on ne la double pas.
  const resultTask = new Set(tasks.filter((t) => t.kind === "resultat" && t.prospect_id).map((t) => t.prospect_id));

  const seen = new Set<string>();
  for (const p of nexts.flat()) {
    if (seen.has(p.id) || !p.next_action_at || (p.stage_id && closed.has(p.stage_id))) continue;
    seen.add(p.id);
    items.push({ ...blank(cal, `a:${p.id}`, "action", p.next_action_at), title: p.next_action_note?.trim() || "Prochaine action", label: "Prochaine action", prospectId: p.id, assigneeId: who, nextAt: p.next_action_at, nextNote: p.next_action_note ?? null });
  }
  for (const a of appts) {
    if (a.closer_id !== who && !mine.has(a.prospect_id)) continue;
    if (Date.parse(a.ends_at) > now.getTime()) {
      if (cal.at(a.starts_at).day === cal.today) items.push({ ...blank(cal, `r:${a.id}`, "rdv", a.starts_at), title: a.title?.trim() || "Rendez-vous", label: "Rendez-vous à tenir", prospectId: a.prospect_id, assigneeId: who, meetingUrl: a.meeting_url });
    } else if ((a.result ?? "a_venir") === "a_venir" && !resultTask.has(a.prospect_id)) {
      items.push({ ...blank(cal, `s:${a.id}`, "resultat", a.starts_at), title: "Saisir le résultat de l'appel", label: "Résultat à saisir", note: a.title?.trim() || null, prospectId: a.prospect_id, assigneeId: who });
    }
  }
  return (await withNames(crm, items)).sort(byDue);
}

/** Tâches ouvertes de tout le monde (dans la limite des droits), ou les 100 dernières terminées. */
export async function taskList(crm: Crm, opts: { closed: boolean; tz: string }): Promise<{ items: TodoItem[]; capped: boolean }> {
  const cal = calendar(opts.tz), limit = opts.closed ? 100 : 1000;
  const rows = await crm.db.list<MarketingTask>("marketing_tasks", opts.closed
    ? { where: [["in", "status", ["faite", "annulee"]]], order: ["updated_at", "desc"], limit }
    : { where: [["eq", "status", "ouverte"]], order: ["due_at", "asc"], limit });
  const items = await withNames(crm, rows.map((t) => fromTask(cal, t)));
  return { items: opts.closed ? items : items.sort(byDue), capped: !opts.closed && rows.length >= limit };
}

/** Prospect choisi d'avance dans la fenêtre « Ajouter une tâche » (lien depuis une fiche). */
export async function prospectChoice(crm: Crm, id: string): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const p = await crm.db.get<Prospect>("marketing_prospects", id).catch(() => null);
  if (!p) return null;
  const n = (await namesFor(crm, [p.id])).get(p.id);
  return { id: p.id, name: n?.name ?? "Prospect" };
}
