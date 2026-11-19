import "server-only";
import type { Crm } from "./crm-server";
import type { Filter } from "./db";
import { zonedTimeToUtc } from "./slots";
import type { Contact } from "./types";

/*
 * Liste des contacts, paginée côté serveur (la base peut compter des milliers de fiches) :
 * une page = un comptage + une lecture limitée. Les paramètres viennent de l'adresse de la page
 * (?q=&etiquette=&source=&prospect=&du=&au=&tri=&sens=&page=&taille=).
 */

const T = "marketing_contacts";
export type ContactSort = "nom" | "cree" | "activite";
export const CONTACT_PAGE_SIZES = [20, 50, 100] as const;

export interface ContactQuery {
  q: string; tag: string; source: string; prospect: "" | "avec" | "sans"; from: string; to: string;
  sort: ContactSort; dir: "asc" | "desc"; page: number; size: number;
}
/** Une ligne de la liste : la fiche, plus le nombre de prospects (affaires) qui lui sont rattachés. */
export interface ContactListRow {
  id: string; name: string | null; email: string | null; phone: string | null; company: string | null; tags: string[]; source: string | null;
  created_at: string; last_activity_at: string | null; deals: number;
}
export interface ContactFacets { total: number; withProspect: number; withoutProspect: number; tags: Array<{ name: string; count: number }>; sources: Array<{ name: string; count: number }> }

const one = (v: unknown): string => String((Array.isArray(v) ? v[0] : v) ?? "");
const isDay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : "");

export function parseContactQuery(sp: Record<string, unknown>): ContactQuery {
  const sort = one(sp.tri), dir = one(sp.sens), prospect = one(sp.prospect);
  const page = Math.floor(Number(one(sp.page))), size = Number(one(sp.taille));
  const s: ContactSort = sort === "nom" || sort === "activite" ? sort : "cree";
  return {
    q: one(sp.q).replace(/\s+/g, " ").trim().slice(0, 100),
    tag: one(sp.etiquette).trim().slice(0, 40),
    source: one(sp.source).trim().slice(0, 120),
    prospect: prospect === "avec" || prospect === "sans" ? prospect : "",
    from: isDay(one(sp.du)), to: isDay(one(sp.au)),
    sort: s, dir: dir === "asc" || dir === "desc" ? dir : s === "nom" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 100_000) : 1,
    size: (CONTACT_PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
  };
}

/** Début d'une journée (AAAA-MM-JJ) dans le fuseau de l'espace, en UTC. */
const dayStart = (day: string, tz: string, plus = 0) => { const [y, m, d] = day.split("-").map(Number); const at = new Date(Date.UTC(y, m - 1, d + plus)); return zonedTimeToUtc(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), 0, 0, tz).toISOString(); };

/**
 * Filtres de la recherche. Un numéro tapé (« 06 12 34… », « +33 6… ») est cherché sur le téléphone normalisé,
 * pour trouver la fiche quelle que soit la façon dont le numéro a été saisi.
 */
export function contactFilters(q: ContactQuery, tz: string): Filter[] {
  const f: Filter[] = [];
  if (q.q) {
    const digits = q.q.replace(/\D/g, "");
    const phoneLike = /^[\d\s+().-]+$/.test(q.q) && (digits.length >= 6 || /^\s*[+0]/.test(q.q));
    let core = /^\s*(\+|00)33/.test(q.q) ? digits.replace(/^(00)?33/, "") : digits;
    core = core.replace(/^0+/, "");
    if (phoneLike && core.length >= 2) f.push(["search", ["phone_norm"], core]);
    else f.push(["search", ["name", "email", "phone", "company"], q.q]);
  }
  if (q.tag) f.push(["has", "tags", q.tag]);
  if (q.source) f.push(["eq", "source", q.source]);
  if (q.from) f.push(["gte", "created_at", dayStart(q.from, tz)]);
  if (q.to) f.push(["lt", "created_at", dayStart(q.to, tz, 1)]);
  return f;
}

const SORT_COL: Record<ContactSort, "name" | "created_at" | "last_activity_at"> = { nom: "name", cree: "created_at", activite: "last_activity_at" };
type Slim = Pick<Contact, "id" | "name" | "created_at" | "last_activity_at">;

/** Une page de contacts et le nombre total de fiches qui répondent aux filtres. Les fiches sans valeur pour le tri viennent toujours en dernier. */
export async function contactPage(crm: Crm, q: ContactQuery, tz: string, at: { offset: number; limit: number }): Promise<{ rows: ContactListRow[]; total: number }> {
  const db = crm.db, where = contactFilters(q, tz), col = SORT_COL[q.sort], { offset, limit } = at;
  let rows: Contact[] = [], total = 0;

  if (q.prospect) {
    // « Avec / sans prospect » : la base ne sait pas filtrer sur l'absence d'une affaire ; on lit les identifiants seuls, puis la page.
    const [all, links] = await Promise.all([
      db.list<Slim>(T, { where, columns: "id,name,created_at,last_activity_at" }),
      db.list<{ contact_id: string | null }>("marketing_prospects", { where: [["notnull", "contact_id"]], columns: "contact_id" }),
    ]);
    const linked = new Set(links.map((l) => l.contact_id));
    const kept = all.filter((c) => linked.has(c.id) === (q.prospect === "avec"));
    const sign = q.dir === "asc" ? 1 : -1;
    kept.sort((a, b) => {
      const x = a[col], y = b[col];
      if (x == null || y == null) return x == null && y == null ? b.created_at.localeCompare(a.created_at) : x == null ? 1 : -1;
      return (col === "name" ? x.localeCompare(y, "fr", { sensitivity: "base" }) : x.localeCompare(y)) * sign;
    });
    total = kept.length;
    const ids = kept.slice(offset, offset + limit).map((c) => c.id);
    if (ids.length) {
      const byId = new Map((await db.list<Contact>(T, { where: [["in", "id", ids]] })).map((c) => [c.id, c]));
      rows = ids.map((id) => byId.get(id)).filter((c): c is Contact => !!c);
    }
  } else if (col === "created_at") {
    [rows, total] = await Promise.all([db.list<Contact>(T, { where, order: [col, q.dir], offset, limit }), db.count(T, where)]);
  } else {
    // Tri sur une colonne parfois vide (nom, dernière activité) : d'abord les fiches renseignées, puis les autres.
    const filled: Filter[] = [...where, ["notnull", col]], empty: Filter[] = [...where, ["null", col]];
    const [all, n] = await Promise.all([db.count(T, where), db.count(T, filled)]);
    total = all;
    if (offset < n) rows = await db.list<Contact>(T, { where: filled, order: [col, q.dir], offset, limit });
    if (rows.length < limit && offset + rows.length < total) rows = rows.concat(await db.list<Contact>(T, { where: empty, order: ["created_at", "desc"], offset: Math.max(0, offset - n), limit: limit - rows.length }));
  }

  const deals = new Map<string, number>();
  if (rows.length) {
    for (const p of await db.list<{ contact_id: string | null }>("marketing_prospects", { where: [["in", "contact_id", rows.map((r) => r.id)]], columns: "contact_id" }))
      if (p.contact_id) deals.set(p.contact_id, (deals.get(p.contact_id) ?? 0) + 1);
  }
  return {
    total,
    rows: rows.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, tags: c.tags ?? [], source: c.source, created_at: c.created_at, last_activity_at: c.last_activity_at, deals: deals.get(c.id) ?? 0 })),
  };
}

/** Choix proposés par les filtres (étiquettes, sources) et compteurs des listes « avec / sans prospect ». Lu à la demande, pas à chaque page. */
export async function contactFacets(crm: Crm): Promise<ContactFacets> {
  const [all, links] = await Promise.all([
    crm.db.list<Pick<Contact, "id" | "tags" | "source">>(T, { columns: "id,tags,source" }),
    crm.db.list<{ contact_id: string | null }>("marketing_prospects", { where: [["notnull", "contact_id"]], columns: "contact_id" }),
  ]);
  const linked = new Set(links.map((l) => l.contact_id)), tags = new Map<string, number>(), sources = new Map<string, number>();
  let withProspect = 0;
  for (const c of all) {
    if (linked.has(c.id)) withProspect++;
    for (const t of c.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
    if (c.source) sources.set(c.source, (sources.get(c.source) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0], "fr", { sensitivity: "base" })).map(([name, count]) => ({ name, count }));
  return { total: all.length, withProspect, withoutProspect: all.length - withProspect, tags: sorted(tags), sources: sorted(sources) };
}
