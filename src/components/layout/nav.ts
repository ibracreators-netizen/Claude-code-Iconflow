import type { LucideIcon } from "lucide-react";
import {
  BookOpenText, Brain, Building2, CalendarDays, CheckSquare, ClipboardList, Clapperboard, FileText, FolderOpen, Home,
  Inbox, LayoutDashboard, LineChart, MessageSquare, Receipt, Settings, Users, UsersRound, Wallet,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: string; exact?: boolean; module?: string }
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
    { href: "/studio/parametres", label: "Paramètres", icon: Settings, module: "parametres" },
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
