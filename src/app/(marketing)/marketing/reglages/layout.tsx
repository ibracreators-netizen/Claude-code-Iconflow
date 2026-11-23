import { requireMarketingSpace } from "@/lib/marketing/session";
import { canAccess } from "@/lib/permissions";
import { ReglagesMenu } from "./menu";
import { sectionFlags } from "./server";

/**
 * Réglages Marketing, comme l'écran « Paramètres » de LeadConnector.
 * - Ordinateur : le menu des rubriques à gauche (il reste en place au défilement), la rubrique ouverte à droite.
 * - Téléphone : pas de menu ici ; /marketing/reglages montre la liste des rubriques, chaque rubrique a sa page
 *   avec « ← » vers la liste dans l'en-tête (voir SUB_PAGES du cadre).
 * Sans le droit aux Réglages, rien n'est ajouté : la page elle-même renvoie ailleurs, comme avant.
 */
export default async function ReglagesLayout({ children }: { children: React.ReactNode }) {
  const store = await requireMarketingSpace();
  const profile = store.session.profile;
  if (!canAccess(profile, "marketing_reglages")) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="hidden lg:sticky lg:top-[84px] lg:block">
        <ReglagesMenu flags={sectionFlags(profile)} />
      </aside>
      {/* Le menu remplace, sur ordinateur, le lien « ← Réglages » des sous-pages (BackLink). */}
      <div className="min-w-0 lg:[&_.mk-backlink]:hidden">{children}</div>
    </div>
  );
}
