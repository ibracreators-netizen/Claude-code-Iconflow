import {
  BarChart3, BellRing, BookOpenText, CalendarDays, ClipboardCheck, ClipboardPen, CreditCard, Download, FilePlus2, Gauge, Home, Inbox, LayoutGrid, LineChart, ListTodo, Mail,
  Megaphone, NotebookPen, Phone, PhoneCall, Plus, Rows3, Search, Settings, Settings2, Smartphone, Target, Trophy, UserPlus, UserRound,
  Users, Workflow, Contact, type LucideIcon,
} from "lucide-react";
import type { MkIconKey } from "@/lib/marketing/apps";

/** Icône d'une application Marketing (traits fins, comme LeadConnector). Utilisable côté serveur comme côté navigateur. */
export const MK_ICONS: Record<MkIconKey, LucideIcon> = {
  home: Home, crm: Target, liste: Rows3, contacts: Contact, taches: ClipboardCheck, calendrier: CalendarDays, kpi: Gauge,
  setters: PhoneCall, closers: Trophy, suivi: NotebookPen, acquisition: LineChart, publicite: Megaphone, equipe: Users,
  inviter: UserPlus, ressources: BookOpenText, reglages: Settings2, automatisations: Workflow, reception: Inbox, emails: Mail,
  import: Download, plus: Plus, notifications: BellRing, rechercher: Search, profil: UserRound, parametres: Settings,
  appel: Phone, tache: ListTodo, mail: Mail, installer: Smartphone, paiements: CreditCard, documents: FilePlus2, saisie: ClipboardPen,
};
export const MkAppsIcon = LayoutGrid;
export const MkChartIcon = BarChart3;
