import type { Profile } from "@/lib/data/types";

/** Modules de l'espace agence. La clé sert aux droits par membre (profiles.permissions). */
export const STUDIO_MODULES = [
  { key: "dashboard", label: "Tableau de bord", always: true },
  { key: "inbox", label: "À traiter" },
  { key: "clients", label: "Clients" },
  { key: "pipeline", label: "Pipeline" },
  { key: "messages", label: "Messagerie" },
  { key: "briefs", label: "Briefs & scripts" },
  { key: "livrables", label: "Livrables" },
  { key: "taches", label: "Tâches" },
  { key: "planning", label: "Planning" },
  { key: "performance", label: "Performance" },
  { key: "brain", label: "Brain" },
  { key: "documents", label: "Documents" },
  { key: "fichiers", label: "Fichiers" },
  { key: "factures", label: "Facturation" },
  { key: "equipe", label: "Équipe & accès" },
  { key: "parametres", label: "Paramètres", always: true },
] as const;

export type ModuleKey = (typeof STUDIO_MODULES)[number]["key"];
export const ALL_MODULE_KEYS = STUDIO_MODULES.map((m) => m.key) as ModuleKey[];
export const ALWAYS_ALLOWED: ModuleKey[] = STUDIO_MODULES.filter((m) => "always" in m && m.always).map((m) => m.key);

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
