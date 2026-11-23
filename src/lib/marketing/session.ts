import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { StoreError } from "@/lib/data/store";
import { canAccess, canAccessSpace, allowedModulesIn, type ModuleKey } from "@/lib/permissions";
import { DemoMarketing } from "./demo-store";
import { SupabaseMarketing } from "./store";
import type { MarketingStore } from "./store";

/** Magasin Marketing lié à la session (RLS en production, mémoire en démo). */
const marketingStore = cache(async (): Promise<MarketingStore> => {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "agency" && session.profile.role !== "marketing") redirect("/app");
  if (session.demo || !isSupabaseConfigured()) return new DemoMarketing(session);
  return new SupabaseMarketing(await createClient(), session);
});

/** Accès à l'espace Marketing (au moins un module), pour le layout. Renvoie au hub sinon. */
export async function requireMarketingSpace(): Promise<MarketingStore> {
  const store = await marketingStore();
  if (!canAccessSpace(store.session.profile, "marketing")) redirect("/hub?refuse=marketing");
  return store;
}

/**
 * Droit d'ouvrir la page d'un module. Le Tableau de bord s'ouvre aussi avec « Dépenses publicitaires » (ancienne page
 * Publicité, fondue dedans) ; un setter ou un closer l'ouvre avec le droit KPI (la page ne lui montre que ses chiffres).
 */
function canOpen(profile: Parameters<typeof canAccess>[0], module: ModuleKey): boolean {
  return canAccess(profile, module) || (module === "marketing_dashboard" && canAccess(profile, "marketing_publicite"));
}

/** Page de l'espace Marketing : vérifie le droit au module (sinon renvoie vers une page permise, ou au hub). */
export async function requireMarketing(module: ModuleKey): Promise<MarketingStore> {
  const store = await marketingStore();
  const profile = store.session.profile;
  if (!canAccessSpace(profile, "marketing")) redirect("/hub?refuse=marketing");
  if (!canOpen(profile, module)) {
    // Première page d'un module autorisé, jamais la page qui vient d'être refusée (pas de boucle), sinon le hub.
    const here = marketingHome(module);
    const next = allowedModulesIn(profile, "marketing").map(marketingHome).find((page) => page && page !== here);
    redirect(next ? `/marketing/${next}` : "/hub?refuse=marketing");
  }
  return store;
}

/** Magasin pour une server action Marketing : refuse si le module n'est pas autorisé. */
export async function getMarketingStoreFor(module: ModuleKey): Promise<MarketingStore> {
  const store = await marketingStore();
  if (!canAccess(store.session.profile, module)) throw new StoreError("forbidden_module");
  return store;
}

/** Première page de l'espace Marketing pour un module donné. */
export function marketingHome(module: ModuleKey): string {
  switch (module) {
    case "marketing_espace": return "accueil";
    case "marketing_publicite": return "acquisition"; // ouverte aussi par ce droit (voir canOpen)
    case "marketing_classement": return "kpi";
    case "marketing_dashboard": return "acquisition";
    case "marketing_equipe": return "equipe";
    case "marketing_ressources": return "ressources";
    case "marketing_reception": return "reglages";
    case "marketing_contacts": return "contacts";
    case "marketing_prospects": return "crm";
    case "marketing_taches": return "taches";
    case "marketing_calendrier": return "calendrier";
    case "marketing_relances": return "reglages";
    case "marketing_reglages": return "reglages";
    default: return "";
  }
}
