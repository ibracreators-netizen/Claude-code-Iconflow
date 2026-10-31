import type { DocumentFolder } from "@/lib/data/types";

/**
 * Bibliothèque de documents : aides pures (serveur et client) pour l'arborescence des dossiers.
 * L'état de navigation vit dans l'URL : `?folder=<id>` pour un dossier, `?folder=non-classes` pour les documents sans dossier,
 * rien pour « Tous les documents ». Les filtres (client, type, recherche) sont conservés d'un dossier à l'autre.
 */

/** Clé d'URL de l'entrée « Non classés ». Les identifiants de dossiers sont des UUID (ou « fo_… » en démo) : aucune collision possible. */
export const UNFILED = "non-classes";

export interface FolderNode extends DocumentFolder { children: FolderNode[]; depth: number }

const byPosition = (a: DocumentFolder, b: DocumentFolder) => a.position - b.position || a.name.localeCompare(b.name, "fr");

/** Arborescence triée (position puis nom). Un dossier dont le parent a disparu remonte à la racine ; un cycle ne bloque jamais l'affichage. */
export function buildTree(folders: DocumentFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((f) => [f.id, { ...f, children: [], depth: 0 }]));
  const roots: FolderNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parent_id && n.parent_id !== n.id ? nodes.get(n.parent_id) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  }
  const seen = new Set<string>();
  const visit = (list: FolderNode[], depth: number) => {
    list.sort(byPosition);
    for (const n of list) { if (seen.has(n.id)) continue; seen.add(n.id); n.depth = depth; visit(n.children, depth + 1); }
  };
  visit(roots, 0);
  // Dossiers pris dans un cycle (jamais atteints depuis une racine) : on les montre quand même.
  for (const n of nodes.values()) if (!seen.has(n.id)) { n.depth = 0; roots.push(n); seen.add(n.id); }
  return roots;
}

/** La liste à plat, dans l'ordre d'affichage (parcours en profondeur). */
export function flattenTree(roots: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const seen = new Set<string>();
  const walk = (list: FolderNode[]) => list.forEach((n) => { if (seen.has(n.id)) return; seen.add(n.id); out.push(n); walk(n.children); });
  walk(roots);
  return out;
}

/** Chemin de la racine jusqu'au dossier (inclus). Vide si le dossier n'existe pas. */
export function folderPath(folders: DocumentFolder[], id: string | null | undefined): DocumentFolder[] {
  if (!id) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: DocumentFolder[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); path.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  return path;
}

/** Le dossier et toute sa descendance. */
export function subtreeIds(folders: DocumentFolder[], id: string): Set<string> {
  const ids = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (ids.has(cur)) continue;
    ids.add(cur);
    folders.forEach((f) => { if (f.parent_id === cur) stack.push(f.id); });
  }
  return ids;
}

/** Nombre de documents par dossier, sous-dossiers compris. */
export function countBySubtree(folders: DocumentFolder[], docs: Array<{ folder_id: string | null }>): Record<string, number> {
  const direct: Record<string, number> = {};
  docs.forEach((d) => { if (d.folder_id) direct[d.folder_id] = (direct[d.folder_id] ?? 0) + 1; });
  const total: Record<string, number> = {};
  const walk = (n: FolderNode): number => { const sum = (direct[n.id] ?? 0) + n.children.reduce((acc, c) => acc + walk(c), 0); total[n.id] = sum; return sum; };
  buildTree(folders).forEach(walk);
  return total;
}

/** Un document est « non classé » s'il n'a pas de dossier, ou si son dossier n'existe plus. */
export function isUnfiled(d: { folder_id: string | null }, folderIds: Set<string>) { return !d.folder_id || !folderIds.has(d.folder_id); }

export type LibraryParams = { client?: string; kind?: string; q?: string };

/** Les filtres actifs, lus depuis les searchParams (serveur) ou `useSearchParams()` (client). */
export function paramsFrom(sp: URLSearchParams | Record<string, string | undefined>): LibraryParams {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) ?? undefined : sp[k]) || undefined;
  return { client: get("client"), kind: get("kind"), q: get("q") };
}

/** URL d'un dossier (`id`), des non classés (`UNFILED`) ou de tous les documents (`null`), filtres conservés. */
export function folderHref(key: string | null, params: LibraryParams = {}): string {
  const p = new URLSearchParams();
  if (key) p.set("folder", key);
  (["client", "kind", "q"] as const).forEach((k) => { const v = params[k]; if (v) p.set(k, v); });
  const s = p.toString();
  return `/studio/documents${s ? `?${s}` : ""}`;
}

export const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;
