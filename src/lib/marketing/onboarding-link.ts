/**
 * Lien d'onboarding : UN seul lien pour toutes les nouvelles recrues (/bienvenue/<jeton>), sans compte.
 * La recrue tape l'e-mail que son responsable a enregistré pour elle (membre de l'équipe Marketing, ou personne
 * des liens de saisie des KPI) ; l'app la reconnaît et lui montre l'onboarding, les SOPs et les ressources de SON rôle.
 *
 * Rien n'est stocké en plus dans la base (aucune migration) :
 *   • le jeton est DÉRIVÉ, jamais enregistré : HMAC-SHA256 d'une clé tirée d'un secret serveur, sur « lien-onboarding:v<version> » ;
 *   • seuls `version` et `enabled` sont gardés, dans marketing_settings (clé « onboarding_link »). La version seule ne
 *     permet pas de fabriquer le jeton ; changer le lien = version + 1, et l'ancien jeton cesse de marcher ;
 *   • l'accès de la recrue tient dans un cookie signé avec la même clé, lié à la version (changer ou couper le lien l'annule).
 *
 * Ce module ne dépend de rien côté serveur (seulement node:crypto) : il sert à la partie serveur et au script de
 * vérification hors ligne (scripts/onboarding-link-selfcheck.ts).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { normalizeEmail } from "./crm";
import { firstName } from "./kpi-links";
import type { Doc, Folder, Step } from "./resources";
import type { MarketingRole } from "./types";

/* ─────────────────────────── Réglage ─────────────────────────── */

export const SETTING_KEY = "onboarding_link";
export interface OnboardingLinkSetting { version: number; enabled: boolean }
export const DEFAULT_SETTING: OnboardingLinkSetting = { version: 1, enabled: true };
const MAX_VERSION = Number.MAX_SAFE_INTEGER;
/** Réglage lu dans marketing_settings, nettoyé : version entière positive, actif par défaut. */
export function parseSetting(raw: unknown): OnboardingLinkSetting {
  const r = raw && typeof raw === "object" ? (raw as { version?: unknown; enabled?: unknown }) : {};
  const v = typeof r.version === "number" && Number.isInteger(r.version) && r.version >= 1 && r.version <= MAX_VERSION ? r.version : DEFAULT_SETTING.version;
  return { version: v, enabled: r.enabled === false ? false : true };
}
/** Réglage après « Changer le lien » : version suivante (l'ancien jeton et les accès ouverts cessent de marcher). */
export const nextVersion = (s: OnboardingLinkSetting): OnboardingLinkSetting => ({ ...s, version: s.version + 1 });

/* ─────────────────────────── Jeton ─────────────────────────── */

/** Secret fixe des essais sans base (démo, développement). En ligne, c'est la clé service de Supabase. */
export const DEMO_SECRET = "demo-onboarding";
export const TOKEN_LENGTH = 32;
export const ONBOARDING_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
/** Clé dérivée du secret serveur : sert au jeton du lien ET à la signature du cookie d'accès. */
export const deriveKey = (secret: string): Buffer => createHash("sha256").update(`iconflow-onboarding:${secret}`, "utf8").digest();
/** Jeton du lien pour une version : base64url(HMAC-SHA256(clé, « lien-onboarding:v<version> »)), 32 caractères. */
export const linkToken = (key: Buffer, version: number): string => createHmac("sha256", key).update(`lien-onboarding:v${version}`, "utf8").digest("base64url").slice(0, TOKEN_LENGTH);
export const isOnboardingToken = (t: unknown): t is string => typeof t === "string" && ONBOARDING_TOKEN_RE.test(t);
/** Comparaison en temps constant (longueurs différentes : faux, sans comparer). */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Le jeton reçu ouvre-t-il le lien ? Faux si le lien est coupé, si le jeton est mal formé ou d'une autre version. */
export function tokenOpens(key: Buffer, setting: OnboardingLinkSetting, token: unknown): boolean {
  return setting.enabled && isOnboardingToken(token) && sameSecret(token, linkToken(key, setting.version));
}
/** Chemin public du lien. L'adresse complète se construit avec l'origine du site, comme les liens de saisie des KPI. */
export const onboardingLinkPath = (token: string) => `/bienvenue/${token}`;

/* ─────────────────────────── Cookie d'accès ─────────────────────────── */

export const COOKIE_NAME = "iconflow_bienvenue";
export const COOKIE_PATH = "/bienvenue";
export const COOKIE_DAYS = 30;
export const COOKIE_MAX_AGE = COOKIE_DAYS * 24 * 3600;
/** Accès ouvert : membre (« m ») ou personne d'un lien de saisie (« l »), son identifiant, la version du lien, l'expiration (ms). */
export interface Pass { k: "m" | "l"; id: string; v: number; exp: number }

const passSignature = (key: Buffer, body: string) => createHmac("sha256", key).update(`acces-onboarding:${body}`, "utf8").digest("base64url");
export function signPass(key: Buffer, pass: Pass): string {
  const body = Buffer.from(JSON.stringify({ k: pass.k, id: pass.id, v: pass.v, exp: pass.exp }), "utf8").toString("base64url");
  return `${body}.${passSignature(key, body)}`;
}
/** Nouvel accès, valable 30 jours, pour la version actuelle du lien. */
export const newPass = (who: { kind: "m" | "l"; id: string }, setting: OnboardingLinkSetting, now = Date.now()): Pass => ({ k: who.kind, id: who.id, v: setting.version, exp: now + COOKIE_MAX_AGE * 1000 });
/**
 * Accès lu dans le cookie, ou null : signature fausse (comparée en temps constant), contenu illisible, expiré,
 * d'une autre version du lien, ou lien coupé.
 */
export function readPass(key: Buffer, raw: unknown, setting: OnboardingLinkSetting, now = Date.now()): Pass | null {
  if (!setting.enabled || typeof raw !== "string" || raw.length > 600) return null;
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined || !sameSecret(sig, passSignature(key, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Pass>;
    if ((p.k !== "m" && p.k !== "l") || typeof p.id !== "string" || !p.id || p.id.length > 80) return null;
    if (typeof p.v !== "number" || p.v !== setting.version || typeof p.exp !== "number" || p.exp <= now) return null;
    return { k: p.k, id: p.id, v: p.v, exp: p.exp };
  } catch { return null; }
}

/* ─────────────────────────── Reconnaître la recrue ─────────────────────────── */

/** Membre de l'équipe (table profiles), réduit à ce qu'il faut pour le reconnaître. */
export interface MemberCandidate { id: string; role: string | null; display_name: string | null; email: string | null; disabled_at: string | null; marketing_role: string | null }
/** Personne d'un lien de saisie des KPI (jamais son jeton). */
export interface PersonCandidate { id: string; name: string; email: string | null; role: string; active: boolean }
export interface Recruit { kind: "m" | "l"; id: string; name: string; role: MarketingRole }

const lower = (v: string | null | undefined) => (typeof v === "string" ? v.trim().toLowerCase() : "");
/** Rôle d'un membre actif de l'équipe Marketing (setter si rien n'est précisé, comme salesRoleOf), sinon null. */
export function memberRecruit(m: MemberCandidate | null | undefined): Recruit | null {
  if (!m || m.role !== "marketing" || m.disabled_at) return null;
  const role: MarketingRole = m.marketing_role === "closer" || m.marketing_role === "media_buyer" ? m.marketing_role : "setter";
  return { kind: "m", id: m.id, name: (m.display_name ?? "").trim() || "", role };
}
/** Personne active d'un lien de saisie, avec un e-mail enregistré (setter ou closer), sinon null. */
export function personRecruit(p: PersonCandidate | null | undefined): Recruit | null {
  if (!p || p.active !== true || !p.email || (p.role !== "setter" && p.role !== "closer")) return null;
  return { kind: "l", id: p.id, name: p.name, role: p.role };
}
/**
 * Qui a tapé cet e-mail ? D'abord un membre actif de l'équipe Marketing, puis une personne active des liens de saisie
 * des KPI. Comparaison sans tenir compte des majuscules. E-mail invalide ou inconnu : null (un seul message pour tous les cas).
 */
export function matchRecruit(email: unknown, members: MemberCandidate[], people: PersonCandidate[]): Recruit | null {
  const e = normalizeEmail(email);
  if (!e) return null;
  for (const m of members) if (lower(m.email) === e) { const r = memberRecruit(m); if (r) return r; }
  for (const p of people) if (lower(p.email) === e) { const r = personRecruit(p); if (r) return r; }
  return null;
}
/** Prénom affiché (« Bonjour Julie ») ; vide si aucun nom n'est enregistré. */
export const recruitFirstName = (r: Pick<Recruit, "name">) => firstName(r.name || "").replace(/[()]/g, "");

/* ─────────────────────────── Contenu d'un rôle ─────────────────────────── */

/**
 * Ce qu'une recrue de ce rôle a le droit de voir : mêmes règles que la base pour un commercial de ce rôle
 * (politiques documents_marketing_read, folders_marketing_read, mkt_onboarding_steps_read) :
 *   • dossiers de l'espace Marketing de ce rôle, ou communs (sans rôle) ;
 *   • documents de l'espace Marketing, non archivés, rangés dans ces dossiers ou sans dossier ;
 *   • étapes d'onboarding de ce rôle, dans l'ordre.
 * Jamais un document de Studio, jamais celui d'un autre rôle.
 */
export function roleContent(role: MarketingRole, folders: Folder[], docs: Doc[], steps: Step[]): { folders: Folder[]; docs: Doc[]; steps: Step[] } {
  const visible = folders.filter((f) => f.space === "marketing" && (f.marketing_role == null || f.marketing_role === role)).sort((a, b) => a.position - b.position);
  const ids = new Set(visible.map((f) => f.id));
  const mine = docs.filter((d) => d.space === "marketing" && !d.archived_at && (d.folder_id == null || ids.has(d.folder_id)));
  return { folders: visible, docs: mine, steps: steps.filter((s) => s.role === role).sort((a, b) => a.position - b.position) };
}
/** Colonnes lues pour la liste des documents : tout sauf le contenu (lu seulement à l'ouverture d'un document). */
export const DOC_LIST_COLUMNS = "id, title, icon, kind, folder_id, space, author_id, archived_at, created_at, updated_at";
/** Lecture du contenu d'un rôle, filtres posés dans la requête ET revérifiés ici (roleContent). À appeler avec la clé service. */
export async function loadRoleContent(db: Db, role: MarketingRole) {
  const [folders, docs, steps] = await Promise.all([
    db.list<Folder>("document_folders", { where: [["eq", "space", "marketing"]], order: ["position", "asc"] }),
    db.list<Doc>("documents", { where: [["eq", "space", "marketing"], ["null", "archived_at"]], order: ["title", "asc"], columns: DOC_LIST_COLUMNS }),
    db.list<Step>("marketing_onboarding_steps", { where: [["eq", "role", role]], order: ["position", "asc"] }),
  ]);
  return roleContent(role, folders, docs, steps);
}

export interface DocGroup { key: string; name: string; standard: boolean; docs: Doc[] }
/**
 * Documents rangés par dossier pour la page de la recrue. Le dossier « Onboarding » de son rôle est rendu à part
 * (sous ses étapes) ; « SOPs » et « Ressources » sont toujours présents (même vides) ; les autres dossiers ne
 * s'affichent que s'ils contiennent un document ; les documents sans dossier vont dans « Autres documents ».
 */
export function groupDocs(role: MarketingRole, content: { folders: Folder[]; docs: Doc[] }): { onboarding: Doc[]; groups: DocGroup[] } {
  const byId = new Map(content.folders.map((f) => [f.id, f]));
  const root = content.folders.find((f) => !f.parent_id && f.marketing_role === role) ?? null;
  const child = (name: string) => (root ? content.folders.find((f) => f.parent_id === root.id && f.name === name) ?? null : null);
  const docsIn = (id: string | null) => content.docs.filter((d) => d.folder_id === id);
  // Nom affiché : le chemin depuis le dossier du rôle, sans répéter le nom du rôle (« SOPs › Appels »).
  const label = (f: Folder) => {
    const names: string[] = [];
    let cur: Folder | undefined = f;
    for (let i = 0; cur && i < 8; i++) {
      if (cur.id !== root?.id || cur.id === f.id) names.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return names.join(" › ");
  };
  const onboardingFolder = child("Onboarding"), sops = child("SOPs"), resources = child("Ressources");
  const groups: DocGroup[] = [
    { key: sops?.id ?? "sops", name: "SOPs", standard: true, docs: sops ? docsIn(sops.id) : [] },
    { key: resources?.id ?? "ressources", name: "Ressources", standard: true, docs: resources ? docsIn(resources.id) : [] },
  ];
  const taken = new Set([onboardingFolder?.id, sops?.id, resources?.id].filter(Boolean) as string[]);
  for (const f of content.folders) {
    if (taken.has(f.id)) continue;
    const list = docsIn(f.id);
    if (list.length) groups.push({ key: f.id, name: label(f), standard: false, docs: list });
  }
  const loose = docsIn(null);
  if (loose.length) groups.push({ key: "sans-dossier", name: "Autres documents", standard: false, docs: loose });
  return { onboarding: onboardingFolder ? docsIn(onboardingFolder.id) : [], groups };
}
/** Étapes affichées à la recrue : une étape ne renvoie à son document que si ce document est visible pour son rôle. */
export function stepsView(content: { docs: Doc[]; steps: Step[] }): Array<{ id: string; title: string; description: string | null; document_id: string | null }> {
  const visible = new Set(content.docs.map((d) => d.id));
  return content.steps.map((s) => ({ id: s.id, title: s.title, description: s.description, document_id: s.document_id && visible.has(s.document_id) ? s.document_id : null }));
}
/** Une étape existe-t-elle bien pour ce rôle ? (avant de cocher, côté serveur) */
export const stepOfRole = (steps: Step[], stepId: unknown, role: MarketingRole): Step | null => (typeof stepId === "string" ? steps.find((s) => s.id === stepId && s.role === role) ?? null : null);
/** Clé de la progression gardée sur l'appareil (personne d'un lien de saisie, sans profil). */
export const localProgressKey = (personId: string) => `iconflow-bienvenue:${personId}`;
