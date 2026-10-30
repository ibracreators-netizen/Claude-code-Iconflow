import type { LucideIcon } from "lucide-react";
import {
  BookOpenText, Brain, Building2, CalendarDays, CheckSquare, ClipboardList, Clapperboard, FileText, FolderOpen, Home,
  Inbox, LayoutDashboard, LineChart, MessageSquare, Receipt, Settings, Users, UsersRound, Wallet,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: string; exact?: boolean }
export interface NavGroup { label?: string; items: NavItem[] }

export const studioNav: NavGroup[] = [
  { items: [
    { href: "/studio", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
    { href: "/studio/inbox", label: "À traiter", icon: Inbox, badgeKey: "inbox" },
  ] },
  { label: "Clients", items: [
    { href: "/studio/clients", label: "Clients", icon: Building2 },
    { href: "/studio/pipeline", label: "Pipeline", icon: ClipboardList },
    { href: "/studio/messages", label: "Messagerie", icon: MessageSquare, badgeKey: "messages" },
  ] },
  { label: "Production", items: [
    { href: "/studio/briefs", label: "Briefs & scripts", icon: FileText, badgeKey: "briefs" },
    { href: "/studio/livrables", label: "Livrables", icon: Clapperboard, badgeKey: "livrables" },
    { href: "/studio/taches", label: "Tâches", icon: CheckSquare, badgeKey: "taches" },
    { href: "/studio/planning", label: "Planning", icon: CalendarDays },
    { href: "/studio/performance", label: "Performance", icon: LineChart },
  ] },
  { label: "Connaissance", items: [
    { href: "/studio/brain", label: "Brain", icon: Brain },
    { href: "/studio/documents", label: "Documents", icon: BookOpenText },
    { href: "/studio/fichiers", label: "Fichiers", icon: FolderOpen },
  ] },
  { label: "Gestion", items: [
    { href: "/studio/factures", label: "Facturation", icon: Receipt, badgeKey: "factures" },
    { href: "/studio/equipe", label: "Équipe", icon: UsersRound },
    { href: "/studio/parametres", label: "Paramètres", icon: Settings },
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
