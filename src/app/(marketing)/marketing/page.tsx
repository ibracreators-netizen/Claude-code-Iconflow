import { redirect } from "next/navigation";
import { requireMarketingSpace, marketingHome } from "@/lib/marketing/session";
import { allowedModules } from "@/lib/permissions";

/**
 * Entrée de l'espace Marketing : le tableau de bord (comme LeadConnector), sinon les tâches (« Éléments à faire »,
 * qui remplacent l'ancien « Mon espace » des setters et closers), sinon la première page permise.
 * L'application installée sur téléphone s'ouvre, elle, sur l'Accueil (voir marketing.webmanifest).
 */
export default async function MarketingIndex() {
  const store = await requireMarketingSpace();
  const mods = allowedModules(store.session.profile);
  const order = ["marketing_dashboard", "marketing_taches", "marketing_prospects", "marketing_espace", "marketing_classement", "marketing_calendrier", "marketing_ressources", "marketing_reglages"] as const;
  const first = order.find((m) => mods.includes(m)) ?? "marketing_espace";
  redirect(`/marketing/${marketingHome(first)}`);
}
