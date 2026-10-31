import type { Livrable, LivrableItem, LivrableKind } from "@/lib/data/types";

/*
 * Un livrable = un batch : toutes les vidéos (ou tous les visuels) d'une livraison sont derrière
 * un seul lien Frame, et le client reçoit ce seul lien. Fonctions pures, sans dépendance serveur,
 * partagées par l'espace agence, l'espace client et les server actions.
 */

export const MAX_ITEMS = 200;
export const MAX_ITEM_NAME = 160;
const MAX_DURATION = 24 * 3600;

/** Entrée du formulaire de batch (création) ; la modification en reprend une partie. */
export interface BatchInput {
  client_id: string;
  month: string;                 // YYYY-MM ou YYYY-MM-01
  kind: LivrableKind;
  title: string;
  file_url?: string | null;      // le lien unique du batch (Frame.io…)
  brief_id?: string | null;
  items?: LivrableItem[];
}
export type BatchPatch = Partial<Omit<BatchInput, "client_id">>;

/** Lien HTTPS sans identifiants, sinon null. */
export function safeHttps(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

const SERVICES: Array<[RegExp, string]> = [
  [/(^|\.)(frame\.io|f\.io)$/i, "Frame"],
  [/(^|\.)(drive|docs)\.google\.com$/i, "Drive"],
  [/(^|\.)dropbox\.com$/i, "Dropbox"],
  [/(^|\.)wetransfer\.com$/i, "WeTransfer"],
  [/(^|\.)vimeo\.com$/i, "Vimeo"],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, "YouTube"],
];

export interface BatchLink {
  href: string;
  /** Hôte lisible, sans « www. ». */
  host: string;
  /** Hôte + chemin, pour montrer le lien sans le protocole. */
  display: string;
  /** Service reconnu (Frame, Drive…) ou null. */
  service: string | null;
  /** Libellé du bouton : « Ouvrir dans Frame », « Ouvrir le lien ». */
  label: string;
  /** Fichier vidéo direct, lisible dans la page. */
  video: boolean;
  /** Aperçu possible dans un cadre. Frame refuse l'intégration : on affiche le bouton. */
  embeddable: boolean;
}

/** Décrit le lien unique d'un batch, ou null si le lien est absent ou invalide. */
export function batchLink(url: string | null | undefined): BatchLink | null {
  const u = safeHttps(url);
  if (!u) return null;
  const service = SERVICES.find(([re]) => re.test(u.hostname))?.[1] ?? null;
  const video = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname);
  const host = u.hostname.replace(/^www\./, "");
  return {
    href: u.href,
    host,
    display: `${host}${u.pathname.length > 1 ? u.pathname : ""}`,
    service,
    label: service ? `Ouvrir dans ${service}` : "Ouvrir le lien",
    video,
    embeddable: !video && service !== "Frame",
  };
}

const UNITS: Record<LivrableKind, [string, string]> = { video: ["vidéo", "vidéos"], static: ["visuel", "visuels"], rush: ["rush", "rushs"] };

/** « 1 vidéo », « 6 vidéos », « 4 visuels », « 3 rushs ». */
export function itemsLabel(kind: LivrableKind, n: number) {
  const unit = UNITS[kind] ?? ["élément", "éléments"];
  return `${n} ${n > 1 ? unit[1] : unit[0]}`;
}

/** Somme des durées renseignées, null si aucune. */
export function totalDuration(items: LivrableItem[]): number | null {
  let total = 0;
  let any = false;
  for (const it of items) {
    if (typeof it.duration_sec === "number" && it.duration_sec > 0) { total += it.duration_sec; any = true; }
  }
  return any ? total : null;
}

/** « 0:41 », « 3:12 », « 1:02:10 ». */
export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Durée totale du batch : somme des éléments, sinon la durée saisie sur le livrable. */
export function batchDuration(l: Pick<Livrable, "items" | "duration_sec">): number | null {
  return totalDuration(l.items ?? []) ?? (l.duration_sec && l.duration_sec > 0 ? l.duration_sec : null);
}

/** « 6 vidéos · 3:12 », « 4 visuels », « 0:41 », ou null s'il n'y a rien à dire. */
export function batchSummary(l: Pick<Livrable, "items" | "duration_sec" | "kind">): string | null {
  const n = l.items?.length ?? 0;
  const d = batchDuration(l);
  const parts = [n ? itemsLabel(l.kind, n) : null, d ? fmtDuration(d) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Nettoie la liste venue du formulaire : noms non vides, durées entières, liens HTTPS. Lève une erreur lisible sinon. */
export function normalizeItems(input: unknown): LivrableItem[] {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_ITEMS) throw new Error(`Un batch compte au plus ${MAX_ITEMS} éléments.`);
  const out: LivrableItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_NAME) : "";
    if (!name) continue;
    const d = typeof r.duration_sec === "number" ? r.duration_sec : typeof r.duration_sec === "string" && r.duration_sec.trim() ? Number(r.duration_sec) : null;
    const duration_sec = d !== null && Number.isFinite(d) && d > 0 ? Math.min(MAX_DURATION, Math.round(d)) : null;
    let url: string | null = null;
    if (typeof r.url === "string" && r.url.trim()) {
      const u = safeHttps(r.url);
      if (!u) throw new Error(`Le lien de « ${name} » doit être une adresse HTTPS.`);
      url = u.href;
    }
    out.push({ name, duration_sec, url });
  }
  return out;
}

const DUR = String.raw`(\d{1,2}:[0-5]\d|\d{1,5})\s*(s|sec|secondes?)?`;
const WITH_SEP = new RegExp(String.raw`^(.*\S)(?:\s+[·•|,\-–—]\s*|\s*[·•|,\-–—]\s+)${DUR}$`, "i");
const WITH_SPACE = new RegExp(String.raw`^(.*\S)\s+${DUR}$`, "i");

/**
 * Une ligne collée → un élément. Formes comprises : « Hook 2 », « Hook 2 · 32 », « Hook 2 - 0:32 »,
 * « Hook 2 | 32 s », « Hook 2 32s », « 3. Hook 2 », « - Hook 2 ».
 * Un nombre final sans séparateur ni unité reste dans le nom (« Hook 2 », « Vidéo 2024 »),
 * et une parenthèse finale n'est jamais une durée (« V1 (9:16) » est un format).
 */
export function parseItemLine(line: string): LivrableItem | null {
  const raw = line.replace(/\s+/g, " ").trim().replace(/^(?:[-•*]|\d{1,3}[.)])\s+/, "");
  if (!raw) return null;
  let m = raw.match(WITH_SEP);
  if (!m) {
    const s = raw.match(WITH_SPACE);
    if (s && (s[2].includes(":") || s[3])) m = s;
  }
  if (!m) return { name: raw.slice(0, MAX_ITEM_NAME), duration_sec: null, url: null };
  const [, name, dur] = m;
  const seconds = dur.includes(":") ? Number(dur.split(":")[0]) * 60 + Number(dur.split(":")[1]) : Number(dur);
  return { name: name.trim().slice(0, MAX_ITEM_NAME), duration_sec: Number.isFinite(seconds) && seconds > 0 ? Math.min(MAX_DURATION, seconds) : null, url: null };
}

/** Un texte multi-lignes → la liste des éléments (lignes vides ignorées). */
export function parseItemLines(text: string): LivrableItem[] {
  return text.split(/\r?\n/).map(parseItemLine).filter((x): x is LivrableItem => x !== null);
}
