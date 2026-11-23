/**
 * Les « applications » de l'espace Marketing (comme l'écran Applications de LeadConnector) : une seule liste,
 * utilisée par l'écran Applications, la recherche, les applications épinglées de l'accueil et les onglets du téléphone.
 * Chaque entrée dit quel droit elle demande : on n'affiche jamais une page que le compte ne peut pas ouvrir.
 * Leads reçus, Automatisations et Emails automatiques ne sont plus des applications : les leads arrivent dans GoHighLevel
 * (leurs icônes restent déclarées dans MkIconKey, que mk-icon.tsx décrit en entier).
 */
import type { ModuleKey } from "@/lib/permissions";

export type MkIconKey =
  | "home" | "crm" | "liste" | "contacts" | "taches" | "calendrier" | "kpi" | "setters" | "closers" | "suivi" | "acquisition" | "publicite"
  | "equipe" | "inviter" | "ressources" | "reglages" | "automatisations" | "reception" | "emails" | "import" | "plus" | "notifications"
  | "rechercher" | "profil" | "parametres" | "appel" | "tache" | "mail" | "installer" | "paiements" | "documents" | "saisie";
export type MkGroup = "analyse" | "communication" | "ventes" | "equipe" | "reglages";
export const MK_GROUPS: Array<{ key: MkGroup; title: string }> = [
  { key: "analyse", title: "Analyse et productivité" },
  { key: "communication", title: "Communication" },
  { key: "ventes", title: "Ventes et opérations" },
  { key: "equipe", title: "Équipe et ressources" },
  { key: "reglages", title: "Réglages" },
];
export interface MkApp { key: string; label: string; href: string; icon: MkIconKey; group: MkGroup; module?: ModuleKey; admin?: boolean; words?: string }

export const MK_APPS: MkApp[] = [
  { key: "dashboard", label: "Tableau de bord", href: "/marketing/acquisition", icon: "acquisition", group: "analyse", module: "marketing_dashboard", words: "acquisition entonnoir pages campagnes publicité dépense" },
  { key: "calendrier", label: "Calendrier", href: "/marketing/calendrier", icon: "calendrier", group: "analyse", module: "marketing_calendrier", words: "rendez-vous agenda google iclosed" },
  { key: "taches", label: "Tâches", href: "/marketing/taches", icon: "taches", group: "analyse", module: "marketing_taches", words: "activités éléments à faire à appeler relances mon espace" },
  { key: "closing", label: "Closing", href: "/marketing/kpi", icon: "kpi", group: "analyse", module: "marketing_classement", words: "kpi taux signatures" },
  { key: "setters", label: "Setters", href: "/marketing/kpi?onglet=setters", icon: "setters", group: "analyse", module: "marketing_classement", words: "kpi rendez-vous" },
  { key: "closers", label: "Closers", href: "/marketing/kpi?onglet=closers", icon: "closers", group: "analyse", module: "marketing_classement", words: "kpi appels montant" },
  { key: "suivi", label: "Suivi du jour", href: "/marketing/kpi?onglet=suivi", icon: "suivi", group: "analyse", module: "marketing_classement", words: "appels passés quotidien" },

  { key: "contacts", label: "Contacts", href: "/marketing/contacts", icon: "contacts", group: "communication", module: "marketing_contacts", words: "personnes fiches" },
  { key: "notifications", label: "Notifications", href: "/marketing/notifications", icon: "notifications", group: "communication", words: "alertes à faire en retard" },
  { key: "rechercher", label: "Rechercher", href: "/marketing/rechercher", icon: "rechercher", group: "communication", words: "trouver lead contact" },

  { key: "crm", label: "Prospects", href: "/marketing/crm", icon: "crm", group: "ventes", module: "marketing_prospects", words: "crm opportunités kanban pipeline leads" },
  { key: "liste", label: "Liste des prospects", href: "/marketing/crm?vue=liste", icon: "liste", group: "ventes", module: "marketing_prospects", words: "tableau leads crm opportunités" },
  { key: "paiements", label: "Liens de paiement", href: "/marketing/paiements", icon: "paiements", group: "ventes", module: "marketing_prospects", words: "paiement stripe lien prix encaisser" },
  { key: "documents", label: "Documents et contrats", href: "/marketing/paiements?onglet=documents", icon: "documents", group: "ventes", module: "marketing_prospects", words: "contrat devis document signature" },
  { key: "saisie", label: "Saisie des KPI", href: "/marketing/paiements?onglet=kpi", icon: "saisie", group: "ventes", module: "marketing_classement", words: "kpi setters closers chiffres du jour appels saisie" },

  { key: "equipe", label: "Équipe", href: "/marketing/equipe", icon: "equipe", group: "equipe", module: "marketing_equipe", words: "membres historique" },
  { key: "inviter", label: "Inviter", href: "/marketing/reglages/equipe", icon: "inviter", group: "equipe", module: "marketing_reglages", admin: true, words: "rôle accès setter closer" },
  { key: "ressources", label: "Ressources", href: "/marketing/ressources", icon: "ressources", group: "equipe", module: "marketing_ressources", words: "sop onboarding documents formation" },

  { key: "parametres", label: "Paramètres", href: "/marketing/parametres", icon: "parametres", group: "reglages", words: "profil apparence thème déconnexion" },
  { key: "reglages", label: "Réglages", href: "/marketing/reglages", icon: "reglages", group: "reglages", module: "marketing_reglages", words: "général fuseau horaire pipeline étapes rendez-vous réservation vitesse intégrations google agenda meta ads iclosed" },
  { key: "import", label: "Import GHL", href: "/marketing/reglages/import", icon: "import", group: "reglages", module: "marketing_reglages", admin: true, words: "gohighlevel csv reprise" },
];

/** Applications ouvrables par ce compte. `can` : droit à une page ; `admin` : administrateur (accès complet). */
export function appsFor(can: (m: ModuleKey) => boolean, admin: boolean): MkApp[] {
  return MK_APPS.filter((a) => (!a.module || can(a.module)) && (!a.admin || admin));
}

/** Applications épinglées sur l'accueil, au départ (chacun peut changer les siennes). */
export const DEFAULT_PINNED = ["crm", "contacts", "taches", "paiements", "calendrier", "dashboard", "saisie", "ressources"];
