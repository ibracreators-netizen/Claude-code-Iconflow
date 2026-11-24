# IconFlow Marketing — espace d'acquisition de l'agence

Deuxième espace de l'app, sous le conteneur **Ibra Group**, indépendant d'IconFlow Studio.
Même design, mêmes composants. Studio n'est pas modifié dans son fonctionnement ni ses données.

## Organisation de l'espace : une application à part, au style LeadConnector (novembre 2026)

Marketing est une **application distincte de Studio**, au style de LeadConnector (GoHighLevel) : ses couleurs
(vert d'eau, relevé sur les captures de l'app LeadConnector, sur téléphone comme sur ordinateur), son icône et son
installation sur téléphone (`public/marketing.webmanifest`, qui s'ouvre sur l'Accueil). Passer d'un espace à
l'autre recharge la page (commutateur avec les logos des deux espaces, page `/hub`). Le thème est posé avant le
premier affichage par `<html data-app="marketing">` (script de démarrage de `src/app/layout.tsx`) ; les jetons
sont dans `src/app/globals.css` (`:root[data-app="marketing"]`, variante Tailwind `mk:`, couleurs `mk-*`).
**Une seule police dans toute l'app** (Studio, Marketing, portail, pages publiques) : Inter, servie depuis
`src/fonts/` ; seules la taille et la graisse varient.

| Menu (ordinateur) | Adresse | Ce qu'on y fait | Droit |
|---|---|---|---|
| Tableau de bord | `/marketing/acquisition` | leads, rendez-vous, signatures, entonnoir, sources et campagnes (ex-Acquisition) | `marketing_dashboard` |
| Tâches | `/marketing/taches` | « Éléments à faire » par défaut (ex-Mon espace), toutes les tâches, terminées | `marketing_taches` |
| Calendrier | `/marketing/calendrier` | vue du mois, de la semaine, liste ; Google Agenda | `marketing_calendrier` |
| Contacts | `/marketing/contacts` | tableau paginé côté serveur, fiche, ajout | `marketing_contacts` |
| **Prospects** | `/marketing/crm` | kanban et liste (ex-CRM), fiche, ajout | `marketing_prospects` |
| **Paiements** | `/marketing/paiements` | liens de paiement, documents et contrats | `marketing_prospects` |
| — | | | |
| KPI | `/marketing/kpi` | **saisie des KPI** (et liens de saisie), closing, setters, closers, suivi du jour | `marketing_classement` |
| Équipe | `/marketing/equipe` | membres, chiffres, historique | `marketing_equipe` |
| Ressources | `/marketing/ressources` | SOPs, onboarding | `marketing_ressources` |
| Réglages (en bas) | `/marketing/reglages` | pipeline, outils, automatisations, emails, vitesse de l'app | `marketing_reglages` |

**Retirées** : *Mon espace* (`/marketing/espace` mène à Tâches, où son contenu est devenu « Éléments à faire ») et
*Publicité* (`/marketing/publicite` mène au Tableau de bord). Les droits `marketing_espace` (affiché « Accueil ») et
`marketing_publicite` (« Dépenses publicitaires », que la base utilise pour la lecture des dépenses) restent
inchangés en base : aucune migration.

**Entrée** : `/marketing` ouvre le Tableau de bord ; sans ce droit, Tâches ; sinon la première page permise.

Sous Réglages : *Inviter et gérer les accès* (`/reglages/equipe`), *Automatisations*, *Import GoHighLevel*,
*Leads reçus (contrôle technique)* (`/reglages/reception`) et *Emails automatiques* (`/marketing/relances`).
Quand des leads reçus sont en erreur ou suspects, un bandeau le dit en haut de Prospects.

### Sur téléphone (comme l'application LeadConnector)

- **Onglets du bas** (`marketingTabs`, `src/components/layout/nav.ts`) : Accueil · Prospects · Rechercher ·
  Calendrier · Applications (les quatre premiers permis au compte, puis Applications).
- **En-tête** : l'espace (logo, « IconFlow ▾ », rôle) avec la cloche et l'engrenage ; « Prospects » avec actualiser
  et réglages du pipeline ; « ← Titre » sur les autres pages (`SUB_PAGES`, `src/components/marketing/shell.tsx`).
  Une page peut y poser ses propres boutons (`MkHeaderActions`, `src/components/marketing/chrome.tsx`), par exemple
  « Enregistrer » sur une page d'ajout ou la corbeille sur une fiche.
- **Bouton +** : sur Prospects, « Ajouter un prospect » (`/marketing/crm/nouveau`) ; sur Contacts, « Ajouter un
  contact » (`/marketing/contacts/nouveau`). Les autres pages posent le leur (`MkFab`).
- **Applications** : toutes les pages permises, par groupe, comme LeadConnector (`src/lib/marketing/apps.ts`) :
  **Analyse et productivité** (… Saisie des KPI, Closing, Setters, Closers, Suivi du jour : les onglets de KPI) ·
  Communication · **Ventes et opérations** (Prospects, Liste des prospects, Liens de paiement, Documents et
  contrats) · Équipe et ressources · Réglages.
- **Accueil** (`/marketing/accueil`) : « Bienvenue », quatre tuiles (tâches du jour, valeur du pipeline sur 30 jours,
  nouveaux prospects sur 30 jours, rendez-vous du jour), applications épinglées (modifiables) et actions rapides.
- **Rechercher**, **Notifications**, **Paramètres** (apparence Clair / Sombre / Système, installation, déconnexion)
  et **Mon profil**.

### Barre latérale (ordinateur)

Une seule barre pour Studio et Marketing (`src/components/layout/sidebar.tsx`) : **noire, accent vert**. Dépliée,
chaque page sur une ligne, l'icône devant le libellé ; repliée, les icônes seules, avec le nom au survol. Pour
**déplier**, survoler le logo (il devient le bouton) ; pour replier, le bouton à droite du nom ; au clavier,
Ctrl/Cmd + \\. Le choix est gardé dans le navigateur (`iconflow-nav`) et appliqué avant le premier affichage.

### Prospects

- **Ordinateur** (comme les Opportunités de LeadConnector) : pipeline « IconFlow — Ventes », nombre de prospects,
  bascule kanban / liste, Importer (administrateur), « + Ajouter un prospect », onglets « Prospects actifs » et
  « Mes prospects », filtres avancés, tri, recherche, « Gérer les champs ». Kanban : colonnes repliables avec leur
  nombre et leur valeur, glisser-déposer, 50 cartes affichées par colonne puis « Afficher plus ». Liste : tri,
  cases à cocher, actions groupées, pagination.
- **Téléphone** : recherche, pastilles pipeline / filtres / tri, colonnes qui défilent à l'horizontale avec un « + »
  par étape, cartes avec appel, message, étiquettes, tâches et un bouton pour **déplacer** vers une autre étape.
- **Ajouter un prospect** (`/marketing/crm/nouveau`) : contact existant ou nouveau, nom, étape, valeur, source,
  setter et closer. Un contact déjà connu (même email ou téléphone) n'est jamais créé en double.
- **Fiche** (« Modifier le prospect ») : carte contact (appeler, écrire, étiquettes, tâche), onglets Informations
  (avec « Masquer les champs vides » et « Modifier »), Tâches, Remarques, Rendez-vous, Historique.

### Contacts

Tableau paginé **côté serveur** (20, 50 ou 100 par page), recherche, filtres (étiquette, source, avec ou sans
prospect, dates), tri, colonnes à choisir, sélection (ajouter une étiquette ; supprimer, réservé à
l'administrateur et seulement pour un contact sans prospect). Téléphone : liste avec recherche et filtre.
Fiche (`/marketing/contacts/[id]`) : informations modifiables, ses prospects, historique. Ajout :
`/marketing/contacts/nouveau`. L'ancienne adresse `/marketing/crm/contacts/[id]` redirige.

### Paiements

`/marketing/paiements`, deux onglets (`?onglet=liens|documents`), droit « Prospects et paiements » :
- **Liens de paiement** : nom, lien (créé dans l'outil de paiement : Stripe, LeadConnector, Whop…), prix, statut
  actif ou inactif, date ; copier en un geste.
- **Documents et contrats** : contrats, devis, documents, sous forme de **liens** (le fichier reste dans Google
  Drive, Yousign…).

La saisie des KPI a quitté Paiements : elle est dans **KPI › Saisie des KPI**. L'ancienne adresse
`/marketing/paiements?onglet=kpi` mène à `/marketing/kpi?onglet=saisie`.

Stockage sans migration : deux réglages JSON de `marketing_settings` (`payment_links`, `sales_documents`). Lecture
pour tout membre qui a droit à la page ; écriture réservée à ceux que la base autorise (droit Réglages
marketing) ; les commerciaux voient et copient. Liens `https://` uniquement, 200 éléments au plus par liste. Limite
assumée : si deux personnes enregistrent au même instant, la dernière écriture l'emporte.

### Vitesse

- L'écran de démarrage ne s'affiche qu'à la toute première visite (jamais dans l'app installée).
- Un écran de chargement s'affiche tout de suite au changement de page (`loading.tsx`).
- Le cadre de l'espace lance ses lectures en même temps ; les compteurs sont lus une fois par page.
- La session est vérifiée sur place (`getClaims`) au lieu d'un aller-retour au service d'authentification.
- Les longues listes sont paginées côté serveur (Contacts), les colonnes du kanban plafonnées.
- **Réglages › Vitesse de l'app** : mesure le temps d'un aller-retour serveur → base de données. Au-delà de
  150 ms par requête, la base est sans doute dans une région éloignée du serveur : les rapprocher (même région)
  est alors le seul vrai remède.

### Essais locaux

Avec `MARKETING_DEMO_SAMPLE=1` sur un ordinateur de développement, sans base reliée et hors production, l'espace
démarre avec des données d'exemple (`src/lib/marketing/demo-sample.ts`) pour vérifier les écrans. Jamais en ligne.

### Migration 0029 — rôle « marketing » sur les profils

La base en ligne portait une règle ancienne, `profiles_role_check`, qui n'acceptait que les rôles `agency` et
`client` : toute invitation d'un setter, d'un closer ou d'un media buyer échouait (« violates check constraint
"profiles_role_check" »). `0029_profiles_role_marketing.sql` remplace cette règle par la même liste plus
`marketing` (rejouable ; retour arrière : `supabase/rollbacks/0029_profiles_role_marketing.down.sql` ; test :
`supabase/tests/profiles_role_marketing.sql`). Tant qu'elle manque, la fenêtre d'invitation le dit clairement.

### Supprimer un lead

Menu « … » d'une carte ou d'une ligne, bouton sur la fiche, ou sélection multiple dans la liste. Une
confirmation est toujours demandée. La suppression retire le lead, son historique, ses tâches, ses rendez-vous
et ses emails programmés ; la fiche contact part aussi si elle n'a pas d'autre affaire. C'est définitif.
Réservé à l'administrateur et aux membres de l'agence : un setter ou un closer passe un lead en « Perdu ».
Le lien avec iClosed ou l'import est retiré : si la source renvoie ce lead, il est recréé comme un nouveau.

### Prospects : colonnes, personnalisation, liste

- **Kanban** (vue par défaut) : une colonne par étape, glisser-déposer, total par colonne.
  - *Colonnes* (qui a le droit Réglages) : ajouter, renommer, colorer (8 couleurs), déplacer à gauche ou à
    droite, retirer (sauf les sept colonnes d'origine, dont les automatisations dépendent).
  - *Personnaliser* (chacun, gardé dans son navigateur) : les informations affichées sur les cartes (valeur,
    entreprise, source, setter et closer, téléphone, étiquettes, ancienneté, tâches et rendez-vous), l'ordre
    dans les colonnes, les colonnes repliées.
  - *Menu d'une carte* : ouvrir la fiche, attribuer, envoyer un email, ajouter une tâche, déplacer vers une
    étape (utile sur téléphone, où l'on ne glisse pas).
- **Liste** : tri, recherche, filtres (étape, setter, closer, source, « mes leads », « avec une tâche »), et
  **actions groupées** pour les membres de l'agence : étape, setter, closer sur plusieurs leads (200 au plus).
- **Contacts** : une fiche par personne, avec toutes ses affaires.
- **Fiche du lead** : étape, valeur, setter et closer, résultat d'appel, issue, montant signé, tâches,
  rendez-vous, qualification, **email**, **notes**, et l'**historique** complet avec l'auteur de chaque geste.

### Emails depuis une fiche

`src/lib/marketing/lead-email.ts`. L'email part par Resend, au nom du membre (les réponses arrivent à son
adresse, `reply_to`), et s'écrit dans l'historique (événement `email` : objet, message, destinataire, statut).

- Sans `RESEND_API_KEY` et `EMAIL_FROM` : **simulation**. Le bouton dit « Simuler l'envoi », un bandeau le
  rappelle, l'historique note « simulé, non envoyé ».
- Refusé si le contact n'a pas d'email ou s'est désinscrit. Plafond : 40 emails par membre et par heure.
- **Emails types** : objet + message enregistrés par l'administrateur (réglage `email_templates`), avec
  `{{prenom}}`, `{{nom}}`, `{{entreprise}}`, `{{mon_prenom}}`.
- Limite assumée : le CRM n'affiche pas les réponses. Elles arrivent dans la boîte mail du membre.

### Équipe

- *Équipe* : une carte par membre (rôle, leads en cours, chiffres des 30 derniers jours).
- *Fiche d'un membre* : ses chiffres avec leur règle, son suivi déclaré, ses 120 dernières actions dans le CRM
  (étapes, appels, tâches, notes, emails, avec le lead concerné), son rôle, ses pages, sa dernière connexion,
  et l'**historique de son compte** (invitation, changement de rôle, pages accordées, accès retiré ou rétabli :
  table `marketing_team_log`, écrite par le serveur, non modifiable).
- *Réglages › Inviter et gérer les accès* : inviter avec un **rôle** (Setter, Closer, Media buyer) et les **pages
  auxquelles il a accès**, choisies dans la fenêtre « Inviter un membre » : une case par page, avec une ligne
  d'explication (`SALES_PAGE_CHOICES`, `src/lib/marketing/invite-errors.ts`). Les cases suivent le rôle choisi
  (changer de rôle les remet) et se modifient une à une ; « Tout cocher » / « Valeurs du rôle ». Aucune case
  cochée : message, et « Inviter » reste grisé ; le serveur refuse aussi une liste vide (`checkInviteInput`). Les
  mêmes cases servent ensuite à modifier les pages d'un membre (bouton « Pages »). Pages accordables à un
  commercial : `SALES_ASSIGNABLE_MODULES` — Accueil, Prospects et paiements, Contacts, Tâches, Calendrier, KPI,
  Tableau de bord, Ressources. Le serveur ne garde jamais une autre page (`assignablePages`) : ni Réglages, ni
  Équipe, ni le contrôle des leads reçus, ni Studio. « Emails automatiques » et « Dépenses publicitaires » ne sont
  plus proposées (le Tableau de bord ouvre ce que la seconde ouvrait, en base aussi) ; un droit déjà posé reste lu.
  Quelle que soit la page, la base n'ouvre à un setter ou un closer que ce qui lui est attribué.

### KPI

Calcul : `src/lib/marketing/kpi.ts` (fonctions pures, sur les faits sans coordonnées). Périodes 7, 30, 90 jours.
Onglets (`?onglet=saisie|closing|setters|closers|suivi`), la saisie en premier. Onglet ouvert par défaut : **Saisie
des KPI** pour un setter ou un closer, **Suivi du jour** pour l'administrateur et l'agence (Closing pour un media
buyer).

- **Saisie des KPI** (`src/app/(marketing)/marketing/kpi/saisie.tsx`) : pour qui gère l'espace, la carte « Liens de
  saisie des KPI » en haut ; puis, pour tous, la **saisie du jour** (le membre, pour l'agence ; le jour ; un champ par
  indicateur du rôle ; une remarque) et les **derniers jours saisis** (60 jours, un clic pour corriger). Une saisie
  enregistrée apparaît aussitôt dans Suivi du jour ; la page reste sur l'onglet. Raccourcis : application « Saisie des
  KPI », action rapide « Saisir mes KPI » de l'Accueil, « Ta saisie du jour » du Tableau de bord, « Saisir mes
  chiffres du jour » de Suivi du jour, « Liens de saisie des KPI » dans Réglages.

- **Closing** : taux de closing (signés ÷ appels tenus) avec l'écart par rapport à la période d'avant, montant
  signé HT et panier moyen, appels tenus, taux de présence, résultats à saisir ; par semaine ; issue des
  appels (signé, en réflexion, non signé) ; par closer ; par source.
- **Setters** : leads reçus, leads traités, rendez-vous pris, taux de rendez-vous, présence, signatures
  obtenues grâce à leurs leads.
- **Closers** : le rapport des closers à partir des chiffres déclarés (voir « Rapport des closers » ci-dessous), puis
  « Rendez-vous enregistrés dans l'app » (rendez-vous prévus, tenus, absents, présence, signés, closing, montant,
  panier moyen, calculés à partir du CRM ; vide si les rendez-vous sont gérés dans GoHighLevel).
- **Suivi quotidien** : ce que chaque commercial déclare chaque jour (appels passés, décrochés, messages, conversations
  pour un setter ; rendez-vous, résultats, argent et suivi pour un closer). Saisi par chaque membre pour lui-même,
  corrigeable par un membre de l'agence. Table `marketing_kpi_entries`, une ligne par membre et par jour. Affiché comme
  **déclaratif**. L'onglet « Suivi du jour » a deux tableaux, **Setters** puis **Closers**, chacun avec ses colonnes :
  une saisie va dans le tableau du rôle de la personne (membre ou lien), à défaut d'après les chiffres présents.

Règles (`KPI_RULES`, affichées dans l'app) : un appel tenu est compté une fois par prospect ; un rendez-vous
annulé ou reporté ne compte pas ; un taux sans base reste vide ; le rang n'apparaît que s'il y a assez de
données (`MIN_SAMPLE`, `MIN_MEMBERS`).

### Rapport des closers

Les leads arrivent par GoHighLevel : le rapport des closers repose sur les chiffres **déclarés** chaque jour (KPI ›
Saisie des KPI, ou le lien personnel `/kpi/<jeton>`). **Aucune migration** : les chiffres sont dans la colonne jsonb
`metrics` de `marketing_kpi_entries` et `marketing_kpi_person_entries` (aucune liste de clés imposée par la base) ; les
anciennes saisies (relances, propositions) s'affichent toujours.

- **Champs** (`KPI_FIELDS.closer`, `src/lib/marketing/types.ts`), en quatre groupes dans les formulaires :
  *Rendez-vous* (appels prévus, show-up, no-show, annulés ou reportés), *Résultats des appels* (non qualifiés, pitchs,
  closes, en réflexion), *Argent* (cash collecté, CA signé HT, en euros entiers), *Suivi* (relances, propositions).
  Les champs des setters ne changent pas.
- **Limites** (`KPI_MAX_COUNT`, `KPI_MAX_EURO`, `kpiValueError`) : un nombre entier de 0 à 10 000, un montant de 0 à
  1 000 000 € par case. La saisie d'un membre (`saveKpiEntryAction`) et celle du lien (`parseEntryInput`) appliquent la
  même règle et **refusent** au-delà avec un message en français ; un indicateur inconnu est refusé. Sur le lien, une
  case est gardée telle que tapée (`cleanKpiInput`, `kpiInputNumber`) : « 2499,99 » ou « 1 500,50 € » est refusé
  « sans centimes », jamais lu 249 999.
- **Fusion du jour** (`mergeKpiMetrics`) : la saisie d'un membre n'envoie que les champs de son rôle d'appel ; les
  chiffres de l'autre rôle déjà saisis ce jour-là sont gardés (changement de rôle, correction d'un ancien jour), une
  case envoyée à 0 est retirée. « Derniers jours saisis » les résume (`daySummary` : « Setter : 40 appels passés »).
- **Avertissements doux** (`closerWarnings`), affichés sous les champs, l'enregistrement reste possible : show-up +
  no-show + annulés > appels prévus ; non qualifiés + pitchs > show-up ; closes + en réflexion > pitchs ; closes sans CA
  signé.
- **Calculs** (`src/lib/marketing/closer-report.ts`, fonctions pures, `CLOSER_RULES` lues au survol des intitulés) :
  taux de show-up = show-up ÷ (show-up + no-show) ; taux de pitch = pitchs ÷ show-up ; taux de closing = closes ÷
  show-up ; closing sur pitch = closes ÷ pitchs ; part de non qualifiés = non qualifiés ÷ show-up ; panier moyen = CA
  signé ÷ closes. Au dixième ; un taux sans base reste vide (« — »).
- **Où ça s'affiche** :
  - *KPI › Closers* : six cartes (appels prévus, show-up, pitchs, closes, cash collecté, CA signé) avec l'écart avec la
    période d'avant ; « Entonnoir des appels » (prévus → show-up → pitchs → closes, part de l'étape précédente) et
    « Ce qui n'a pas abouti » (no-show, annulés, non qualifiés, en réflexion) ; tableau « Par closer » (classé par
    closes, puis cash, puis CA signé ; closes, % closing, cash et CA signé juste après le nom ; ligne « Total équipe »,
    dont les jours saisis sont des jours différents). Période en jours civils dans le fuseau des réglages.
    Closers retenus (`closerPeople`, les mêmes que le Tableau de bord › Closers) : rôle d'appel Closer (y compris un
    compte de l'agence qui a choisi Closer), personnes par lien de rôle Closer, et toute personne qui a saisi des
    chiffres de closer sur la période ou la période d'avant (mêmes personnes pour l'écart). Un closer connecté ne voit
    que ses chiffres (la base ne lui renvoie que les siens).
  - *Tableaux larges* : le nom reste collé à gauche (et la corbeille à droite dans le Suivi du jour) ; l'indice « Fais
    défiler » et un fondu à droite apparaissent seulement quand le tableau dépasse (`_components/scroll-area.tsx`).
  - *Tableau de bord* : filtre « Closers » (ou closer connecté) : les six cartes, la courbe appels prévus / show-up /
    closes, l'entonnoir et le classement ; « Toute l'équipe » : appels passés, conversations, show-up, pitchs, closes,
    cash collecté, et l'entonnoir s'il y a des chiffres de closer. Classement toujours sur des colonnes affichées :
    closers par closes, cash, CA signé ; setters par appels, décrochés, conversations ; toute l'équipe par appels,
    closes, cash.
  - *Fiche membre* (closer) : carte « Suivi quotidien déclaré », à part des chiffres du CRM : show-up, pitchs, closes,
    taux de closing déclaré (closes ÷ show-up, distinct du taux du CRM), cash collecté, CA signé sur 30 jours civils
    (comme KPI › Closers), puis les autres champs non nuls.
  - L'entonnoir est un composant partagé : `src/app/(marketing)/marketing/_components/closer-funnel.tsx`.
- **Données d'exemple** (`MARKETING_DEMO_SAMPLE=1`, développement seulement) : la personne par lien « Romain Girard
  (exemple) » et le compte d'essai « Closer (essai) » ont des journées cohérentes ; elles restent signalées par le badge
  Démo. Vérification hors ligne : `scripts/kpi-selfcheck.ts`, `scripts/kpi-links-selfcheck.ts`.

### Liens de saisie des KPI (migration 0028)

Pour qu'un setter ou un closer note ses chiffres du jour **sans compte** : un **lien personnel et permanent** par
personne, à lui envoyer une fois (WhatsApp, SMS…). Il l'ouvre chaque jour sur son téléphone ; ses saisies arrivent
dans **KPI › Suivi du jour** (avec la mention « par lien ») et dans le **Tableau de bord** (carte « Suivi déclaré
de l'équipe »), à côté de celles des membres.

- **Gérer** : *KPI › Saisie des KPI*, carte « Liens de saisie des KPI » (en haut de l'onglet). « + Ajouter une
  personne » : nom, rôle (Setter ou Closer), e-mail et téléphone facultatifs ; le lien s'affiche aussitôt avec
  « Copier ». Pour chaque personne : dernière saisie, statut, copier le lien, et le menu ⋮ (Copier le lien, Ouvrir,
  Modifier, Nouveau lien, Désactiver / Réactiver, Supprimer).
- **La page du lien** : `/kpi/<jeton>`, hors de `/marketing`, au style Marketing, pensée pour le téléphone. « Bonjour
  <prénom> », son rôle, le choix du jour (aujourd'hui, hier… jusqu'à 7 jours en arrière, dans le fuseau des réglages
  Marketing), un gros champ par indicateur du rôle (`KPI_FIELDS`) avec – et +, une remarque facultative, puis
  « ENREGISTRER » (« Mettre à jour » si le jour est déjà saisi). Après l'envoi : « C'est enregistré pour aujourd'hui. »
  et la liste de ses derniers jours. Elle ne montre que le prénom, le rôle et les saisies de la personne du lien.
- **Données** : `marketing_kpi_people` (nom, e-mail, téléphone, rôle, jeton, actif, dernière saisie) et
  `marketing_kpi_person_entries` (une ligne par personne et par jour, mêmes gardes que `marketing_kpi_entries`).
  Code : `src/lib/marketing/kpi-links.ts` (jeton, validation, écriture), `kpi-links-server.ts` (droits, page publique),
  `src/lib/actions/marketing-kpi-links.ts`, `src/app/kpi/[token]`.

**Droits (dans la base).** Les personnes et leurs jetons ne sont lus et gérés que par qui gère l'espace : un membre
de l'agence avec « Réglages marketing » (`my_has_module('marketing_reglages') and mkt_sees_all()`). Les saisies sont
lues comme le suivi quotidien de l'équipe (membre de l'agence avec le droit KPI) ; leurs noms passent par la fonction
`marketing_kpi_link_people()`, qui ne renvoie ni jeton ni coordonnées. Personne n'écrit une saisie avec une session :
seule l'application, avec la clé service, depuis le lien. Effacer une saisie : qui gère l'espace. Un setter, un closer,
un media buyer et un compte client ne voient rien de tout cela ; `anon` n'a aucun droit.

**Sécurité du lien.**
- Le jeton est tiré au hasard (32 octets, Web Crypto), écrit en base64url : 43 caractères, impossible à deviner. La
  base refuse un jeton de moins de 32 caractères ou avec des caractères interdits.
- Chaque envoi revérifie le jeton (personne existante et active) ; la saisie est validée strictement : jour dans la
  fenêtre de 8 jours, seulement les indicateurs du rôle (un champ inconnu fait refuser l'envoi), entiers de 0 à 10 000
  (montants en euros entiers de 0 à 1 000 000), remarque de 1 000 caractères au plus.
- Débit limité par adresse (30 envois par minute) et par jeton (12 par minute), en mémoire de l'instance, comme les
  autres points publics (`rateLimited`).
- Lien inconnu, mal formé ou désactivé : la même page sobre « Ce lien n'est plus actif. Demande un nouveau lien à ton
  responsable. », sans rien révéler. La page n'est pas indexée (`noindex, nofollow`) et n'envoie pas son adresse à
  un autre site (`referrer: no-referrer`) : la balise de la page et les en-têtes HTTP `Referrer-Policy: no-referrer`
  et `X-Robots-Tag: noindex, nofollow` posés sur `/kpi/*` dans `next.config.ts`.
- Le jeton n'est jamais écrit dans le journal des erreurs : `src/instrumentation.ts` remplace `/kpi/<jeton>` par
  `/kpi/[jeton]` (chemin et message). Les journaux d'accès de l'hébergeur (Vercel) gardent l'adresse demandée, comme
  pour tout lien de partage : en cas de doute, « Nouveau lien ».
- Qui a le lien peut saisir au nom de la personne : c'est le principe d'un lien sans compte. Il ne donne accès à
  rien d'autre (ni prospects, ni chiffres de l'équipe).

**Révoquer un lien.** Menu ⋮ de la personne :
- **Nouveau lien** : un nouveau jeton remplace l'ancien, qui cesse aussitôt de marcher ; les saisies restent. Envoyer
  le nouveau lien à la personne.
- **Désactiver** : le lien affiche « plus actif » tant que la personne n'est pas réactivée (le même lien remarche
  alors). L'historique reste dans les KPI.
- **Supprimer** : la personne, son lien et ses saisies disparaissent (y compris des KPI et du Tableau de bord).
  Préférer « Désactiver » pour garder l'historique.

Sans la migration 0028, la carte le dit (« demande la migration 0028 ») et les KPI affichent seulement les saisies des
membres. Sans base reliée (développement), tout fonctionne en mémoire ; avec `MARKETING_DEMO_SAMPLE=1`, deux personnes
d'exemple (« (exemple) » dans le nom) et quelques saisies sont chargées.

## Rôles et accès (migration 0022)

| Rôle | Qui | Ce qu'il voit |
|---|---|---|
| **Admin** | Membre agence à accès complet (`role = agency`, `permissions` vide) | Tout. Gère l'équipe, les réglages, l'import, l'export. |
| **Setter** | Compte commercial (`role = marketing`, `marketing_role = setter`) | Ses tâches, ses prospects et leurs contacts, ses rendez-vous. Rien de ce qui est attribué à un autre. |
| **Closer** | Compte commercial (`marketing_role = closer`) | Ses appels, ses prospects et leurs contacts, la saisie du résultat et du montant signé. |
| **Media buyer** | Compte commercial (`marketing_role = media_buyer`) | L'entonnoir et la publicité, en chiffres. Aucun nom, email ni téléphone. |

Un membre de l'agence à droits limités qui a des pages Marketing (système de droits par page existant) voit tout
dans ces pages : il se gère dans Studio › Équipe & accès, comme avant.

### Pourquoi un rôle à part

Le système de droits par page couvrait déjà les pages Marketing, mais il ne suffisait pas : un membre « agence »,
même limité à des pages Marketing, peut lire par l'API plusieurs tables de Studio (clients, briefs, livrables,
profils), car leurs règles de lecture n'exigent que le rôle « agence ». Un commercial reçoit donc un rôle
distinct, `marketing`. Toutes les règles de Studio exigent `agency` : un compte `marketing` y est refusé partout,
**sans qu'aucune règle de Studio ait été modifiée**. Il n'est rattaché à aucun client (contrainte en base) : il ne
lit rien du portail non plus.

Une seule fonction de Studio a été resserrée, `avatars_purge_expired` : elle acceptait tout compte connecté qui
n'était pas « client ». Elle exige maintenant un compte agence ou client ; rien ne change pour ces deux rôles.

### Appliqué dans la base, pas seulement dans l'interface

- `my_has_module()` : un compte `marketing` n'a que des modules `marketing_…`, et seulement ceux de sa liste.
- Règles ligne par ligne sur `marketing_prospects`, `marketing_contacts`, `marketing_tasks`,
  `marketing_prospect_events`, `marketing_appointments`, `marketing_calendar_events` : un commercial n'atteint que
  ce qui lui est attribué (`setter_id` ou `closer_id`). Il ne peut ni s'attribuer un prospect, ni réattribuer le sien.
- Media buyer : aucune règle ne lui ouvre les contacts ni les prospects. Il lit l'entonnoir par trois fonctions
  (`marketing_funnel_prospects`, `marketing_funnel_appointments`, `marketing_funnel_tasks`) qui ne renvoient ni nom,
  ni email, ni téléphone, ni note, et rendent la page d'entrée sans ses paramètres.
- `marketing_members()` : les noms des membres de l'espace (attribution, auteur dans la chronologie), sans ouvrir
  la table des profils.
- **Export** des contacts et des prospects : administrateur uniquement (`/api/marketing/export` répond 403 sinon).
- Preuve : `supabase/tests/marketing_roles.sql` (7 blocs) — setter, closer, media buyer, aucune table de Studio
  lisible, pas d'élévation de droits, compte client du portail sans accès à Marketing, administrateur complet.

### Gérer l'équipe

Marketing › Réglages › Équipe et accès (administrateur) : inviter un setter, un closer ou un media buyer en
cochant ses pages, changer son rôle (ses pages suivent), changer ses pages, retirer ou rétablir son accès. Toute
adresse de Studio, du portail ou des réglages renvoie un compte commercial dans son espace.

Pages cochées d'avance selon le rôle (`SALES_ROLE_MODULES`, `src/lib/permissions.ts`) :

- Setter et Closer : Accueil, Contacts, Prospects et paiements, Tâches, Calendrier, KPI, Ressources.
- Media buyer : Accueil, Tableau de bord, Ressources.

## Espaces de travail par rôle (migration 0023 pour la publicité)

- **Mon espace** (`/marketing/espace`) :
  - Setter : ses tâches « À appeler », ses relances du jour, les rendez-vous qu'il a pris.
  - Closer : ses appels du jour, les résultats à saisir (appels passés sans résultat), ses signatures.
  - Media buyer : leads, rendez-vous, dépense et coûts des 30 derniers jours.
  - Admin : il choisit le membre dont il veut voir l'espace.
- **Publicité Meta Ads** (Réglages, carte « Publicité Meta Ads », l'ancienne page `/marketing/publicite` étant retirée) :
  le compte Meta Ads de l'agence. Dépense, coût par lead et par rendez-vous se lisent dans le Tableau de bord.
  - La connexion Meta existante est **réutilisée** : l'administrateur désigne, dans cette carte, lequel des comptes
    déjà connectés est celui de l'agence. Si ce compte n'est pas encore connecté : le connecter dans Studio
    (« Connexions Meta Ads »), sur une fiche client au nom de l'agence. Rien n'est modifié côté Studio.
  - Sa dépense est lue par campagne et par jour (`marketing_ad_insights`), toutes les six heures, en lecture seule.
  - Une campagne est rattachée à ses leads par son nom (`utm_campaign`, sans tenir compte de la casse) ou par son
    identifiant Meta (`campaign_id` dans l'adresse). Par page d'entrée, la dépense d'une campagne est répartie au
    prorata des leads qu'elle y a amenés. Les règles de calcul sont affichées sous chaque tableau.
  - Tant que le compte n'est pas désigné : « dépense non connectée », aucun coût inventé.

## Ressources, SOPs et onboarding (migration 0024)

Page Marketing › Ressources. **Le module Documents existant est réutilisé** : mêmes tables (`documents`,
`document_folders`), mêmes types (SOP, Template, Document), même éditeur de texte et même format de contenu.
Une colonne `space` distingue l'espace : `studio` pour tout ce qui existait, `marketing` pour ces ressources.

- **Un dossier par rôle** (Setter, Closer, Media buyer), chacun avec Onboarding, SOPs et Ressources. La structure
  est créée **vide** par la migration : aucun contenu n'est rédigé.
- **Onboarding** : une liste d'étapes par rôle (`marketing_onboarding_steps`), que l'administrateur ajoute,
  ordonne et relie à un document. Chaque membre coche ses étapes (`marketing_onboarding_progress`) ; l'administrateur
  voit la progression de chaque membre.
- **Droits** : un commercial lit le dossier, les documents et les étapes de son rôle, et ne coche que sa propre
  progression. Seul un membre de l'agence écrit. Un document Marketing ne peut être ni rattaché ni partagé à un
  client (contrainte en base). Preuve : `supabase/tests/marketing_resources.sql`.
- **Ce qui a été touché côté Studio**, et seulement cela : les listes de documents et de dossiers de Studio
  écartent ce qui n'est pas de l'espace Studio. Ce filtre est fait dans l'application et fonctionne que la colonne
  `space` existe ou non : Studio ne dépend pas de cette migration. Aucune règle de Studio n'est modifiée. L'éditeur
  de Studio n'a pas été modifié : la page Ressources a le sien, plus simple, sur le même format.

## Classement des performances

Page Marketing › Classement, sur 7, 30 ou 90 jours (`src/lib/marketing/leaderboard.ts`). La règle de calcul de
chaque chiffre est écrite sous son intitulé.

| Qui | Chiffre | Règle |
|---|---|---|
| Setters | Leads traités | Prospects différents pour lesquels le setter a terminé une tâche (« À appeler » ou relance) dans la période |
| Setters | Rendez-vous pris | Rendez-vous créés dans la période et attribués au setter |
| Setters | Taux de présence | Présents ÷ (présents + absents), annulés et reportés exclus |
| Closers | Appels tenus | Rendez-vous de la période dont il est le closer, résultat « présent » |
| Closers | Taux de signature | Part des prospects de ces appels dont l'issue est « signé » |
| Closers | Montant signé | Somme des montants signés HT de ces prospects |

Setters classés par rendez-vous pris, closers par montant signé. **Pas assez de données** : un taux calculé sur
moins de 5 résultats n'est pas affiché, et un classement n'apparaît que si au moins 2 membres ont chacun 5
rendez-vous pris (setters) ou 5 appels tenus (closers) ; sinon la page le dit, sans classer personne.

Le classement lit des faits sans coordonnées (fonctions `marketing_funnel_*`) : un setter voit les chiffres de
l'équipe, jamais les contacts des autres.

## Données (migration 0008)

- `marketing_prospects` (dédup email insensible à la casse, `unsubscribed_at`).
- `marketing_appointments` — horodatages **en UTC**. Contrainte d'exclusion `btree_gist` : deux rendez-vous
  **confirmés** ne peuvent se chevaucher (anti-double-réservation par la base).
- `marketing_scheduled_emails` — file d'attente (outbox) : statut `pending|claimed|sent|failed|uncertain|cancelled`,
  clé d'idempotence unique, verrou (`claimed_by`/`claimed_at`), `provider_message_id`, `dry_run`.
- `marketing_settings` — réglages clé/valeur (table dédiée, sans toucher `app_settings` de Studio).
- RPC `security definer` :
  - `marketing_book_appointment` : réservation atomique — l'exclusion refuse un chevauchement, le statut
    du prospect passe à « réservé », **les relances d'opt-in en file sont annulées dans la même transaction**,
    et les rappels sont programmés selon les réglages.
  - `marketing_cancel_appointment` : annule le RDV et ses rappels (même transaction).
  - `marketing_claim_due_emails` : réclame les emails dus avec `FOR UPDATE SKIP LOCKED` (anti-doublon concurrent).

### Attribution (migration 0015)

- `marketing_prospects.marque` (texte) et `marketing_prospects.utm` (jsonb) : marque déclarée et paramètres
  d'attribution (`utm_*`, `fbclid`, `gclid`, `ttclid`) relevés à l'opt-in. Complétés, jamais écrasés.

### CRM : qualification, prochaine action, journal (migration 0016 — additive, rejouable)

- Colonnes nullables sur `marketing_prospects` : `besoin`, `budget` (déclaratif, jamais une métrique calculée),
  `next_action_at`, `next_action_note`. Index partiels sur `next_action_at` et `opted_in_at`.
- Table `marketing_prospect_events` (`prospect_id`, `kind`, `data jsonb`, `created_by`, `created_at`) :
  journal horodaté par prospect (`cree`, `opt_in`, `statut`, `note`, `qualification`, `prochaine_action`,
  `rdv_pris`, `rdv_annule`, `relance_programmee`). RLS gardée par `my_has_module('marketing_prospects')`,
  comme les prospects ; les flux publics et le worker écrivent via la clé service (hors RLS). Alimente la
  chronologie de la fiche et l'entonnoir par cohortes. Écriture **best-effort** : journaliser n'échoue jamais
  l'action principale (déploiement tolérant si 0016 n'est pas encore appliquée).

## Réception des leads (migration 0017 — additive, rejouable, avec retour arrière)

Tout ce qu'un site envoie arrive d'abord dans la table `leads_inbox`, tel quel. L'application transforme
ensuite chaque ligne en prospect. Aucun lead n'est supprimé ni ignoré en silence.

### Pourquoi la réception ne dépend pas de l'application

Le site n'écrit plus dans l'application (VPS). Il appelle une **fonction de la base** :
`POST {SUPABASE_URL}/rest/v1/rpc/lead_inbox_receive`. Si l'application est arrêtée ou en redéploiement, le lead
est quand même enregistré ; il sera transformé en prospect au retour de l'application.

- **Insertion seule.** Le rôle public (`anon`) n'a aucun droit sur `leads_inbox` : ni lecture, ni modification,
  ni suppression, ni insertion directe. Il a seulement le droit d'exécuter `lead_inbox_receive`, qui ne sait
  qu'ajouter une ligne et ne renvoie aucune donnée de la table.
- **Aucune suppression.** Un déclencheur refuse tout `DELETE` sur `leads_inbox`, quel que soit le rôle.
- **Lecture réservée.** Seul un membre qui a le module `marketing_reception` lit les lignes et peut les
  retraiter (RLS). Prouvé par `supabase/tests/leads_inbox.sql`.

### Contrat à respecter par un site

Requête : `POST {SUPABASE_URL}/rest/v1/rpc/lead_inbox_receive`, en-têtes `Content-Type: application/json` et
`apikey: <clé publique Supabase>`. Le corps est un objet JSON libre (8 000 octets au plus). Champs reconnus :

| Champ | Rôle |
|---|---|
| `email` | obligatoire pour devenir un prospect (absent ou invalide : la ligne est gardée en « suspect ») |
| `name` ou `prenom`, `phone`, `marque` | identité du contact |
| `site` | nom du site (ex. `iconflow.fr`) |
| `landing_page` | page d'entrée : première page vue, avec ses paramètres |
| `page` | page où le formulaire a été envoyé |
| `referrer` | site d'origine du visiteur |
| `utm` | objet des paramètres de campagne (`utm_source`, `utm_campaign`, `fbclid`…) |
| `suspect` | `true` si le champ piège du formulaire a été rempli |
| `recu_le` | heure d'envoi côté site (sert à l'anti-doublon) |
| `request_id` | facultatif : identifiant unique de requête fourni par le site |

Réponse `200` : `{ "ok": true, "stored": true, "id": "<identifiant de la ligne>", "duplicate": false }`.
Un renvoi du même lead répond le même `id` avec `duplicate: true` (aucun doublon). Le site ne doit considérer
le lead comme reçu que s'il lit `ok: true` **et** un `id`. Corps illisible ou trop gros : `400`. Plafond
atteint : `503`, le site doit réessayer (voir « Limites contre l'abus »).

Identifiant de requête : celui du site s'il en envoie un, sinon une empreinte de `site + email + recu_le`.

Le site `iconflow.fr` (dépôt `funnel-ads`, `api/lead.js`) envoie déjà tous ces champs et se règle par
variables, sans changement de code : `LEAD_INBOX_URL` (l'adresse ci-dessus), `LEAD_INBOX_KEY_HEADER=apikey`,
`LEAD_INBOX_KEY` (clé publique Supabase), `LEAD_REQUIRE_ID=1`, `LEAD_SITE_NAME=iconflow.fr`.

### Statuts d'une ligne

| Statut | Sens | Suite |
|---|---|---|
| `recu` | enregistrée, pas encore traitée | le planificateur la traite dans la minute |
| `traite` | transformée en prospect (lien vers la fiche) | rien |
| `erreur` | traitement impossible, la raison est écrite sur la ligne | corriger puis « Retraiter » |
| `suspect` | email absent ou invalide, champ piège rempli, afflux inhabituel, ou clé de site absente ou inconnue | jamais traitée seule : « Retraiter » si elle est légitime |

### Limites contre l'abus

La clé publique Supabase est publique : n'importe qui peut appeler `lead_inbox_receive` sans passer par le
site. Ce qui limite l'abus, dans la fonction elle-même :

| Limite | Seuil (envois sans clé de site) | Effet |
|---|---|---|
| Taille d'un envoi | 8 000 octets | refus `400`, rien n'est écrit |
| Email | absent, invalide ou plus de 254 caractères | ligne gardée en `suspect` |
| Afflux | 10 envois en 1 minute, ou 100 en 1 heure | les suivants sont gardés en `suspect` |
| Plafond | 20 en 1 minute, 100 en 10 minutes, 1 500 en 24 heures | refus `503` « réessayer », rien n'est écrit |

Une ligne `suspect` ne devient jamais un prospect toute seule et ne programme aucune relance : un afflux ne
pollue donc pas les prospects. Le renvoi d'un lead déjà enregistré est toujours confirmé, même plafond atteint.

Limite assumée : pendant un plafond, un vrai lead reçoit aussi `503`. Le site réessaie deux fois, affiche
l'erreur au visiteur et garde le lead dans ses journaux (`[lead] NON ENREGISTRÉ`). Pour qu'un afflux anonyme
ne bloque jamais le vrai site, activer une clé de site (voir plus bas) : les envois signés ont leur propre
compteur (60 par minute, 300 en 10 minutes, 5 000 par jour).

### Traitement (ligne → prospect), rejouable

`src/lib/marketing/inbox-core.ts` (règles, testées hors ligne) et `src/lib/marketing/inbox.ts` (base, alertes).
Rapprochement par email, insensible à la casse : un email déjà connu complète le prospect existant (jamais
d'écrasement), sinon un prospect est créé avec son site, sa page d'entrée, son site d'origine et ses
paramètres de campagne. Traiter deux fois la même ligne ne crée pas de doublon. Un lead de test suit tout le
circuit mais ne crée aucun prospect.

Limite de la phase 1 : le traitement crée ou complète un **prospect**. La séparation contact / prospect arrive
en phase 2.

### Page Marketing › Réception

Compteurs par statut, lignes reçues (site, page d'entrée, contact, campagne, statut, état de l'alerte), détail
avec la charge utile brute, bouton **Retraiter** par ligne, **Traiter maintenant**, **Envoyer un lead de test**.
Le bloc « État du service » dit si le planificateur tourne, si les alertes partent, et pour chaque variable
attendue « lue » ou « manquante » — jamais une valeur.

### Alertes par email

À chaque nouveau lead et à chaque erreur de traitement, un email part aux adresses saisies dans
Marketing › Réglages (« Adresses à prévenir »). Les alertes sont **regroupées** : au plus un email par passage
du planificateur pour tout ce qui attend (un lead seul : son détail ; plusieurs : un récapitulatif), et au plus
6 emails par heure et 40 par jour. Mille lignes d'un coup donnent donc un seul email, pas mille. Plafond
atteint : la ligne affiche « Alerte en attente » et part dans le message suivant. À partir de 10 lignes
`suspect` en une heure, le message signale un afflux inhabituel. Les alertes partent dès que `RESEND_API_KEY` et `EMAIL_FROM`
sont lues : elles ne dépendent pas du réglage « envoi réel », qui concerne les emails adressés aux prospects.
Sans ces deux variables, l'alerte est notée « simulée » sur la ligne et la page l'affiche. Sans adresse
saisie : « aucun destinataire ».

### Planificateur (pg_cron dans Supabase)

Toutes les minutes, la base appelle `POST {APP}/api/marketing/cron` (Bearer `CRON_SECRET`). L'application
traite les lignes `recu` et note l'heure de son passage. Choix de pg_cron plutôt qu'une tâche sur le VPS : il
vit à côté des données, survit aux redéploiements du VPS et garde l'historique de ses exécutions.

- Installation à la main, une fois : `supabase/ops/marketing_planificateur.sql` (ce n'est pas une migration :
  il contient l'adresse de l'app et range le secret dans le coffre Supabase).
- Le planificateur **n'envoie aucun email aux prospects** tant qu'aucune automatisation qui écrit à un prospect
  n'est allumée (règle 2, ou rappels de la règle 3 : toutes deux éteintes au départ). Voir « Automatisations ».
- Marketing › Réglages affiche la date du dernier passage. État : actif (moins de 5 min), en retard (5 à
  15 min), arrêté (plus de 15 min), jamais exécuté. Arrêté ou jamais exécuté : bandeau en haut de chaque page
  Marketing, et email d'alerte (au plus un toutes les 6 heures).
- Limite : cet email part quand quelqu'un ouvre l'espace Marketing. Pour être prévenu même application
  éteinte, le même fichier contient une sentinelle facultative, côté base (non testée).

### Clés de site (facultatives)

Table `marketing_lead_sites` (nom, empreinte SHA-256 de la clé, active). Tant qu'aucune clé active n'existe,
tout envoi est accepté. Dès qu'une clé existe, un envoi sans en-tête `x-lead-site-key` valide est gardé en
`suspect`, et le nom du site vient de la clé, pas de la charge utile. Non utilisé en phase 1 : le site
`iconflow.fr` n'envoie qu'un en-tête (`apikey`), l'activer demande un petit changement de son code.

### Revenir à l'ancienne route

L'ancienne route `POST /api/marketing/optin` reste en place et inchangée. Pour y revenir : remettre sur le
site les anciennes valeurs de `LEAD_INBOX_URL`, `LEAD_INBOX_KEY_HEADER` et `LEAD_INBOX_KEY`, puis redéployer
le site. Les lignes déjà dans `leads_inbox` restent lisibles et retraitables.

## Contacts, prospects et tâches (migration 0018 — additive, rejouable, avec retour arrière)

Deux modules distincts, plus un module de tâches propre à l'espace Marketing.

- **Contacts** (`marketing_contacts`, module `marketing_contacts`) : une fiche par personne — nom, téléphone,
  email, entreprise, étiquettes, dernière activité. L'email est unique (sans tenir compte de la casse) ; le
  téléphone est normalisé (`06 12 34 56 78` → `+33612345678`) pour rapprocher deux fiches.
- **Prospects** (`marketing_prospects`, module `marketing_prospects`) : une affaire reliée à un contact
  (`contact_id`), placée dans le pipeline (`stage_id`), avec source, valeur, setter et closer responsables,
  résultat d'appel (à venir, présent, absent, annulé, reporté), issue (signé, non signé, en réflexion), montant
  signé HT et note d'appel. La page d'entrée et les paramètres de campagne sont affichés en tête de fiche.
- **Tâches** (`marketing_tasks`, module `marketing_taches`) : « À appeler », relance, résultat à saisir. Rattachée
  à un prospect, attribuée à un membre, avec une échéance. Sans rapport avec les tâches de Studio.

### Une seule fiche par personne

Tout lead passe par `upsertLead` (`src/lib/marketing/crm.ts`) : formulaire du site, saisie à la main, import
GHL, outil de réservation. Le contact est rapproché **par email, puis par téléphone**. On complète une fiche,
on n'écrase jamais une valeur déjà saisie. L'affaire en cours du contact est réutilisée ; s'il n'en a plus
(gagnée ou perdue), une nouvelle affaire s'ouvre à « Nouveau lead ».

### Pipeline « IconFlow — Ventes »

Étapes d'origine : Nouveau lead, Audit réservé, Audit effectué, Follow-up planifié, Proposition envoyée, Gagné,
Perdu (`marketing_pipeline_stages`). Dans Réglages : renommer, réordonner, ajouter une étape, retirer une étape
ajoutée et vide. Les sept étapes d'origine gardent une clé stable (`nouveau_lead`, `audit_reserve`…) sur
laquelle s'appuient les automatisations : elles se renomment, mais ne se retirent pas.

Correspondance appliquée aux prospects existants par la migration :

| Ancien statut | Étape |
|---|---|
| Nouveau | Nouveau lead |
| Relancé | Nouveau lead, avec l'étiquette « relancé » sur le contact |
| Réservé | Audit réservé |
| Converti | Gagné |
| Perdu | Perdu |

L'ancienne colonne `status` est conservée et tenue cohérente par un déclencheur : l'ancienne route d'opt-in et
la réservation interne continuent de fonctionner, et le retour arrière ne perd aucun statut (l'ancien statut de
chaque prospect est noté dans sa chronologie, événement `migration_etape`).

### Écrans

- **Prospects** : vue Tableau (tri par colonne, filtres par étape, setter, closer, source, tâche à faire,
  recherche) et vue Colonnes (glisser-déposer entre étapes, total par colonne).
- **Fiche prospect** : Provenance, Affaire, Appel, Suivi et qualification, Tâches, Rendez-vous, Chronologie.
- **Contacts** : liste (recherche, étiquettes, tri), fiche modifiable, affaires et activité du contact.
- **Tâches** : mes tâches, toutes, non attribuées ; filtres par type et par état ; en retard signalé.
- **Chronologie** : chaque changement (étape, attribution, appel, valeur, tâche, fiche contact) est écrit avec sa
  date et son auteur. « Le système » désigne le planificateur et les outils externes.
- **Export CSV** des contacts et des prospects (`/api/marketing/export`) : réservé à l'administrateur.

### Organisation du code

`src/lib/marketing/db.ts` définit un accès aux données minimal (`Db`), réalisé sur Supabase
(`db-supabase.ts`, sous RLS ou avec la clé service) et en mémoire. Toute la logique (`crm.ts`, imports,
sources, automatisations) est écrite une fois contre cette interface et se vérifie hors ligne.

## Reprise des données GoHighLevel (migration 0019)

Écran : Marketing › Réglages › « Ouvrir l'import » (réservé à l'administrateur). Deux fichiers CSV, dans cet
ordre : les contacts, puis les opportunités.

### Colonnes attendues

Les intitulés de l'export GHL en anglais sont reconnus tels quels, ainsi que leurs équivalents français
(`src/lib/marketing/ghl.ts`). L'ordre n'a pas d'importance, les colonnes en plus sont ignorées, le séparateur
(virgule, point-virgule, tabulation) est détecté.

| Fichier | Colonnes | Indispensable |
|---|---|---|
| Contacts | Contact Id, First Name, Last Name (ou Name), Email, Phone, Business Name, Tags, Source, Created | Email ou Phone (ou Contact Id) |
| Opportunités | Opportunity ID, Opportunity Name, Contact ID, Contact Name, Email, Phone, Pipeline, Stage, Status, Lead Value, Source, Assigned, Created on, Tags | Stage, et Contact ID, Email ou Phone |

### Règles

- **Dédoublonnage** : identifiant GHL déjà importé, puis email, puis téléphone normalisé. Une fiche existante est
  complétée (étiquettes ajoutées), jamais écrasée.
- **Conservés** : étiquettes, source, étape, responsable, date de création, valeur, intitulé de l'opportunité.
- **Étapes** : chaque étape de GHL est associée à une étape de l'app avant l'import (proposition automatique,
  modifiable). Une opportunité « won » va en Gagné, « lost » ou « abandoned » en Perdu.
- **Responsable** : associé à un membre de l'équipe ; il devient closer si le membre est closer, setter sinon.
- **Rejouable** : chaque fiche importée garde la référence de son identifiant GHL (`marketing_external_refs`).
  Relancer le même fichier ne crée aucun doublon.
- **Rapport** : créés, fusionnés, rejetés avec la raison de chaque rejet (liste téléchargeable). L'historique des
  imports est conservé (`marketing_imports`).
- Le fichier est lu dans le navigateur et envoyé par lots de 100 lignes : pas de limite de taille, et un import
  interrompu se reprend sans doublon.

## Outil de réservation : iClosed (migration 0020)

iClosed est l'outil de réservation, et la source des rendez-vous et de leur résultat. Pour pouvoir en changer,
l'app passe par une **couche d'ingestion** (`src/lib/marketing/sources/`) :

- `types.ts` — la forme commune d'un rendez-vous (`SourceBooking`) et d'un contact sans rendez-vous
  (`SourceLead`), et ce qu'un adaptateur doit savoir faire (`SourceAdapter`).
- `iclosed.ts` — l'adaptateur iClosed : il traduit les réponses de l'API vers la forme commune.
- `ingest.ts` — applique ces informations à nos données. Ne connaît aucun outil en particulier.
- `run.ts` — lance la synchronisation, tient le repère et le journal. `bookingSource()` désigne l'outil branché :
  changer d'outil = écrire un autre adaptateur et le renvoyer là.

### Ce que fait la synchronisation

| Ce qui arrive d'iClosed | Effet |
|---|---|
| Un rendez-vous (cas 1) | Contact rapproché ou créé ; rendez-vous rattaché au prospect ; prospect en « Audit réservé » ; sa tâche « À appeler » se ferme ; closer reconnu par son email |
| Un contact sans rendez-vous (cas 2) | Prospect en « Nouveau lead », avec une tâche « À appeler » |
| Un rendez-vous pour ce même contact, plus tard | Le prospect passe en « Audit réservé », la tâche se ferme |
| Rendez-vous déplacé ou annulé | Même rendez-vous mis à jour, événement dans la chronologie |
| Résultat saisi dans iClosed | Résultat d'appel (présent, absent, annulé), issue (signé, non signé, en réflexion) et montant reportés sur le prospect ; « présent » fait passer en « Audit effectué » |
| Contact disqualifié | Prospect créé, étiqueté « disqualifié (iClosed) », sans tâche |

Une seule fiche contact par personne entre l'opt-in du site, l'import GHL et iClosed : même rapprochement
(identifiant iClosed déjà vu, puis email, puis téléphone).

**Rejouable** : un rendez-vous est reconnu par son identifiant iClosed (`source` + `external_id`, uniques) ; une
tâche n'est créée qu'à la première rencontre du contact (si le setter l'a terminée, elle n'est pas recréée).

### Lecture par l'API

- Variable `ICLOSED_API_KEY` (iClosed › Settings › Developer › API Keys). Sans elle, rien n'est lu.
- Le planificateur lance la lecture toutes les cinq minutes (`/api/marketing/cron`). Bouton « Synchroniser
  maintenant » dans Réglages. L'API n'a pas de filtre « modifié depuis » : on lit du plus récemment modifié
  au plus ancien jusqu'au dernier déjà vu. La première fois, tout l'historique est chargé par tranches, sur
  plusieurs passages si besoin (Réglages affiche « premier chargement en cours »).
- Limite d'iClosed : 20 requêtes par 10 secondes (offre Startup) ; les appels sont espacés en conséquence.

### Notifications (webhook), facultatives

iClosed **ne signe pas** ses notifications à ce jour (signature annoncée dans sa documentation, pas livrée). La
route `/api/marketing/sources/webhook` reste donc éteinte tant que `ICLOSED_WEBHOOK_SECRET` n'est pas posée, et
quand elle l'est : (1) l'adresse doit contenir ce secret (`?cle=…`), comparé en temps constant ; (2) le contenu
reçu n'est jamais cru, il sert seulement à savoir quel rendez-vous relire par l'API. Sans notifications, la
lecture toutes les cinq minutes suffit.

### Réservation interne masquée

Réglage « Outil de réservation » : **externe** par défaut. Dans ce mode, `/reserver` répond « page introuvable »,
les disponibilités et la réservation en ligne disparaissent de Réglages, et le bouton « Réserver » des fiches est
retiré. Le lien de réservation de l'outil externe (facultatif) est repris dans l'email de relance. Repasser en
« interne » rétablit tout.

L'interdiction de chevauchement de la base ne vaut plus que pour les rendez-vous pris dans l'app : deux closers
peuvent avoir un appel à la même heure dans iClosed.

### Non vérifié sur un vrai compte

L'adaptateur est écrit d'après la documentation publique d'iClosed et vérifié sur ses exemples
(`scripts/sources-selfcheck.ts`, 37 vérifications). Il n'a pas été essayé sur un compte réel : le premier
« Synchroniser maintenant » est le vrai test.

## Calendrier relié à Google (migration 0021)

Page Marketing › Calendrier : les rendez-vous de l'outil de réservation et les agendas Google de l'équipe, **en
lecture seule**. L'app n'écrit jamais dans Google (iClosed écrit lui-même dans Google Agenda).

- **Connexion par membre**, une seule fois : bouton « Connecter Google » en bas de la page. Seul droit demandé :
  lire les agendas (`calendar.readonly`). Accès hors ligne : Google remet un jeton de renouvellement, stocké
  **chiffré** (AES-256-GCM, clé `MARKETING_ENCRYPTION_KEY`) dans `marketing_google_accounts`, table que seuls
  les traitements du serveur lisent. L'accès est renouvelé automatiquement.
- **Agendas au choix** : seul l'agenda principal est coché au départ ; le membre coche ceux qu'il veut montrer.
- **Jeton invalide** (accès retiré dans Google, jeton expiré) : le membre voit « Reconnecter Google » sur la page,
  au lieu d'un échec silencieux. Les autres comptes continuent d'être lus.
- **Copie locale** des événements (`marketing_calendar_events`) sur 14 jours passés et 45 jours à venir, rafraîchie
  toutes les dix minutes par le planificateur, et à la demande (« Actualiser »).
- **Vue Semaine et vue Liste**. Filtres par membre, par agenda et par type : *rendez-vous* (au moins un invité)
  ou *créneau bloqué* (aucun invité).
- **Rapprochement avec un contact** par l'email d'un invité (les membres de l'équipe ne comptent pas).
- **Un rendez-vous, une seule fois** : s'il est déjà arrivé par iClosed, l'événement Google correspondant (même
  contact, même heure à cinq minutes près) est reconnu et n'est pas affiché en double.

### Mise en place dans Google Cloud (à faire une fois, par l'administrateur)

1. Ouvre `console.cloud.google.com` avec le compte Google de l'agence. En haut, « Sélectionner un projet » ›
   « Nouveau projet ». Nom : « Iconflow Studio ». Crée, puis sélectionne ce projet.
2. Menu › « API et services » › « Bibliothèque ». Cherche « Google Calendar API », ouvre-la, clique « Activer ».
3. Menu › « API et services » › « Écran de consentement OAuth » (aussi appelé « Google Auth Platform »).
   Type d'utilisateur : **Externe**. Nom de l'application : « Iconflow Studio ». Adresse d'assistance et adresse
   du développeur : la tienne. Enregistre.
4. Dans « Accès aux données » (ou « Champs d'application »), ajoute un seul champ :
   `https://www.googleapis.com/auth/calendar.readonly`. Enregistre.
5. Dans « Audience », clique **« Publier l'application »** pour passer de « Test » à « En production ». Ne lance
   pas la vérification : l'app est interne, moins de 100 comptes. (En mode « Test », les connexions expirent au
   bout de sept jours : c'est pour cela qu'il faut publier.)
6. Menu › « API et services » › « Identifiants » › « Créer des identifiants » › « ID client OAuth ». Type :
   **Application Web**. Nom : « Iconflow Studio ». Dans « URI de redirection autorisés », ajoute exactement :
   `https://studio.iconflow.fr/api/marketing/google/callback`. Crée.
7. Google affiche un **ID client** et un **code secret du client** : ce sont les valeurs de `GOOGLE_CLIENT_ID`
   et `GOOGLE_CLIENT_SECRET`, à poser sur l'hébergeur (jamais dans une conversation).
8. Sur l'hébergeur, ajoute aussi `MARKETING_ENCRYPTION_KEY` : une longue valeur aléatoire (32 caractères au
   moins, par exemple le résultat de `openssl rand -base64 48`). **Ne la change plus ensuite** : elle sert à
   déchiffrer les jetons déjà stockés ; si elle change, chaque membre doit reconnecter Google.
9. Redéploie, puis dans l'app : Marketing › Calendrier › « Connecter Google ». À la première connexion, Google
   affiche « Google n'a pas validé cette application » : clique « Paramètres avancés » puis « Accéder à Iconflow
   Studio ». C'est normal pour une application interne non vérifiée.

Variables : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MARKETING_ENCRYPTION_KEY`. Facultative :
`GOOGLE_REDIRECT_URL` (par défaut `NEXT_PUBLIC_APP_URL` + `/api/marketing/google/callback`). La page Calendrier
indique à l'administrateur lesquelles sont « lues » ou « manquantes ».

### Non vérifié sur un vrai compte

Les appels à Google sont vérifiés sur de fausses réponses (`scripts/google-selfcheck.ts`, 35 vérifications) :
jeton chiffré, lecture seule, renouvellement, « à reconnecter », rapprochements, lecture partielle, relecture d'un événement. La connexion réelle demande les
identifiants Google : elle n'a pas pu être essayée ici.

## Emails — DRY RUN par défaut

- **Rien n'est envoyé** tant que `emails_live` n'est pas activé dans les réglages. Le worker enregistre
  seulement ce qu'il aurait envoyé (ligne marquée « simulé »), visible dans *Relances & rappels*.
- Un mode « adresse de test » (tout rediriger vers une adresse) n'existe qu'en envoi réel, après activation.
- Worker (`src/lib/marketing/worker.ts`, route `/api/marketing/emails/run` protégée par `CRON_SECRET`) :
  - réclame par verrou ; **invariant** : avant une relance, relit l'état du prospect — un prospect ayant un
    RDV confirmé (ou désinscrit) ne reçoit pas la relance (en plus de l'annulation faite à la réservation) ;
  - succès → `sent` ; échec franc → `failed` avec retry à backoff limité ; **délai/réponse ambiguë → `uncertain`,
    sans renvoi aveugle** (l'email a pu partir). Clé d'idempotence Resend transmise pour la réconciliation.
- Lien de désinscription dans la relance (`/reserver/desinscription?p=…`).

### Quand la file avance

La file d'emails vers les prospects avance pendant le passage du planificateur **seulement si** une
automatisation allumée le demande (`sendsProspectEmails`) : règle 2 avec « email de relance », ou règle 3 avec
« rappels ». Les deux sont éteintes au départ. Même allumées, les emails restent en simulation tant que
`RESEND_API_KEY` et `EMAIL_FROM` manquent ou que l'envoi réel (`emails_live`) est éteint. Garde-fou : un email
dû depuis plus de 48 h est annulé, jamais envoyé en retard. La route `/api/marketing/emails/run`
(Bearer `CRON_SECRET`) existe toujours pour un passage à la main.

## Automatisations (migration 0025)

Pas de constructeur visuel : six règles fixes, chacune avec son interrupteur et ses délais
(*Réglages › Automatisations*), et un journal. Code : `src/lib/marketing/automations.ts` (logique, écrite contre
`Db`, vérifiable hors ligne), `automations-server.ts` (équipe réelle, email interne, passage du planificateur).

| Règle | Déclencheur | Ce qu'elle fait | Au départ |
| --- | --- | --- | --- |
| 1. Nouveau lead | un lead devient un prospect (réception, iClosed) | alerte email interne ; attribution à un setter, chacun son tour | allumée |
| 2. Lead sans rendez-vous | planificateur, X heures après l'arrivée (24 h) | email de relance au prospect ; tâche « À appeler » si le téléphone est connu | **éteinte** |
| 3. Rendez-vous pris | un rendez-vous arrive (iClosed) | passage en « Audit réservé », tâche « À appeler » fermée ; rappels email au prospect en option | allumée, rappels **éteints** |
| 4. Rendez-vous passé sans résultat | planificateur, X heures après la fin (2 h) | tâche « Résultat à saisir » et email de rappel au closer | allumée |
| 5. Absent | le résultat d'appel passe à « absent » | tâche de relance pour le setter du prospect | allumée |
| 6. Signé | l'issue passe à « signé » | passage en « Gagné » ; proposition de créer le client dans Studio | allumée |

Règles de fonctionnement :

- **Une fois, pas deux.** Chaque action écrit une ligne dans `marketing_automation_runs` avec une clé unique
  (`règle:prospect` ou `règle:rendez-vous`). Le planificateur peut repasser, une synchronisation peut être
  rejouée : la règle ne refait rien.
- **Tout est visible.** Le journal (60 dernières exécutions) est en bas de la page Automatisations, et chaque
  action apparaît dans la chronologie du prospect (« automatisation »).
- **Rien n'écrit à un prospect par défaut.** La règle 2 et les rappels de la règle 3 sont éteints : iClosed peut
  déjà envoyer ses propres rappels. Les allumer est une décision. Une relance déjà prévue par l'ancien réglage
  « relance après opt-in » n'est jamais doublée.
- **Règle 2 : pas de réveil de l'historique.** Seuls les leads des 14 derniers jours sont concernés ; un
  prospect désinscrit ne reçoit rien.
- **Tour de rôle (règle 1).** Les setters actifs, dans un ordre fixe ; le dernier servi est gardé dans le réglage
  `automation_state`. Un prospect déjà attribué garde son setter. Sans setter dans l'équipe, rien n'est attribué.
- **Alerte (règle 1).** L'interrupteur « Envoyer l'alerte » coupe l'email « nouveau lead » ; les lignes en erreur
  et les afflux suspects restent signalés. Les lignes concernées sont notées `desactivee`.
- **Règle 6 : le seul lien avec Studio.** La règle crée une ligne `marketing_client_proposals` (« en attente »).
  Rien n'est écrit dans Studio. L'administrateur voit « Clients à créer dans Studio » (page Automatisations et
  fiche du prospect) et choisit : *Créer le client* (fiche client Studio avec le nom et l'email, rien d'autre) ou
  *Ignorer*. Si un client du même nom existe déjà, l'app le dit et ne crée rien.
  À la création, Studio reçoit aussi quatre tâches d'onboarding et un premier brief vide (voir
  `docs/features/studio-menu.md`).
- Les règles 5 et 6 s'appliquent que le résultat soit saisi à la main ou reçu d'iClosed.

Droits (dans la base) : le journal se lit avec la page Réglages et ne s'écrit que par le serveur ; les
propositions de client sont réservées à l'administrateur. Un commercial n'y a aucun accès.

Non vérifié en production : rien de ce module n'a tourné sur la vraie base ni envoyé de vrai email.

## Flux publics (points d'extension, non branchés)

- `POST /api/marketing/optin` — **ancienne route**, gardée en secours (voir « Revenir à l'ancienne route »).
  Elle écrit directement un prospect et ne garde ni le site ni la page d'entrée. Secret partagé
  `MARKETING_OPTIN_SECRET`, validation zod, déduplication par email, limitation de débit.
  **Réponse = preuve d'écriture** : `200 { ok: true, stored: true, id, created }` uniquement quand la ligne a été
  écrite puis relue en base (`id` = prospect, `created` = faux si l'email existait déjà). Toute erreur de lecture ou
  d'écriture répond `500` — jamais « enregistré ». Sans base reliée (démo) : `stored: false`. L'appelant ne doit
  considérer le lead comme reçu que s'il lit `ok: true` **et** un `id`.
- `/reserver` — réservation publique, **désactivée par défaut** (`booking_public_enabled`). Validation serveur,
  anti-robots (champ piège), limitation de débit, créneau vérifié contre les disponibilités réelles.

## CRM — prospects (liste + pipeline, fiche enrichie)

- **Deux vues** (bascule, recherche conservée) : **Liste** (tri par opt-in récent / prochaine action /
  ajout, filtre par statut, badges *RDV à venir* et *À relancer*) et **Pipeline** kanban par statut avec
  **glisser-déposer** (`@dnd-kit`). Déplacer une carte change le statut **via la même server action** que la
  fiche (`updateProspect`). Les prospects « à relancer aujourd'hui » (prochaine action due, hors converti/perdu)
  sont mis en évidence dans les deux vues.
- **Fiche** : en-tête (contact, marque, source, statut), carte *Provenance* (UTM), bloc **Suivi &
  qualification** (statut, prochaine action + note, besoin, budget indicatif déclaratif, notes internes —
  un seul enregistrement), et **Chronologie** horodatée (opt-in, statut, qualification, notes, RDV).
- Le journal d'événements est **alimenté par les actions existantes** (création, opt-in, changement de statut,
  note, qualification, prochaine action, réservation/annulation de RDV), côté membre (RLS) comme côté flux
  public (clé service).

## Données marketing (tableau de bord)

Uniquement des données réelles, chaque carte indique sa source. Calcul : `src/lib/marketing/funnel.ts`
(fonctions pures), à partir des « faits » sans coordonnées (`marketing_funnel_prospects/appointments`), donc
lisible par le media buyer sans aucun nom, email ni téléphone.

- **Période** : 7, 30 ou 90 jours. On suit la **cohorte** des leads arrivés sur la période, jusqu'où chacun
  est allé ; un lead compte une seule fois par étape.
- **Leads dans le temps** : leads par jour.
- **Du lead à la signature** : leads → RDV pris → présents → signés, plus le montant signé HT.
- **Entonnoir par page d'entrée** et **par campagne**, mêmes colonnes. La page est comptée sans ses
  paramètres ; la campagne vient de `utm_campaign` (ou de l'identifiant de campagne Meta), sans tenir compte
  de la casse.
- **Comparer deux pages** : deux pages d'entrée côte à côte (page avec optin / page sans optin).
- **Répartition par étape**, **par source**, **RDV à venir par semaine**.

Règles de calcul (affichées sous chaque tableau, `FUNNEL_RULES`) :

- *RDV pris* : au moins un rendez-vous non annulé (ou un appel noté « présent »).
- *Présents* : un rendez-vous, ou la fiche, a le résultat « présent ».
- *Signés* : issue « signé » ou étape de type « Gagné ». *Montant* : montant signé HT saisi.
- *Dépense* : seulement si le compte Meta Ads de l'agence est désigné (Marketing › Réglages › Publicité Meta Ads). Sinon les
  coûts restent vides : aucun chiffre inventé. Par page, la dépense d'une campagne est répartie au prorata de
  ses leads ; la dépense des campagnes sans lead est signalée à part.

## Sans base reliée (développement)

Aucune donnée de démonstration : sans base, l'espace Marketing démarre **vide** (`src/lib/marketing/demo-store.ts`,
mémoire de session). Les 39 prospects fictifs ont été retirés du code. Rien n'a été supprimé dans la base de
production. Dans ce mode, aucun email réel, aucune réservation réelle, aucune écriture vers la production ;
les écrans portent le badge « Démo ».

## Variables d'environnement

| Variable | Rôle | Sans elle |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | traitement des leads sans session (planificateur) | les lignes restent « reçu » |
| `CRON_SECRET` | autorise le planificateur à appeler `/api/marketing/cron` | la route répond 503 |
| `RESEND_API_KEY`, `EMAIL_FROM` | envoi des alertes et des emails | simulation, affichée dans l'app |
| `NEXT_PUBLIC_APP_URL` | lien « Ouvrir la réception » dans les alertes | l'alerte part sans lien |
| `MARKETING_OPTIN_SECRET` | ancienne route d'opt-in | elle répond « non configuré » |
| `ICLOSED_API_KEY` | lecture des rendez-vous iClosed | aucune synchronisation |
| `ICLOSED_WEBHOOK_SECRET` | notifications immédiates d'iClosed (facultatif) | la route reste éteinte |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | connexion Google Agenda des membres | « Connecter Google » indisponible |
| `MARKETING_ENCRYPTION_KEY` | chiffrement des jetons Google (ne plus la changer) | connexion Google refusée |

Côté Supabase (coffre Vault) : secret `iconflow_cron_secret`, même valeur que `CRON_SECRET`.
Marketing › Réception indique pour chacune « lue » ou « manquante », jamais la valeur.

## Migrations

Dans l'ordre, additives et rejouables :

1. `supabase/migrations/0008_marketing.sql` — espace Marketing (prospects, RDV, outbox, réglages, RPC, RLS).
2. `supabase/migrations/0015_marketing_prospect_marque_utm.sql` — colonnes `marque` / `utm`.
3. `supabase/migrations/0016_marketing_crm.sql` — qualification, prochaine action, table `marketing_prospect_events` + RLS.
4. `supabase/migrations/0017_leads_inbox.sql` — boîte de réception, fonction `lead_inbox_receive`, clés de
   site, colonnes `site` / `landing_page` / `referrer` sur les prospects, module `marketing_reception`.
   Retour arrière : `supabase/rollbacks/0017_leads_inbox.down.sql` (exporter `leads_inbox` avant).

5. `supabase/migrations/0018_marketing_contacts_pipeline.sql` — contacts, étapes du pipeline, tâches, colonnes
   de l'affaire sur les prospects, reprise des prospects existants. Retour arrière :
   `supabase/rollbacks/0018_marketing_contacts_pipeline.down.sql`.

6. `supabase/migrations/0019_marketing_import.sql` — références externes (import et synchronisations
   rejouables) et rapports d'import. Retour arrière : `supabase/rollbacks/0019_marketing_import.down.sql`.

7. `supabase/migrations/0020_marketing_sources.sql` — source, identifiant externe, setter, closer et résultat
   sur les rendez-vous ; journal des synchronisations. Retour arrière :
   `supabase/rollbacks/0020_marketing_sources.down.sql`.

8. `supabase/migrations/0021_marketing_google_calendar.sql` — comptes Google connectés (jeton chiffré) et copie
   des événements. Retour arrière : `supabase/rollbacks/0021_marketing_google_calendar.down.sql`.

9. `supabase/migrations/0022_marketing_roles.sql` — rôle commercial, règles ligne par ligne, fonctions sans
   coordonnées. Retour arrière : `supabase/rollbacks/0022_marketing_roles.down.sql` (retire l'accès des comptes
   commerciaux).
10. `supabase/migrations/0023_marketing_ads.sql` — dépense publicitaire par campagne et par jour. Retour arrière :
    `supabase/rollbacks/0023_marketing_ads.down.sql`.

11. `supabase/migrations/0024_marketing_resources.sql` — espace des documents, dossiers par rôle (vides),
    onboarding. Retour arrière : `supabase/rollbacks/0024_marketing_resources.down.sql`.
12. `supabase/migrations/0025_marketing_automations.sql` — journal des automatisations, propositions de client.
    Retour arrière : `supabase/rollbacks/0025_marketing_automations.down.sql`.
13. `supabase/migrations/0026_marketing_crm_suite.sql` — couleur des colonnes, suivi quotidien, historique des
    comptes. Retour arrière : `supabase/rollbacks/0026_marketing_crm_suite.down.sql`.
14. `supabase/migrations/0027_clients_contract_end.sql` — Studio : date de fin de contrat d'un client (une colonne,
    vide par défaut). Retour arrière : `supabase/rollbacks/0027_clients_contract_end.down.sql`.
15. `supabase/migrations/0028_marketing_kpi_links.sql` — liens de saisie des KPI : personnes autorisées (jeton) et
    leurs saisies, fonction `marketing_kpi_link_people()`, repère de version 28. Retour arrière :
    `supabase/rollbacks/0028_marketing_kpi_links.down.sql` (supprime les personnes, leurs liens et leurs saisies ;
    remet la version 26).

L'application affiche un bandeau « La base n'est pas à jour » quand une migration attendue manque
(repère : clé `schema` de `marketing_settings`). **Appliquer les migrations avant de déployer le code.**

Hors migration, à la main : `supabase/ops/marketing_planificateur.sql`.

## Tests

- `supabase/tests/marketing.sql` et `supabase/tests/leads_inbox.sql` : droits et règles en base, sur une base
  de test (`begin … rollback`). **Jamais sur la production.**
- `supabase/tests/marketing_crm.sql` : étape et ancien statut cohérents, email unique, droits par module.
- `pnpm dlx tsx scripts/crm-selfcheck.ts` : contacts, dédoublonnage, étapes, tâches, chronologie (38 vérifications).
- `pnpm dlx tsx scripts/ghl-selfcheck.ts` : lecture des CSV, dédoublonnage, rejets, réimport sans doublon (25 vérifications).
- `supabase/tests/marketing_sources.sql` : rendez-vous externes simultanés, doublon refusé.
- `pnpm dlx tsx scripts/sources-selfcheck.ts` : traduction iClosed, cas 1 et 2, rejouabilité, lecture de l'API (37 vérifications).
- `pnpm dlx tsx scripts/google-selfcheck.ts` : jeton chiffré, lecture seule, « à reconnecter », rapprochements, lecture partielle, relecture (35 vérifications).
- `supabase/tests/marketing_roles.sql` : ce que chaque rôle peut lire et écrire, dans la base (7 blocs).
- `pnpm dlx tsx scripts/funnel-selfcheck.ts` : entonnoir par campagne et par page, répartition de la dépense, périmètre d'un commercial (26 vérifications).
- `supabase/tests/marketing_resources.sql` : ressources par rôle, lecture seule, progression personnelle (5 blocs).
- `pnpm dlx tsx scripts/team-selfcheck.ts` : classement, seuils « pas assez de données », ressources et onboarding (26 vérifications).
- `supabase/tests/marketing_crm_suite.sql` : couleur des colonnes, suivi quotidien de chacun, historique des comptes non modifiable (6 blocs).
- `pnpm dlx tsx scripts/kpi-selfcheck.ts` : closing, semaines, closers, setters, sources, suivi déclaré (33 vérifications).
- `supabase/tests/marketing_kpi_links.sql` : contraintes (rôle, jeton, date, taille), anon sans accès, setter et closer
  sans personnes ni jetons, membre KPI qui lit les saisies et les noms sans les jetons, administrateur qui gère, droits de
  table et de fonction sans politique ouverte (8 blocs).
- `pnpm dlx tsx scripts/kpi-links-selfcheck.ts` : jeton, champs par rôle, fenêtre des jours, saisie remplacée, lien
  désactivé ou renouvelé, totaux déclarés, jeton masqué dans le journal (52 vérifications).
- `supabase/tests/marketing_automations.sql` : une action par clé, journal en lecture seule, propositions réservées à l'administrateur (5 blocs).
- `pnpm dlx tsx scripts/automations-selfcheck.ts` : les six règles, tour de rôle, délais, rejouabilité, rien vers un prospect par défaut (44 vérifications).
- `pnpm dlx tsx scripts/leads-inbox-selfcheck.ts` : traitement des leads et alertes regroupées, hors ligne (42 vérifications).

Le code tolère un déploiement avant les migrations (page Réception : bandeau « migration 0017 non appliquée »,
journal best-effort), mais chaque fonction ne marche vraiment qu'une fois sa migration appliquée.

## Lien d'onboarding (/bienvenue/<jeton>, sans migration)

Un seul lien pour toutes les nouvelles recrues. L'administrateur (ou un membre de l'agence qui peut écrire
les ressources) le trouve en haut de **Ressources**, carte « Lien d'onboarding » : « Copier le lien », « Changer le
lien » (confirmation : l'ancien lien ne marchera plus) et l'interrupteur « Lien actif ».

- **Côté recrue.** Elle ouvre le lien et tape l'e-mail enregistré pour elle dans l'app. Majuscules ignorées.
  - **Membre actif de l'équipe Marketing** (invitation dans Équipe ; son rôle commercial, setter par défaut) : son
    e-mail suffit, comme demandé (« pour activer le lien, il doit mettre l'e-mail que j'ai mis dans l'app »). Seule
    exception : si un AUTRE compte de l'app est connecté sur l'appareil (un collègue sur son propre téléphone), on
    refuse avec « un autre compte est connecté sur cet appareil ». Limite assumée : quelqu'un qui a le lien et connaît
    l'e-mail d'un membre peut lire le contenu de ce rôle (onboarding, SOPs, ressources internes, jamais de données de
    prospects). Il faut aussi que son compte ait la page **Ressources** (`marketing_ressources`), comme dans l'app.
    Jamais de repli sur une personne d'un lien de saisie au même e-mail.
  - **Personne active d'un lien de saisie des KPI** (avec un e-mail) : sans compte, son e-mail suffit.
  - Sinon, un seul message : « Cet e-mail n'est pas reconnu… ». Essais ratés limités à 10 par adresse IP sur
    10 minutes (en mémoire, par instance). Une ouverture réussie ne compte pas, et le compteur est propre à chaque
    adresse : personne ne peut bloquer les autres recrues. Une adresse bloquée l'est même avec le bon e-mail.
- **Ce qu'elle voit.** Les étapes d'onboarding de son rôle (à cocher, barre « x étapes sur y »), puis les documents
  des dossiers de son rôle et des dossiers communs (Onboarding, SOPs, Ressources…), en lecture seule sur
  `/bienvenue/<jeton>/document/<id>`. Mêmes règles que la base pour un commercial de ce rôle qui a la page Ressources : jamais un document de
  Studio, jamais celui d'un autre rôle, jamais un document archivé. Liens des documents : https seulement.
- **Progression.** Membre : enregistrée sur son profil (`marketing_onboarding_progress`), elle apparaît dans
  « Progression des membres ». Personne d'un lien de saisie (sans profil) : gardée sur son appareil.
- **Jeton jamais stocké.** Il est dérivé de la clé service : HMAC-SHA256 d'une clé tirée de `SUPABASE_SERVICE_ROLE_KEY`
  sur la version du lien. Seuls `version` et `enabled` sont gardés dans `marketing_settings` (clé `onboarding_link`,
  défaut `{ "version": 1, "enabled": true }`) : la version seule ne permet pas de fabriquer le lien. L'accès ouvert tient
  dans un cookie signé (httpOnly, 30 jours, limité à `/bienvenue`) : changer ou couper le lien l'annule ; retirer un
  membre, lui retirer la page Ressources, se connecter à un autre compte sur l'appareil ou désactiver un lien de saisie aussi (tout est
  revérifié à chaque page). « Ce n'est pas moi » efface le cookie.
- **Lien coupé (« Lien actif » éteint).** Qui a le vrai lien lit « Ce lien est en pause pour le moment » : le même
  lien remarchera quand il sera rallumé, inutile d'en demander un autre. Un jeton faux ou ancien reçoit toujours la
  même réponse neutre « Ce lien n'est plus valable ».
- **Aperçu dans WhatsApp, iMessage ou Slack** : « Bienvenue · IconFlow », « Ton onboarding, tes SOPs et tes ressources. »
  (description et Open Graph propres au lien). La page prend le style Marketing dès le premier affichage (script du
  layout racine et `isMarketingPath`, comme `/kpi/<jeton>`).
- **Si la clé service change chez l'hébergeur**, le lien change aussi : il suffit d'en recopier un nouveau dans
  Ressources. Sans clé service, la carte l'indique et le lien ne s'ouvre pas.
- **Sans base (démo).** Secret fixe de démo et réglage en mémoire. Essai : connecté avec le compte d'essai Closer, taper
  `closer@demo.invalid` ; ou, avec `MARKETING_DEMO_SAMPLE=1`, `romain.girard@exemple.fr` (personne d'exemple d'un lien
  de saisie, sans compte).
- Le jeton n'apparaît pas dans le journal des erreurs (`redactSecretPaths`). Code : `src/lib/marketing/onboarding-link.ts`
  (logique pure), `onboarding-link-server.ts`, `src/lib/actions/marketing-onboarding.ts`, `src/app/bienvenue/[token]/`.
- `pnpm dlx tsx scripts/onboarding-link-selfcheck.ts` : jeton par version, lien en pause, cookie signé, reconnaissance
  de l'e-mail (compte connecté exigé pour un membre, page Ressources), accès revérifié, limite d'essais ratés, style
  Marketing, filtrage du contenu par rôle (83 vérifications).

## Appels Google → Prospects (sans migration, novembre 2026)

Chaque appel de l'agenda Google d'un membre arrive tout seul dans **Prospects**, relié au bon contact.
Logique : `src/lib/marketing/google/calls-to-prospects.ts` (écrite contre `Db`, sans rien côté serveur), appelée par
`syncGoogleAccount` (`google/sync.ts`) à chaque lecture d'un compte, avec la clé service.

- **Quels événements** : un appel **à venir** (pas encore terminé : la lecture couvre aussi les 14 jours passés, mais
  un appel passé n'est jamais importé), avec au moins un invité **extérieur à l'équipe**, pas « journée entière », pas
  déjà reçu d'un autre outil (même contact, même heure à cinq minutes près : iClosed, pris dans l'app).
- **Qui n'est pas extérieur** : les emails des profils agence et marketing, les adresses Google qu'ils ont reliées, les
  clients du portail Studio (`profiles.role = 'client'`), et toute adresse d'un **domaine de l'équipe** (lea@agence.fr
  quand le profil de Léa porte son Gmail, une adresse de groupe equipe@agence.fr), hors messageries publiques
  (gmail.com, outlook.com…). Un événement entre membres de l'équipe est ignoré.
- **Jamais importé** : une invitation que le propriétaire de l'agenda a **refusée** ou laissée **sans réponse**
  (démo d'un fournisseur, spam d'agenda) ; un appel dont **tous les invités extérieurs ont refusé** ; une réunion avec
  un **client déjà signé** (dernière affaire du contact « Gagné ») ; une **réunion récurrente** au-delà de sa prochaine
  occurrence (une seule par série) ; un événement, une série ou un invité **écarté par l'administrateur** (ci-dessous).
  Un contact « Perdu » qui reprend rendez-vous reçoit une nouvelle affaire.
- **Contact** : le premier invité extérieur qui a déjà une fiche (email, majuscules ignorées) ; sinon une fiche est
  créée pour le premier invité extérieur (nom donné par Google s'il existe, sinon sans nom ; source « Google Agenda »).
- **Prospect** : l'affaire en cours du contact, ou une affaire qui porte cet email ; sinon une nouvelle affaire en
  « Audit réservé » (à défaut : la première étape ouverte après la première, sinon la première). Une affaire encore à
  la toute première étape passe en « Audit réservé » ; plus loin, son étape ne change pas. Chronologie : « Rendez-vous
  pris · depuis Google Agenda », et la règle « Rendez-vous pris » des automatisations comme pour iClosed.
- **Rendez-vous** : `source = 'google'`, `external_id` = identifiant Google (le même événement dans les agendas de deux
  membres ne crée qu'un rendez-vous et qu'un prospect), confirmé, créé par le propriétaire de l'agenda, lien Meet repris.
  **Attribution** selon le rôle d'appel du propriétaire (y compris un administrateur qui a choisi Closer) : closer →
  `closer_id`, setter → `setter_id`, sinon rien. Sur le prospect, seule une attribution vide est remplie. Un membre
  dont l'accès est retiré, ou qui a refusé l'invitation, ne pose aucune attribution ; le planificateur ne relit plus
  les comptes des membres sans accès.
- **Suivi** : événement déplacé → heures mises à jour (le résultat saisi reste). Un événement **absent de la lecture**
  est d'abord **relu chez Google** (`events.get`, lecture seule) : déplacé, même au-delà de J+45, ses heures suivent ;
  supprimé ou annulé chez Google (404, 410, « cancelled »), le rendez-vous passe en « annulé » (résultat « annulé »
  seulement s'il était « à venir »), sauf si un autre compte **encore relu** a toujours l'événement (un compte « à
  reconnecter » ou d'un membre sans accès ne compte pas). Relecture en échec : rien n'est annulé, la ligne reste et
  l'événement est relu au passage suivant (25 relectures au plus par passage). Un agenda lu **en partie** (plus de
  1 000 événements) ne sert pas à repérer les retraits. Tous les invités extérieurs ont refusé → annulé. Un
  rendez-vous annulé n'est jamais rétabli. Un import Google arrivé avant le même rendez-vous iClosed est annulé quand
  celui-ci arrive (doublon).
- **Prospect supprimé** : à la suppression d'un prospect qui a des rendez-vous Google, leurs identifiants (et leur
  série) sont retenus dans `marketing_settings`, clé `google_calls_ignored`, avec l'email du contact quand la fiche
  part avec lui. Ces événements et cet invité ne sont plus jamais importés (2 000 entrées au plus de chaque).
- **Une seule fois à l'écran** : la ligne de `marketing_calendar_events` pointe vers le rendez-vous et le contact ;
  Tableau de bord › Appels à venir et Calendrier montrent l'appel par ce rendez-vous. La ligne Google n'est sautée que
  si ce rendez-vous est **lu sous les droits du membre** : un rendez-vous attribué à un collègue du même rôle reste
  visible depuis l'agenda Google du membre. Le lien vers la fiche prospect n'apparaît que si le membre voit ce prospect.
  Un même événement non relié, présent chez deux membres, n'y apparaît qu'une fois.
- **Une lecture à la fois par compte** : avant de lire, le compte est réservé en une seule requête
  (`last_sync_at` posé seulement s'il est vide ou assez ancien : une minute à la demande, dix minutes pour le
  planificateur). Le callback de connexion, « Actualiser », « Enregistrer », le planificateur et le Tableau de bord ne
  lisent donc jamais le même compte en même temps ; les créations s'arrêtent 15 secondes avant la fin de la
  réservation. Lecture en échec : la réservation est rendue. Si deux imports se croisent malgré tout, le prospect et le
  contact créés pour rien sont retirés (aucun prospect sans rendez-vous).
- **Réglage** : Réglages › Intégrations › Google Agenda, « Créer un prospect pour chaque appel de l'agenda Google »
  (`marketing_settings`, clé `google_calls_to_prospects`, **allumé par défaut**), modifiable par l'administrateur
  seulement. Éteint : plus rien n'est créé ; rien n'est supprimé, et les rendez-vous déjà importés suivent encore
  l'agenda. Sans Google configuré, la carte le dit : « Disponible quand Google est configuré ».
- **Robustesse** : une erreur sur un événement n'arrête pas les autres ni la lecture de l'agenda ; 40 créations et
  12 secondes au plus par compte et par passage, les appels à venir d'abord (le reste au passage suivant). Journal dans
  `marketing_source_runs` (source `google`) quand quelque chose change ou échoue ; le dernier import est résumé sous
  l'interrupteur pour l'administrateur : toujours les compteurs, puis le nombre d'erreurs (le texte brut reste dans
  le journal).
- **Vérification** : `pnpm dlx tsx scripts/google-calls-selfcheck.ts` (90 vérifications, hors ligne sur MemoryDb, qui
  tient aussi les index uniques des rendez-vous (source, identifiant) et des prospects (email)).
  L'import n'a pas été essayé contre Google ni contre la base réelle : Google n'est pas configuré en local.
