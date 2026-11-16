import type { LucideIcon } from "lucide-react";
import {
  BookOpenText, Brain, Building2, CalendarDays, CheckSquare, Clapperboard, FileText, FolderOpen, Gauge, Home, Megaphone,
  LayoutDashboard, LineChart, ListChecks, MessageSquare, Receipt, Settings, Sparkles, Target, Users, UsersRound, Wallet,
} from "lucide-react";

/** `pinned` : entrée utilitaire (réglages) épinglée en bas de barre, hors de la liste qui défile. */
/** `also` : pages regroupées sous la même entrée (onglets en haut de page). L'entrée s'affiche si l'une d'elles est permise. */
export interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: string; exact?: boolean; module?: string; pinned?: boolean; also?: Array<{ href: string; module?: string }> }
export interface NavGroup { label?: string; items: NavItem[] }

export const studioNav: NavGroup[] = [
  { items: [
    { href: "/studio", label: "Tableau de bord", icon: LayoutDashboard, exact: true, module: "dashboard", badgeKey: "inbox", also: [{ href: "/studio/inbox", module: "inbox" }] },
  ] },
  { label: "Clients", items: [
    { href: "/studio/clients", label: "Clients", icon: Building2, module: "clients", also: [{ href: "/studio/pipeline", module: "pipeline" }] },
    { href: "/studio/messages", label: "Messagerie", icon: MessageSquare, badgeKey: "messages", module: "messages" },
  ] },
  { label: "Production", items: [
    { href: "/studio/briefs", label: "Briefs & scripts", icon: FileText, badgeKey: "briefs", module: "briefs" },
    { href: "/studio/livrables", label: "Livrables", icon: Clapperboard, badgeKey: "livrables", module: "livrables" },
    { href: "/studio/taches", label: "Tâches & planning", icon: CheckSquare, badgeKey: "taches", module: "taches", also: [{ href: "/studio/planning", module: "planning" }] },
    { href: "/studio/performance", label: "Performance", icon: LineChart, module: "performance" },
    { href: "/studio/avatars", label: "Outils IA", icon: Sparkles, module: "clients", also: [{ href: "/studio/ia", module: "briefs" }] },
  ] },
  { label: "Connaissance", items: [
    { href: "/studio/brain", label: "Brain", icon: Brain, module: "brain" },
    { href: "/studio/documents", label: "Documents & fichiers", icon: BookOpenText, module: "documents", also: [{ href: "/studio/fichiers", module: "fichiers" }] },
  ] },
  { label: "Gestion", items: [
    { href: "/studio/factures", label: "Facturation", icon: Receipt, badgeKey: "factures", module: "factures" },
    { href: "/studio/equipe", label: "Équipe", icon: UsersRound, module: "equipe" },
    { href: "/studio/parametres", label: "Paramètres", icon: Settings, module: "parametres", pinned: true },
  ] },
];

/** Onglets en haut des pages regroupées sous une même entrée de menu. */
export const SECTION_TABS = {
  accueil: [{ href: "/studio", label: "Vue d'ensemble", module: "dashboard" }, { href: "/studio/inbox", label: "À traiter", module: "inbox" }],
  clients: [{ href: "/studio/clients", label: "Liste", module: "clients" }, { href: "/studio/pipeline", label: "Pipeline", module: "pipeline" }],
  taches: [{ href: "/studio/taches", label: "Tâches", module: "taches" }, { href: "/studio/planning", label: "Planning", module: "planning" }],
  bibliotheque: [{ href: "/studio/documents", label: "Documents", module: "documents" }, { href: "/studio/fichiers", label: "Fichiers", module: "fichiers" }],
  ia: [{ href: "/studio/avatars", label: "Avatars", module: "clients" }, { href: "/studio/ia", label: "IA Process", module: "briefs" }],
  facturation: [{ href: "/studio/factures", label: "Factures", module: "factures" }, { href: "/studio/factures/revenus", label: "Revenus récurrents", module: "factures" }],
  equipe: [{ href: "/studio/equipe", label: "Agence et clients", module: "equipe" }, { href: "/marketing/equipe", label: "Commerciaux", module: "marketing_equipe" }],
} as const;
export type SectionKey = keyof typeof SECTION_TABS;

export const marketingNav: NavGroup[] = [
  { items: [
    { href: "/marketing/espace", label: "Mon espace", icon: Home, module: "marketing_espace" },
  ] },
  { label: "Ventes", items: [
    { href: "/marketing/crm", label: "CRM", icon: Target, module: "marketing_prospects" },
    { href: "/marketing/taches", label: "Tâches", icon: ListChecks, badgeKey: "marketing_taches", module: "marketing_taches" },
    { href: "/marketing/calendrier", label: "Calendrier", icon: CalendarDays, module: "marketing_calendrier" },
  ] },
  { label: "Pilotage", items: [
    { href: "/marketing/kpi", label: "KPI", icon: Gauge, module: "marketing_classement" },
    { href: "/marketing/acquisition", label: "Acquisition", icon: LineChart, module: "marketing_dashboard" },
    { href: "/marketing/publicite", label: "Publicité", icon: Megaphone, module: "marketing_publicite" },
  ] },
  { label: "Équipe", items: [
    { href: "/marketing/equipe", label: "Équipe", icon: Users, module: "marketing_equipe" },
    { href: "/marketing/ressources", label: "Ressources", icon: BookOpenText, module: "marketing_ressources" },
  ] },
  { label: "Réglages", items: [
    { href: "/marketing/reglages", label: "Réglages", icon: Settings, module: "marketing_reglages", pinned: true },
  ] },
];

/**
 * Téléphone, espace Marketing : barre d'onglets en bas. Les quatre premières entrées permises au compte,
 * dans cet ordre, puis « Applications » qui ouvre tout le reste.
 */
export const marketingTabs: NavItem[] = [
  { href: "/marketing/espace", label: "Accueil", icon: Home, module: "marketing_espace" },
  { href: "/marketing/crm", label: "CRM", icon: Target, module: "marketing_prospects" },
  { href: "/marketing/calendrier", label: "Calendrier", icon: CalendarDays, module: "marketing_calendrier" },
  { href: "/marketing/taches", label: "Tâches", icon: ListChecks, badgeKey: "marketing_taches", module: "marketing_taches" },
  { href: "/marketing/kpi", label: "KPI", icon: Gauge, module: "marketing_classement" },
  { href: "/marketing/acquisition", label: "Acquisition", icon: LineChart, module: "marketing_dashboard" },
  { href: "/marketing/publicite", label: "Publicité", icon: Megaphone, module: "marketing_publicite" },
];
export const MARKETING_APPS_HREF = "/marketing/applications";
/** Téléphone, Studio : même principe. */
export const studioTabs: NavItem[] = [
  { href: "/studio", label: "Accueil", icon: Home, exact: true, module: "dashboard", badgeKey: "inbox" },
  { href: "/studio/clients", label: "Clients", icon: Building2, module: "clients" },
  { href: "/studio/taches", label: "Tâches", icon: CheckSquare, badgeKey: "taches", module: "taches" },
  { href: "/studio/messages", label: "Messages", icon: MessageSquare, badgeKey: "messages", module: "messages" },
  { href: "/studio/briefs", label: "Briefs", icon: FileText, badgeKey: "briefs", module: "briefs" },
  { href: "/studio/livrables", label: "Livrables", icon: Clapperboard, badgeKey: "livrables", module: "livrables" },
];
export const STUDIO_APPS_HREF = "/studio/applications";

export const portalNav: NavGroup[] = [
  { items: [
    { href: "/app", label: "Vue d'ensemble", icon: Home, exact: true },
    { href: "/app/validations", label: "À valider", icon: CheckSquare, badgeKey: "validations" },
  ] },
  { label: "Création", items: [
    { href: "/app/brain", label: "Brain", icon: Brain },
    { href: "/app/briefs", label: "Briefs & scripts", icon: FileText },
    { href: "/app/livrables", label: "Livrables", icon: Clapperboard },
    { href: "/app/avatars", label: "Avatars", icon: Users },
  ] },
  { label: "Espace", items: [
    { href: "/app/performance", label: "Performance", icon: LineChart },
    { href: "/app/documents", label: "Documents", icon: BookOpenText },
    { href: "/app/fichiers", label: "Fichiers", icon: FolderOpen },
    { href: "/app/factures", label: "Factures", icon: Wallet },
    { href: "/app/messages", label: "Messagerie", icon: MessageSquare, badgeKey: "messages" },
    { href: "/app/compte", label: "Mon compte", icon: Settings },
  ] },
];
