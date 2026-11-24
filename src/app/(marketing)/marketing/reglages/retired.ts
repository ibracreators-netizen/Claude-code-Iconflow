import "server-only";
import { redirect } from "next/navigation";
import { marketingHome, requireMarketingSpace } from "@/lib/marketing/session";
import { allowedModulesIn, canAccess } from "@/lib/permissions";

/** Pages retirées de l'interface (les leads arrivent maintenant dans GoHighLevel) : leur adresse, relative à /marketing/. */
const RETIRED = new Set(["reglages/reception", "reglages/automatisations", "relances", "reception"]);

/**
 * Anciennes adresses des Leads reçus, des Automatisations et des Emails automatiques : vers les Réglages.
 * Sans le droit aux Réglages, vers la première page permise qui n'est pas elle-même retirée (jamais de boucle), sinon le hub.
 */
export async function leaveRetiredPage(): Promise<never> {
  const store = await requireMarketingSpace();
  const profile = store.session.profile;
  if (canAccess(profile, "marketing_reglages")) redirect("/marketing/reglages");
  const home = allowedModulesIn(profile, "marketing").map(marketingHome).find((page) => page && !RETIRED.has(page));
  redirect(home ? `/marketing/${home}` : "/hub?refuse=marketing");
}
