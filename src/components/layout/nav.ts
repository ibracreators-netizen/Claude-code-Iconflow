import type { LucideIcon } from "lucide-react";
import {
  BookOpenText, Brain, Building2, CalendarDays, CheckSquare, ClipboardList, Clapperboard, Contact, FileText, FolderOpen, Gauge, Home,
  Inbox, LayoutDashboard, LineChart, ListChecks, Mail, MessageSquare, Receipt, Settings, Sparkles, Target, Trophy, Users, UsersRound, Wallet,
} from "lucide-react";

/** `pinned` : entrée utilitaire (réglages) épinglée en bas de barre, hors de la liste qui défile. */
export interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: string; exact?: boolean; module?: string; pinned?: boolean }
export interface NavGroup { label?: string; items: NavItem[] }

export const studioNav: NavGroup[] = [
  { items: [
    { href: "/studio", label: "Tableau de bord", icon: LayoutDashboard, exact: true, module: "dashboard" },
    { href: "/studio/inbox", label: "À traiter", icon: Inbox, badgeKey: "inbox", module: "inbox" },
  ] },
  { label: "Clients", items: [
    { href: "/studio/clients", label: "Clients", icon: Building2, module: "clients" },
    { href: "/studio/pipeline", label: "Pipeline", icon: ClipboardList, module: "pipeline" },
    { href: "/studio/messages", label: "Messagerie", icon: MessageSquare, badgeKey: "messages", module: "messages" },
  ] },
  { label: "Production", items: [
    { href: "/studio/briefs", label: "Briefs & scripts", icon: FileText, badgeKey: "briefs", module: "briefs" },
    { href: "/studio/avatars", label: "Avatars", icon: Users, module: "clients" },
    { href: "/studio/ia", label: "IA Process", icon: Sparkles, module: "briefs" },
    { href: "/studio/livrables", label: "Livrables", icon: Clapperboard, badgeKey: "livrables", module: "livrables" },
    { href: "/studio/taches", label: "Tâches", icon: CheckSquare, badgeKey: "taches", module: "taches" },
    { href: "/studio/planning", label: "Planning", icon: CalendarDays, module: "planning" },
    { href: "/studio/performance", label: "Performance", icon: LineChart, module: "performance" },
  ] },
  { label: "Connaissance", items: [
    { href: "/studio/brain", label: "Brain", icon: Brain, module: "brain" },
    { href: "/studio/documents", label: "Documents", icon: BookOpenText, module: "documents" },
    { href: "/studio/fichiers", label: "Fichiers", icon: FolderOpen, module: "fichiers" },
  ] },
  { label: "Gestion", items: [
    { href: "/studio/factures", label: "Facturation", icon: Receipt, badgeKey: "factures", module: "factures" },
    { href: "/studio/equipe", label: "Équipe", icon: UsersRound, module: "equipe" },
    { href: "/studio/parametres", label: "Paramètres", icon: Settings, module: "parametres", pinned: true },
  ] },
];

export const marketingNav: NavGroup[] = [
  { items: [
    { href: "/marketing/espace", label: "Mon espace", icon: Home, module: "marketing_espace" },
    { href: "/marketing", label: "Données marketing", icon: Gauge, exact: true, module: "marketing_dashboard" },
    { href: "/marketing/publicite", label: "Publicité", icon: LineChart, module: "marketing_publicite" },
  ] },
  { label: "Ventes", items: [
    { href: "/marketing/reception", label: "Réception", icon: Inbox, badgeKey: "marketing_reception", module: "marketing_reception" },
    { href: "/marketing/contacts", label: "Contacts", icon: Contact, module: "marketing_contacts" },
    { href: "/marketing/prospects", label: "Prospects", icon: Target, module: "marketing_prospects" },
    { href: "/marketing/taches", label: "Tâches", icon: ListChecks, badgeKey: "marketing_taches", module: "marketing_taches" },
  ] },
  { label: "Rendez-vous", items: [
    { href: "/marketing/calendrier", label: "Calendrier", icon: CalendarDays, module: "marketing_calendrier" },
    { href: "/marketing/relances", label: "Relances & rappels", icon: Mail, module: "marketing_relances" },
  ] },
  { label: "Équipe", items: [
    { href: "/marketing/classement", label: "Classement", icon: Trophy, module: "marketing_classement" },
    { href: "/marketing/ressources", label: "Ressources", icon: BookOpenText, module: "marketing_ressources" },
  ] },
  { label: "Réglages", items: [
    { href: "/marketing/reglages", label: "Réglages", icon: Settings, module: "marketing_reglages", pinned: true },
  ] },
];

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
