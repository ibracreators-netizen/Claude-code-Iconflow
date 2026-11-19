import type { Metadata } from "next";
import { requireAgency } from "@/lib/auth/session";
import { canAccess, canAccessSpace, type ModuleKey } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { AppsGrid, type AppIcon, type AppTone } from "@/components/layout/apps-grid";

export const metadata: Metadata = { title: "Applications" };

interface Entry { label: string; href: string; icon: AppIcon; module: ModuleKey; words?: string }
const GROUPS: Array<{ title: string; tone: AppTone; apps: Entry[] }> = [
  { title: "Clients", tone: "accent", apps: [
    { label: "Clients", href: "/studio/clients", icon: "clients", module: "clients", words: "liste crm" },
    { label: "Pipeline", href: "/studio/pipeline", icon: "pipeline", module: "pipeline", words: "suivi étapes kanban" },
    { label: "Messagerie", href: "/studio/messages", icon: "messages", module: "messages", words: "conversations" },
    { label: "À traiter", href: "/studio/inbox", icon: "inbox", module: "inbox", words: "file notifications" },
  ] },
  { title: "Production", tone: "info", apps: [
    { label: "Briefs & scripts", href: "/studio/briefs", icon: "briefs", module: "briefs", words: "concepts" },
    { label: "Livrables", href: "/studio/livrables", icon: "livrables", module: "livrables", words: "vidéos visuels validation" },
    { label: "Tâches", href: "/studio/taches", icon: "check", module: "taches", words: "kanban à faire" },
    { label: "Planning", href: "/studio/planning", icon: "calendrier", module: "planning", words: "calendrier tournages deadlines" },
    { label: "Performance", href: "/studio/performance", icon: "performance", module: "performance", words: "meta ads résultats" },
    { label: "Avatars", href: "/studio/avatars", icon: "avatars", module: "clients", words: "casting ia" },
    { label: "IA Process", href: "/studio/ia", icon: "ia", module: "briefs", words: "vidéo ia plans prompts" },
  ] },
  { title: "Connaissance", tone: "violet", apps: [
    { label: "Brain", href: "/studio/brain", icon: "brain", module: "brain", words: "mémoire marque" },
    { label: "Documents", href: "/studio/documents", icon: "documents", module: "documents", words: "sop stratégies comptes-rendus" },
    { label: "Fichiers", href: "/studio/fichiers", icon: "fichiers", module: "fichiers", words: "rushs exports drive" },
  ] },
  { title: "Gestion", tone: "warning", apps: [
    { label: "Tableau de bord", href: "/studio", icon: "dashboard", module: "dashboard", words: "accueil vue d'ensemble" },
    { label: "Facturation", href: "/studio/factures", icon: "factures", module: "factures", words: "factures devis avoirs" },
    { label: "Revenus", href: "/studio/factures/revenus", icon: "revenus", module: "factures", words: "récurrents retainers fin de contrat" },
    { label: "Équipe", href: "/studio/equipe", icon: "equipe", module: "equipe", words: "membres accès" },
    { label: "Paramètres", href: "/studio/parametres", icon: "reglages", module: "parametres", words: "compte réglages" },
  ] },
];

/** Toutes les pages de Studio, en grille : l'écran « Applications » du téléphone. */
export default async function StudioApplicationsPage() {
  const store = await requireAgency("dashboard");
  const profile = store.session.profile, can = (m: ModuleKey) => canAccess(profile, m);
  const groups = GROUPS.map((g) => ({ title: g.title, tone: g.tone, apps: g.apps.filter((a) => can(a.module)).map(({ label, href, icon, words }) => ({ label, href, icon, words })) })).filter((g) => g.apps.length);
  const quick = [
    ...(can("clients") ? [{ label: "Nouveau client", href: "/studio/clients?new=1", icon: "plus" as const }] : []),
    ...(can("factures") ? [{ label: "Nouvelle facture", href: "/studio/factures?new=1", icon: "factures" as const }] : []),
    ...(can("documents") ? [{ label: "Nouveau document", href: "/studio/documents?new=1", icon: "documents" as const }] : []),
    ...(can("taches") ? [{ label: "Mes tâches", href: "/studio/taches", icon: "check" as const }] : []),
  ];
  return (
    <>
      <PageHeader eyebrow="Espace agence" title="Applications" description={<span className="hidden sm:inline">Tout Studio, à un geste.</span>} />
      <AppsGrid groups={groups} quick={quick} account={{ name: profile.display_name ?? store.session.user.email, email: store.session.user.email, href: "/studio/parametres", other: canAccessSpace(profile, "marketing") ? { label: "Passer à Marketing", href: "/marketing" } : null }} />
    </>
  );
}
