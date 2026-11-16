import type { Metadata } from "next";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { canAccess, hasFullAccess, type ModuleKey } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { AppsGrid, type AppGroup, type AppIcon } from "./apps-grid";

export const metadata: Metadata = { title: "Applications" };

interface Entry { label: string; href: string; icon: AppIcon; module?: ModuleKey; admin?: boolean; words?: string }
const GROUPS: Array<{ title: string; apps: Entry[] }> = [
  { title: "Ventes", apps: [
    { label: "CRM", href: "/marketing/crm", icon: "crm", module: "marketing_prospects", words: "kanban pipeline leads prospects" },
    { label: "Liste des leads", href: "/marketing/crm?vue=liste", icon: "liste", module: "marketing_prospects", words: "tableau prospects" },
    { label: "Contacts", href: "/marketing/crm?vue=contacts", icon: "contacts", module: "marketing_contacts", words: "personnes fiches" },
    { label: "Tâches", href: "/marketing/taches", icon: "taches", module: "marketing_taches", words: "à appeler relances" },
    { label: "Calendrier", href: "/marketing/calendrier", icon: "calendrier", module: "marketing_calendrier", words: "rendez-vous agenda google iclosed" },
  ] },
  { title: "Pilotage", apps: [
    { label: "Closing", href: "/marketing/kpi", icon: "kpi", module: "marketing_classement", words: "kpi taux signatures" },
    { label: "Setters", href: "/marketing/kpi?onglet=setters", icon: "setters", module: "marketing_classement", words: "kpi rendez-vous" },
    { label: "Closers", href: "/marketing/kpi?onglet=closers", icon: "closers", module: "marketing_classement", words: "kpi appels" },
    { label: "Suivi du jour", href: "/marketing/kpi?onglet=suivi", icon: "suivi", module: "marketing_classement", words: "saisie appels passés quotidien" },
    { label: "Acquisition", href: "/marketing/acquisition", icon: "acquisition", module: "marketing_dashboard", words: "entonnoir pages campagnes" },
    { label: "Publicité", href: "/marketing/publicite", icon: "publicite", module: "marketing_publicite", words: "meta ads dépense" },
  ] },
  { title: "Équipe", apps: [
    { label: "Équipe", href: "/marketing/equipe", icon: "equipe", module: "marketing_equipe", words: "membres historique" },
    { label: "Inviter", href: "/marketing/reglages/equipe", icon: "inviter", module: "marketing_reglages", admin: true, words: "rôle accès setter closer" },
    { label: "Ressources", href: "/marketing/ressources", icon: "ressources", module: "marketing_ressources", words: "sop onboarding documents" },
  ] },
  { title: "Réglages", apps: [
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
  const profile = store.session.profile, admin = hasFullAccess(profile);
  const groups: AppGroup[] = GROUPS.map((g) => ({ title: g.title, apps: g.apps.filter((a) => (!a.module || canAccess(profile, a.module)) && (!a.admin || admin)).map(({ label, href, icon, words }) => ({ label, href, icon, words: words ?? "" })) })).filter((g) => g.apps.length);
  const agency = profile.role === "agency";
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Applications" description="Tout l'espace Marketing, à un geste." />
      <AppsGrid groups={groups} canCreateLead={canAccess(profile, "marketing_prospects")} canTrack={canAccess(profile, "marketing_classement") && profile.role === "marketing"}
        account={{ name: profile.display_name ?? store.session.user.email, email: store.session.user.email, href: agency ? "/studio/parametres" : "/marketing/compte", studio: agency }} />
    </>
  );
}
