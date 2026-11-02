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
  if (session.profile.role !== "agency") redirect("/app");
  if (session.demo || !isSupabaseConfigured()) return new DemoMarketing(session);
  return new SupabaseMarketing(await createClient(), session);
});

/** Accès à l'espace Marketing (au moins un module), pour le layout. Renvoie au hub sinon. */
export async function requireMarketingSpace(): Promise<MarketingStore> {
  const store = await marketingStore();
  if (!canAccessSpace(store.session.profile, "marketing")) redirect("/hub?refuse=marketing");
  return store;
}

/** Page de l'espace Marketing : vérifie le droit au module (sinon renvoie au hub). */
export async function requireMarketing(module: ModuleKey): Promise<MarketingStore> {
  const store = await marketingStore();
  if (!canAccessSpace(store.session.profile, "marketing")) redirect("/hub?refuse=marketing");
  if (!canAccess(store.session.profile, module)) {
    // On envoie vers le premier module Marketing autorisé, sinon le hub.
    const first = allowedModulesIn(store.session.profile, "marketing")[0];
    redirect(first ? `/marketing/${marketingHome(first)}` : "/hub?refuse=marketing");
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
    case "marketing_prospects": return "prospects";
    case "marketing_calendrier": return "calendrier";
    case "marketing_relances": return "relances";
    case "marketing_reglages": return "reglages";
    default: return "";
  }
}
