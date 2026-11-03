# Fonctionnalités — Iconflow Studio

Ce guide décrit ce que fait chaque module aujourd'hui, côté agence (`/studio`) et côté client (`/app`).
Pour l'installation et la mise en production, voir [SETUP.md](SETUP.md) ; pour l'architecture, [ARCHITECTURE.md](ARCHITECTURE.md).

## Clients et pipeline

- **Étapes modifiables** : le pipeline (`/studio/pipeline`) construit ses colonnes depuis la table `pipeline_stages`. Le bouton « Gérer les étapes » ouvre un volet pour ajouter (nom + couleur), renommer, recolorer, réordonner (souris ou clavier) et supprimer une étape en choisissant l'étape de remplacement. Les étapes réelles alimentent la liste des clients, la fiche client et les filtres.
- **Changement d'étape fiable** : une carte déposée sur une colonne ou sur une autre carte prend la colonne visée ; deux déplacements rapides de la même carte s'enchaînent sans erreur de révision ; en cas d'échec la carte revient et un message l'explique.
- **Archiver / restaurer / supprimer** : menu ⋯ sur chaque carte et sur la fiche client. La suppression définitive (administrateurs à accès complet seulement) demande de retaper le nom du client, efface toutes ses données (briefs, livrables, tâches, factures, fichiers…) et coupe l'accès de ses comptes ; le journal garde la trace « supprimé définitivement ».
- **Retour** : flèche « Retour aux clients » en haut de la fiche client.
- **Voir l'espace client** : entrée « œil » dans le menu ⋯ de la fiche. L'agence voit alors `/app` exactement comme le client (scripts en rédaction, documents et fichiers internes, factures brouillon et événements internes du journal retirés). Un bandeau le rappelle et « Quitter l'aperçu » ramène à la fiche. Toutes les actions côté client sont désactivées pendant l'aperçu.

## Briefs et scripts : plusieurs concepts par brief

- Un brief porte **un ou plusieurs concepts**, chacun une page : le volet gauche de `/studio/briefs/[id]` liste les concepts, numérotés, réordonnables par glisser-déposer (ou au clavier), renommables en ligne, supprimables (il en reste toujours un). « Nouveau concept » en ajoute autant qu'on veut.
- L'éditeur du concept sélectionné (`?concept=<id>`) garde la structure vidéo (angle, framework, concept, hooks, corps, CTA, acting) ou statique (référence, angle, texte) avec **enregistrement automatique** ; modifier un brief déjà soumis le ramène en rédaction.
- Flèche de retour vers la liste du mois + fil d'Ariane. Les cartes de la liste affichent le nombre de concepts.
- **Côté client**, tous les concepts s'affichent en sections numérotées avec navigation par ancres ; la décision (valider / demander des corrections) porte sur le brief entier et se trouve en bas.
- Sur mobile, le volet devient une bande horizontale de puces au-dessus de l'éditeur.
- **Organisation par client** : la liste des briefs a un volet de dossiers, un par client (avec le nombre de briefs), plus « Tous les clients ». Sélectionner un dossier filtre la liste.
- **Sélection en masse** : une case par carte ; la barre d'actions permet de mettre plusieurs briefs à la corbeille en une fois, puis, dans la corbeille, de les restaurer ou de les supprimer définitivement (confirmation).
- **Lien public partageable** : depuis un brief, « Partager » crée un lien `/b/<jeton>` lisible par quiconque l'a, sans compte (comme un document publié). La page publique montre les concepts et la marque, jamais les données internes (statut, historique, autres clients) ; « Retirer le lien » coupe l'accès aussitôt.

## Livrables en batch

- **Un livrable = un batch** : un seul lien (Frame, Drive, Dropbox…) pour toutes les vidéos ou tous les visuels livrés, plus la liste des éléments (nom · durée). Les cartes résument « 6 vidéos · 3:12 » ou « 4 visuels » ; la fiche affiche le bandeau du lien, « Ouvrir dans Frame » et la liste numérotée avec le total.
- Le volet « Nouveau batch » / « Modifier le batch » accepte une liste collée (« Hook 2 · 32 », « Hook 2 - 0:32 », « 3. Hook 2 »…) et la répartit en lignes ; Entrée ajoute une ligne, Retour arrière retire une ligne vide.
- **Côté client**, la fiche présente le contenu du batch et un seul bouton Frame ; la décision « Valider le batch » / « Demander des corrections » vaut pour l'ensemble. La page « À valider » affiche le badge « Batch » et le résumé.
- Frame.io refusant l'intégration en iframe, l'aperçu intégré n'apparaît que pour une vidéo directe ou un hôte intégrable.

## Avatars (casting)

- « Ajouter un avatar » (fiche client › Avatars, ou page Avatars) prend le portrait de trois façons : **Importer** (glisser-déposer, PNG/JPEG/WebP, 25 Mo max), **Dossier Avatars** (les images déjà rangées dans Fichiers › Avatars du client, en vignettes) ou **Lien** (HTTPS, comme avant).
- Une image importée est déposée dans Fichiers › Avatars du client (bucket privé `studio`), non partagée. Importée ou choisie, elle n'est **partagée avec le client** qu'une fois l'avatar créé (sinon la RLS du stockage la lui cache) et elle est **signée à chaque affichage pour 1 h** : aucun lien public permanent n'est créé. Sans le module Fichiers, seul le mode Lien est proposé.
- Pas de migration pour la fonction : `avatars.preview_url` contient soit un lien HTTPS, soit le chemin du fichier (`clients/<id>/avatars/…`), que le studio, l'espace client et le casting public transforment en lien signé (voir `src/lib/avatar-image.ts`). Le casting public, et l'espace d'un compte client tant que le correctif 0012 n'est pas passé, signent par la clé service, uniquement une image du dossier Avatars, enregistrée pour ce client et partagée avec lui.
- Brief vidéo, bloc « Éléments de référence » : le champ **Avatar** propose aussi **Choisir dans Fichiers › Avatars** (vignettes du dossier du client). Le concept garde le chemin du fichier, jamais un lien ; l'image est partagée avec le client au moment du choix, puis signée pour 1 h à chaque affichage : espace client et lien public du brief (clé service, mêmes garde-fous que le casting). Un chemin non signable n'est jamais affiché. Les liens HTTPS restent possibles (« Ajouter un lien »).

## Tâches

- **Étiquettes** en puces : Entrée, virgule ou Tab ajoute une étiquette, Retour arrière la retire ; suggestions des étiquettes existantes ; filtre par étiquette dans la liste.
- **Case « fait »** sur chaque carte (kanban et liste) pour terminer ou rouvrir une tâche d'un clic.
- Une tâche s'ouvre directement par `?task=<id>` (utilisé par le planning).

## Planning

- Chaque élément du calendrier est un **lien vers sa page** : brief, livrable, tâche ou fiche client. Un événement peut porter un lien (interne ou externe, ouvert dans un nouvel onglet) saisi dans « Lien ouvert au clic ».
- Les échéances de tâches apparaissent dans le calendrier.

## Documents : bibliothèque en dossiers

- Volet gauche : « Tous les documents », « Non classés », puis les **dossiers principaux dépliables avec leurs sous-dossiers** et leurs compteurs ; sur mobile, une barre repliable affiche le dossier courant.
- Dans un dossier : fil d'Ariane cliquable, cartes des sous-dossiers, puis les documents ; la recherche fouille aussi les sous-dossiers. L'URL porte l'état (`?folder=<id>`, `?folder=non-classes`) et conserve les filtres client / type / recherche.
- Actions : nouveau dossier ou sous-dossier, renommer, déplacer vers… (arborescence, destinations interdites grisées), supprimer (les sous-dossiers partent, les documents sont seulement détachés). Chaque document : ouvrir, déplacer, retirer du dossier ; « Nouveau document » présélectionne le dossier courant ; l'éditeur montre et permet de changer le dossier.

## Équipe, accès et sécurité

- Invitations, droits par module, retrait d'accès et historique par compte : voir [SETUP.md](SETUP.md) (§ Comptes). Les droits sont appliqués dans l'interface, dans les actions serveur **et par la base** (politiques RLS, migration 0005).
- Photo de profil : recadrée en carré côté navigateur, stockée dans le bucket public `avatars` (migration 0003). Si la base n'autorise pas encore la modification des profils ou si le bucket manque, le message nomme la migration à lancer.
- Le journal d'activité ne montre jamais au client les événements internes de l'agence (changements d'étape du pipeline, tâches, notes).
- L'identité vérifiée par le proxy est transmise au rendu serveur, mais n'est crue que si elle correspond au jeton de session du cookie ; le proxy traite toute URL de page.

## Mobile

- Le tiroir de navigation n'affiche que le panneau clair ; aucune page ne déborde horizontalement à 390 px (audit automatique sur 42 pages) ; l'en-tête reste visible au défilement.

## Auto-diagnostic

- Si la base n'est pas à jour (table, colonne, fonction ou bucket absents), l'application affiche l'écran « Installation à terminer » qui nomme la migration à lancer, au lieu d'une erreur générique. La page Paramètres liste l'état de chaque migration et des variables d'environnement optionnelles.

## Brain : import depuis le site de la marque + cerveau 3D

- **Importer depuis un site** (Brain d'un client) : on colle l'URL, l'app lit la page d'accueil puis jusqu'à 4 pages utiles (à propos, produits, FAQ, avis ; catalogue Shopify si présent) et en extrait l'identité, les produits et prix, les références, les réseaux et des images, rangés en fiches « fait » ou « allégation ». Une proposition de dossier (promesse, ton détecté, personas, concurrents) s'applique en un clic ou s'ignore. Garde anti-SSRF (adresses locales/privées refusées), délai et taille plafonnés. Avec une clé `ANTHROPIC_API_KEY`, la structuration est affinée par Claude ; sans clé, lecture simple annoncée dans l'interface.
- **Cerveau 3D** : visuel de particules animé (canvas, clair et sombre), côté agence et côté client.

## Performance & tableaux de bord clients, Meta Ads

- **Connexion Meta Ads officielle** (administrateurs à accès complet) : OAuth Facebook Login for Business, jeton longue durée côté serveur (jamais exposé au navigateur), état signé HMAC. La carte « Connexions Meta Ads » du tableau de bord permet de connecter, synchroniser, changer de compte, reconnecter, déconnecter. Sans app Meta configurée, une explication et un lien vers le guide s'affichent au lieu d'un bouton.
- **Synchronisation** : à la demande, et planifiée chaque nuit par un cron Vercel protégé par `CRON_SECRET` ; les insights Meta deviennent des métriques hebdomadaires (semaine du lundi, achats sans double comptage).
- **Tableaux de bord clients** : la page Performance liste les clients en cartes (KPI 30 jours + tendance) ; ouvrir un client affiche ses métriques et son tableau de bord externe (Looker Studio…) en plein cadre (URL reliée depuis la fiche client, adresses non-HTTPS refusées).
- Détails de mise en place : voir [docs/features/meta-ads.md](features/meta-ads.md).

## Emails : invitations et liens de connexion fiables

- Avec `RESEND_API_KEY` + `EMAIL_FROM` (domaine vérifié), le studio envoie lui-même ses emails : invitation d'un membre, accès d'un client, lien de connexion, aux couleurs d'Iconflow. Sans Resend, Supabase continue d'envoyer (service par défaut très limité : environ 2 emails/heure, membres du projet seulement — d'où les invitations qui « buguaient »).
- Sur `/login`, un email inconnu reçoit un message clair (« Aucun compte avec cet email. Demande une invitation à l'équipe icon-flow. ») au lieu d'un échec silencieux ; le lien de connexion n'est jamais créé pour un inconnu.
- Si un compte est créé mais que l'email ne part pas, le message le dit et invite à renvoyer un lien depuis la fiche du membre. La carte « Emails » de Paramètres montre l'état de la configuration et permet un envoi de test.
- Détails de mise en place (Resend, domaine, Redirect URLs Supabase) : voir [docs/features/emails.md](features/emails.md).

## Ibra Group : deux espaces

L'app est le conteneur **Ibra Group**. Un commutateur dans la barre latérale (et l'écran `/hub`) ouvre l'un des deux espaces, selon les droits du membre :

- **IconFlow Studio** — l'application actuelle (clients, briefs, livrables, Brain, documents, facturation…), inchangée.
- **IconFlow Marketing** — l'acquisition de l'agence : prospects, calendrier de réservation, relances et données marketing.

Les deux espaces partagent le même compte et le même design. Les droits sont indépendants : *Équipe & accès* peut accorder Marketing sans Studio, et inversement. Le détail technique est dans [docs/features/marketing.md](features/marketing.md).

### IconFlow Marketing (MVP)

- **Prospects** : liste (recherche, filtre par statut), fiche, ajout manuel. Déduplication par email. Endpoint d'opt-in prêt pour un webhook (aucune source branchée pour l'instant).
- **Calendrier** : rendez-vous confirmés à venir, réservation depuis une fiche prospect. Disponibilités entièrement configurables (rien par défaut), créneaux calculés dans le fuseau choisi et stockés en UTC. Deux réservations du même créneau ne peuvent pas aboutir toutes les deux (contrainte base). Page publique de réservation `/reserver`, désactivée par défaut.
- **Relances & rappels** : file d'emails (rappels de RDV, relances d'opt-in) en **mode simulation (DRY RUN) par défaut** — rien n'est envoyé, tout est enregistré et visible. L'envoi réel s'active dans les réglages, après vérification ; lien de désinscription dans les relances.
- **Données marketing** : seulement des chiffres réels et sourcés (source + fraîcheur par carte) ; la publicité s'affiche « non connecté » tant qu'aucune source n'est reliée. Aucun chiffre inventé.
