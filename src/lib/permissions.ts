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
  { key: "marketing_espace", label: "Accueil", space: "marketing" },
  { key: "marketing_dashboard", label: "Tableau de bord", space: "marketing" },
  { key: "marketing_publicite", label: "Dépenses publicitaires", space: "marketing" },
  { key: "marketing_reception", label: "Leads reçus (contrôle technique)", space: "marketing" },
  { key: "marketing_contacts", label: "Contacts", space: "marketing" },
  { key: "marketing_prospects", label: "Prospects et paiements", space: "marketing" },
  { key: "marketing_taches", label: "Tâches marketing", space: "marketing" },
  { key: "marketing_calendrier", label: "Calendrier", space: "marketing" },
  { key: "marketing_relances", label: "Emails automatiques", space: "marketing" },
  { key: "marketing_classement", label: "KPI · setters et closers", space: "marketing" },
  { key: "marketing_equipe", label: "Équipe", space: "marketing" },
  { key: "marketing_ressources", label: "Ressources & onboarding", space: "marketing" },
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
  // Commercial : uniquement les modules Marketing de sa liste. Jamais Studio, jamais « toujours accordé ».
  if (profile.role === "marketing") return isMarketingModule(module) && Array.isArray(profile.permissions) && profile.permissions.includes(module);
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
  if (profile.role === "marketing") return space === "marketing" && MARKETING_MODULE_KEYS.some((k) => canAccess(profile, k));
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


/* ─── Rôles commerciaux de l'espace Marketing ─────────────────────────────── */

export type SalesRole = "setter" | "closer" | "media_buyer";
/** Modules accordés à chaque rôle commercial. L'administrateur (membre agence à accès complet) a tout. */
export const SALES_ROLE_MODULES: Record<SalesRole, ModuleKey[]> = {
  setter: ["marketing_espace", "marketing_contacts", "marketing_prospects", "marketing_taches", "marketing_calendrier", "marketing_classement", "marketing_ressources"],
  closer: ["marketing_espace", "marketing_contacts", "marketing_prospects", "marketing_taches", "marketing_calendrier", "marketing_classement", "marketing_ressources"],
  media_buyer: ["marketing_espace", "marketing_dashboard", "marketing_ressources"],
};
/**
 * Pages qu'un administrateur peut accorder à un compte commercial. Les pages d'administration (Réglages,
 * Équipe, contrôle des leads reçus) restent aux membres de l'agence. « Emails automatiques » (marketing_relances) et
 * « Dépenses publicitaires » (marketing_publicite) ne sont plus proposées : les e-mails automatiques ne sont plus une
 * page de l'espace, et le Tableau de bord (marketing_dashboard) ouvre tout ce que la seconde ouvrait, en base aussi
 * (0022, 0023). Un droit déjà posé reste lu (sanitizeSalesPermissions) ; il tombe quand l'administrateur change les pages.
 * L'ordre de cette liste est celui des cases à cocher (invitation, Réglages › Équipe et accès).
 */
export const SALES_ASSIGNABLE_MODULES: ModuleKey[] = ["marketing_espace", "marketing_prospects", "marketing_contacts", "marketing_taches", "marketing_calendrier", "marketing_classement", "marketing_dashboard", "marketing_ressources"];
export const moduleLabel = (key: string): string => STUDIO_MODULES.find((m) => m.key === key)?.label ?? key;
/** Droits d'un compte commercial lus en base : seules les clés Marketing connues sont gardées. */
export function sanitizeSalesPermissions(raw: unknown): string[] {
  return Array.isArray(raw) ? MARKETING_MODULE_KEYS.filter((k) => raw.includes(k)) : [];
}
/** Page d'accueil d'un compte, selon son rôle. */
export function homeFor(profile: Pick<Profile, "role">): string {
  return profile.role === "agency" ? "/studio" : profile.role === "marketing" ? "/marketing" : "/app";
}
