import type { Metadata } from "next";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { canAccess, hasFullAccess, type ModuleKey } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { AppsGrid, type AppIcon, type AppTone } from "@/components/layout/apps-grid";

export const metadata: Metadata = { title: "Applications" };

interface Entry { label: string; href: string; icon: AppIcon; module?: ModuleKey; admin?: boolean; words?: string }
const GROUPS: Array<{ title: string; tone: AppTone; apps: Entry[] }> = [
  { title: "Ventes", tone: "accent", apps: [
    { label: "Mon espace", href: "/marketing/espace", icon: "home", module: "marketing_espace", words: "accueil journée" },
    { label: "CRM", href: "/marketing/crm", icon: "crm", module: "marketing_prospects", words: "kanban pipeline leads prospects opportunités" },
    { label: "Liste des leads", href: "/marketing/crm?vue=liste", icon: "liste", module: "marketing_prospects", words: "tableau prospects" },
    { label: "Contacts", href: "/marketing/crm?vue=contacts", icon: "contacts", module: "marketing_contacts", words: "personnes fiches" },
    { label: "Tâches", href: "/marketing/taches", icon: "taches", module: "marketing_taches", words: "à appeler relances activités" },
    { label: "Calendrier", href: "/marketing/calendrier", icon: "calendrier", module: "marketing_calendrier", words: "rendez-vous agenda google iclosed" },
  ] },
  { title: "Pilotage", tone: "info", apps: [
    { label: "Closing", href: "/marketing/kpi", icon: "kpi", module: "marketing_classement", words: "kpi taux signatures tableau de bord" },
    { label: "Setters", href: "/marketing/kpi?onglet=setters", icon: "setters", module: "marketing_classement", words: "kpi rendez-vous" },
    { label: "Closers", href: "/marketing/kpi?onglet=closers", icon: "closers", module: "marketing_classement", words: "kpi appels" },
    { label: "Suivi du jour", href: "/marketing/kpi?onglet=suivi", icon: "suivi", module: "marketing_classement", words: "saisie appels passés quotidien" },
    { label: "Acquisition", href: "/marketing/acquisition", icon: "acquisition", module: "marketing_dashboard", words: "entonnoir pages campagnes" },
    { label: "Publicité", href: "/marketing/publicite", icon: "publicite", module: "marketing_publicite", words: "meta ads dépense" },
  ] },
  { title: "Équipe", tone: "violet", apps: [
    { label: "Équipe", href: "/marketing/equipe", icon: "equipe", module: "marketing_equipe", words: "membres historique" },
    { label: "Inviter", href: "/marketing/reglages/equipe", icon: "inviter", module: "marketing_reglages", admin: true, words: "rôle accès setter closer" },
    { label: "Ressources", href: "/marketing/ressources", icon: "ressources", module: "marketing_ressources", words: "sop onboarding documents formation" },
  ] },
  { title: "Réglages", tone: "warning", apps: [
    { label: "Réglages", href: "/marketing/reglages", icon: "reglages", module: "marketing_reglages", words: "pipeline étapes outils" },
    { label: "Automatisations", href: "/marketing/reglages/automatisations", icon: "automatisations", module: "marketing_reglages", words: "règles relances journal" },
    { label: "Leads reçus", href: "/marketing/reglages/reception", icon: "reception", module: "marketing_reception", words: "contrôle technique réception" },
    { label: "Emails auto", href: "/marketing/relances", icon: "emails", module: "marketing_relances", words: "relances rappels file" },
    { label: "Import GHL", href: "/marketing/reglages/import", icon: "import", module: "marketing_reglages", admin: true, words: "gohighlevel csv" },
  ] },
];

/** Toutes les pages de l'espace Marketing, en grille : l'écran « Applications » du téléphone. */
export default async function ApplicationsPage() {
  const store = await requireMarketingSpace();
  const profile = store.session.profile, admin = hasFullAccess(profile), can = (m: ModuleKey) => canAccess(profile, m);
  const groups = GROUPS.map((g) => ({ title: g.title, tone: g.tone, apps: g.apps.filter((a) => (!a.module || can(a.module)) && (!a.admin || admin)).map(({ label, href, icon, words }) => ({ label, href, icon, words })) })).filter((g) => g.apps.length);
  const agency = profile.role === "agency";
  const quick = [
    ...(can("marketing_prospects") ? [{ label: "Nouveau lead", href: "/marketing/crm?nouveau=1", icon: "plus" as const }] : []),
    ...(can("marketing_taches") ? [{ label: "Mes tâches", href: "/marketing/taches", icon: "taches" as const }] : []),
    ...(can("marketing_calendrier") ? [{ label: "Mes rendez-vous", href: "/marketing/calendrier", icon: "calendrier" as const }] : []),
    ...(can("marketing_classement") ? [{ label: "Saisir mon suivi", href: "/marketing/kpi?onglet=suivi", icon: "suivi" as const }] : []),
  ];
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Applications" description={<span className="hidden sm:inline">Tout l&apos;espace Marketing, à un geste.</span>} />
      <AppsGrid groups={groups} quick={quick} account={{ name: profile.display_name ?? store.session.user.email, email: store.session.user.email, href: agency ? "/studio/parametres" : "/marketing/compte", other: agency ? { label: "Passer à Studio", href: "/studio" } : null }} />
    </>
  );
}
