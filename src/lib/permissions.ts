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

/** Accès complet = permissions null (fondateur, membres historiques). */
export function hasFullAccess(profile: Pick<Profile, "role" | "permissions">) {
  return profile.role === "agency" && profile.permissions === null;
}

export function canAccess(profile: Pick<Profile, "role" | "permissions">, module: ModuleKey) {
  if (profile.role !== "agency") return false;
  if (profile.permissions === null) return true;
  if (ALWAYS_ALLOWED.includes(module)) return true;
  return profile.permissions.includes(module);
}

export function allowedModules(profile: Pick<Profile, "role" | "permissions">): ModuleKey[] {
  return ALL_MODULE_KEYS.filter((k) => canAccess(profile, k));
}

/** Nettoie une liste de droits saisie (clés inconnues retirées, modules obligatoires ajoutés). */
export function normalizePermissions(list: string[] | null): string[] | null {
  if (list === null) return null;
  const set = new Set(list.filter((k): k is ModuleKey => (ALL_MODULE_KEYS as string[]).includes(k)));
  ALWAYS_ALLOWED.forEach((k) => set.add(k));
  return ALL_MODULE_KEYS.filter((k) => set.has(k));
}

/** Résumé lisible des droits d'un membre. */
export function permissionsSummary(value: string[] | null) {
  if (value === null) return "Accès complet";
  const n = value.filter((k) => !(ALWAYS_ALLOWED as string[]).includes(k)).length;
  return n === 0 ? "Accès minimal" : `${n} module${n > 1 ? "s" : ""}`;
}
