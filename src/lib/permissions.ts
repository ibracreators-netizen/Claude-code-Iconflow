import type { Profile } from "@/lib/data/types";

export type Space = "studio" | "marketing";

/**
 * Modules de l'agence, répartis en deux espaces (Studio, Marketing). La clé sert aux droits par membre
 * (profiles.permissions) et aux policies RLS (my_has_module). Un membre peut recevoir Marketing sans Studio,
 * et inversement : seuls « dashboard » et « parametres » (Studio) sont toujours accordés.
 */
export const STUDIO_MODULES = [
  { key: "dashboard", label: "Tableau de bord", always: true, space: "studio" },
  { key: "inbox", label: "À traiter", space: "studio" },
  { key: "clients", label: "Clients", space: "studio" },
  { key: "pipeline", label: "Pipeline", space: "studio" },
  { key: "messages", label: "Messagerie", space: "studio" },
  { key: "briefs", label: "Briefs & scripts", space: "studio" },
  { key: "livrables", label: "Livrables", space: "studio" },
  { key: "taches", label: "Tâches", space: "studio" },
  { key: "planning", label: "Planning", space: "studio" },
  { key: "performance", label: "Performance", space: "studio" },
  { key: "brain", label: "Brain", space: "studio" },
  { key: "documents", label: "Documents", space: "studio" },
  { key: "fichiers", label: "Fichiers", space: "studio" },
  { key: "factures", label: "Facturation", space: "studio" },
  { key: "equipe", label: "Équipe & accès", space: "studio" },
  { key: "parametres", label: "Paramètres", always: true, space: "studio" },
  // ── IconFlow Marketing (acquisition de l'agence) ──
  { key: "marketing_dashboard", label: "Données marketing", space: "marketing" },
  { key: "marketing_prospects", label: "Prospects", space: "marketing" },
  { key: "marketing_calendrier", label: "Calendrier", space: "marketing" },
  { key: "marketing_relances", label: "Relances & rappels", space: "marketing" },
  { key: "marketing_reglages", label: "Réglages marketing", space: "marketing" },
] as const;

export type ModuleKey = (typeof STUDIO_MODULES)[number]["key"];
export const ALL_MODULE_KEYS = STUDIO_MODULES.map((m) => m.key) as ModuleKey[];
export const ALWAYS_ALLOWED: ModuleKey[] = STUDIO_MODULES.filter((m) => "always" in m && m.always).map((m) => m.key);

/** Espace d'un module (Studio par défaut). */
export const spaceOf = (key: ModuleKey): Space => STUDIO_MODULES.find((m) => m.key === key)?.space ?? "studio";
export const MARKETING_MODULE_KEYS = ALL_MODULE_KEYS.filter((k) => spaceOf(k) === "marketing");
export const isMarketingModule = (key: ModuleKey) => spaceOf(key) === "marketing";
/** Clés d'un espace (pour l'écran Équipe & accès, regroupé par espace). */
export const modulesForSpace = (space: Space) => STUDIO_MODULES.filter((m) => m.space === space);

type Rights = Pick<Profile, "role" | "permissions">;

/** Accès complet = permissions null (fondateur, membres historiques). */
export function hasFullAccess(profile: Rights) {
  return profile.role === "agency" && profile.permissions === null;
}

export function canAccess(profile: Rights, module: ModuleKey) {
  if (profile.role !== "agency") return false;
  if (profile.permissions === null) return true;
  if (ALWAYS_ALLOWED.includes(module)) return true;
  return profile.permissions.includes(module);
}

export function allowedModules(profile: Rights): ModuleKey[] {
  return ALL_MODULE_KEYS.filter((k) => canAccess(profile, k));
}

/** Modules autorisés d'un espace donné (Studio ou Marketing). */
export function allowedModulesIn(profile: Rights, space: Space): ModuleKey[] {
  return allowedModules(profile).filter((k) => spaceOf(k) === space);
}

/**
 * Le membre peut-il ouvrir l'espace Marketing ? Oui s'il a l'accès complet, ou au moins un module Marketing.
 * (Studio reste accessible à tout membre agence via « dashboard »/« parametres » toujours accordés.)
 */
export function canAccessSpace(profile: Rights, space: Space): boolean {
  if (profile.role !== "agency") return false;
  if (space === "studio") return true;
  if (hasFullAccess(profile)) return true;
  return MARKETING_MODULE_KEYS.some((k) => canAccess(profile, k));
}

/** Nettoie une liste de droits saisie (clés inconnues retirées, modules obligatoires ajoutés). */
export function normalizePermissions(list: string[] | null): string[] | null {
  if (list === null) return null;
  const set = new Set(list.filter((k): k is ModuleKey => (ALL_MODULE_KEYS as string[]).includes(k)));
  ALWAYS_ALLOWED.forEach((k) => set.add(k));
  return ALL_MODULE_KEYS.filter((k) => set.has(k));
}

/**
 * Valeur brute lue en base (jsonb) → droits sûrs : null = accès complet, tableau = modules.
 * Toute autre forme (objet, texte, nombre) vaut accès minimal plutôt qu'un plantage ou un accès complet.
 */
export function sanitizePermissions(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return normalizePermissions([]);
  return normalizePermissions(raw.filter((k): k is string => typeof k === "string"));
}

/** Modules qu'un membre peut accorder à d'autres : tout (null) avec l'accès complet, sinon uniquement les siens. */
export function grantableModules(me: Rights): ModuleKey[] | null {
  return hasFullAccess(me) ? null : allowedModules(me);
}

/**
 * `me` peut-il donner les droits `next` à un compte qui a aujourd'hui `current` ?
 * On retire ce que l'on veut ; on n'ajoute que des modules que l'on possède ; l'accès complet ne s'accorde qu'avec l'accès complet.
 */
export function canGrant(me: Rights, current: string[] | null, next: string[] | null): boolean {
  if (hasFullAccess(me)) return true;
  if (next === null) return false;
  const mine = new Set<string>(allowedModules(me));
  const had = new Set(current ?? []);
  return next.every((k) => had.has(k) || mine.has(k));
}

/** `me` peut-il gérer le compte `target` (droits, accès, fonction, rattachement) ? Jamais soi-même, ni un administrateur si l'on est limité. */
export function canManageAccount(me: Rights & { id: string }, target: Rights & { id: string }): boolean {
  if (!canAccess(me, "equipe") || target.id === me.id) return false;
  if (target.role === "client") return true;
  return hasFullAccess(me) || target.permissions !== null;
}

/** Résumé lisible des droits d'un membre. */
export function permissionsSummary(value: string[] | null) {
  if (value === null) return "Accès complet";
  const n = value.filter((k) => !(ALWAYS_ALLOWED as string[]).includes(k)).length;
  return n === 0 ? "Accès minimal" : `${n} module${n > 1 ? "s" : ""}`;
}
