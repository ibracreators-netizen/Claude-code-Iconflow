import { redirect } from "next/navigation";
import { requireMarketingSpace, marketingHome } from "@/lib/marketing/session";
import { allowedModules } from "@/lib/permissions";

/** Accueil de l'espace Marketing : la première page à laquelle le compte a droit. */
export default async function MarketingIndex() {
  const store = await requireMarketingSpace();
  const mods = allowedModules(store.session.profile);
  const order = ["marketing_espace", "marketing_prospects", "marketing_dashboard", "marketing_classement", "marketing_taches", "marketing_calendrier", "marketing_publicite", "marketing_ressources", "marketing_reglages"] as const;
  const first = order.find((m) => mods.includes(m)) ?? "marketing_espace";
  redirect(`/marketing/${marketingHome(first)}`);
}
