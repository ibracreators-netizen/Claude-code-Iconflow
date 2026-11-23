import { ClipboardPen, Download, Plug, SlidersHorizontal, SquareKanban, UserPlus, type LucideIcon } from "lucide-react";

/*
 * Rubriques des Réglages Marketing (comme l'écran « Paramètres » de LeadConnector) : le menu de gauche sur ordinateur
 * et la liste du téléphone viennent de cette seule liste. Aucune donnée n'est lue ici : les droits arrivent en `flags`.
 */

/** Ce que le compte peut ouvrir : calculé côté serveur (voir server.ts), puis passé au menu. */
export interface SectionFlags {
  /** Administrateur (accès complet) : Équipe et accès, Import GoHighLevel, Meta Ads. */
  admin: boolean;
  /** Membre de l'agence avec le droit KPI : il gère les liens de saisie (Paiements › Saisie des KPI). */
  kpiLinks: boolean;
  /** L'outil de réservation iClosed est configuré sur l'hébergeur. */
  iclosed: boolean;
}

export type SectionGroup = "espace" | "connexions" | "raccourcis";
export const SECTION_GROUPS: Array<{ key: SectionGroup; title: string }> = [
  { key: "espace", title: "Ton espace" },
  { key: "connexions", title: "Connexions" },
  { key: "raccourcis", title: "Raccourcis" },
];

export interface ReglagesSection {
  key: string; href: string; label: string; sub: string; icon: LucideIcon; group: SectionGroup;
  /** Lien qui sort des Réglages (il ouvre une autre page de l'app). */
  leaves?: boolean;
}

export const REGLAGES_HREF = "/marketing/reglages";
export const GENERAL_HREF = "/marketing/reglages/general";

export function reglagesSections({ admin, kpiLinks, iclosed }: SectionFlags): ReglagesSection[] {
  const tools = ["Google Agenda", admin ? "Meta Ads" : null, iclosed ? "iClosed" : null].filter(Boolean).join(", ");
  const all: Array<ReglagesSection | false> = [
    { key: "general", href: GENERAL_HREF, label: "Général", sub: "Fuseau horaire, rendez-vous", icon: SlidersHorizontal, group: "espace" },
    admin && { key: "equipe", href: "/marketing/reglages/equipe", label: "Équipe et accès", sub: "Inviter, rôles, accès", icon: UserPlus, group: "espace" },
    { key: "pipeline", href: "/marketing/reglages/pipeline", label: "Pipeline", sub: "Les étapes de tes prospects", icon: SquareKanban, group: "espace" },
    { key: "integrations", href: "/marketing/reglages/integrations", label: "Intégrations", sub: tools, icon: Plug, group: "connexions" },
    admin && { key: "import", href: "/marketing/reglages/import", label: "Import GoHighLevel", sub: "Contacts et opportunités en CSV", icon: Download, group: "connexions" },
    kpiLinks && { key: "kpi", href: "/marketing/paiements?onglet=kpi", label: "Liens de saisie des KPI", sub: "Paiements › Saisie des KPI", icon: ClipboardPen, group: "raccourcis", leaves: true },
  ];
  return all.filter((s): s is ReglagesSection => !!s);
}

/** Rubrique ouverte : « Général » aussi sur /marketing/reglages (ordinateur), sinon l'adresse de la rubrique et ses sous-pages. */
export function isSectionActive(pathname: string, s: ReglagesSection): boolean {
  if (s.leaves) return false;
  if (s.href === GENERAL_HREF && pathname === REGLAGES_HREF) return true;
  return pathname === s.href || pathname.startsWith(`${s.href}/`);
}
