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

## Livrables en batch

- **Un livrable = un batch** : un seul lien (Frame, Drive, Dropbox…) pour toutes les vidéos ou tous les visuels livrés, plus la liste des éléments (nom · durée). Les cartes résument « 6 vidéos · 3:12 » ou « 4 visuels » ; la fiche affiche le bandeau du lien, « Ouvrir dans Frame » et la liste numérotée avec le total.
- Le volet « Nouveau batch » / « Modifier le batch » accepte une liste collée (« Hook 2 · 32 », « Hook 2 - 0:32 », « 3. Hook 2 »…) et la répartit en lignes ; Entrée ajoute une ligne, Retour arrière retire une ligne vide.
- **Côté client**, la fiche présente le contenu du batch et un seul bouton Frame ; la décision « Valider le batch » / « Demander des corrections » vaut pour l'ensemble. La page « À valider » affiche le badge « Batch » et le résumé.
- Frame.io refusant l'intégration en iframe, l'aperçu intégré n'apparaît que pour une vidéo directe ou un hôte intégrable.

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
