# Connexion Meta Ads et tableaux de bord clients

Le studio relie chaque client à son compte publicitaire Meta : les résultats (dépense, impressions, clics, thruplays 3 s, achats, chiffre d'affaires attribué) sont lus chaque nuit et alimentent **Performance** (agence) et **Performance** (espace client). Les tableaux de bord externes (Looker Studio, Meta…) s'affichent en plein cadre dans Performance → client.

- Tableau de bord agence → carte **Connexions Meta Ads** (administrateurs à accès complet) : Connecter, Synchroniser, Changer de compte publicitaire, Reconnecter, Déconnecter.
- Performance → **Tableaux de bord clients** : une carte par client (KPI 30 j, tendance du ROAS, outil relié) → page du client (`/studio/performance?client=<id>`) avec le tableau de bord externe, « Ouvrir dans un nouvel onglet » et « Modifier l'URL ».

## 1. Créer l'app Meta (10 min)

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Créer une app** → cas d'usage **Autre** → type **Entreprise** (Business). Rattache-la au Business Manager icon-flow.
2. Dans l'app, ajoute le produit **Facebook Login for Business** (ou Facebook Login) → *Paramètres* :
   - **URI de redirection OAuth valides** : `https://studio.icon-flow.fr/api/integrations/meta/callback` (ajoute aussi l'URL de prévisualisation Vercel et `http://localhost:3000/api/integrations/meta/callback` en local).
   - *Connexion OAuth client* et *Connexion OAuth web* activées.
3. Ajoute le produit **Marketing API**. Dans *Autorisations et fonctionnalités* (App Review), demande l'accès **avancé** à `ads_read` et `business_management` ; tant que l'app est en mode développement, seuls les comptes ayant un rôle sur l'app (Rôles de l'app → Administrateurs / Développeurs / Testeurs) peuvent se connecter — suffisant pour l'agence.
4. *Paramètres → Général* : copie **ID de l'app** et **Clé secrète**. Renseigne le domaine de l'app (`studio.icon-flow.fr`) et l'URL de la politique de confidentialité (exigée par Meta).

Le compte Meta qui se connecte depuis le studio doit avoir un rôle (au moins *Analyste*) sur le compte publicitaire de chaque client, via le Business Manager du client ou le nôtre.

## 2. Variables d'environnement (hébergeur, jamais dans Git)

| Variable | Rôle |
|---|---|
| `META_APP_ID` | ID de l'app Meta |
| `META_APP_SECRET` | Clé secrète de l'app — signe aussi l'état OAuth (HMAC) ; serveur uniquement |
| `META_REDIRECT_URL` | facultatif — URL de retour exacte si elle diffère de `NEXT_PUBLIC_APP_URL` + `/api/integrations/meta/callback` |
| `META_GRAPH_VERSION` | facultatif — version de la Marketing API (défaut `v21.0`) |
| `CRON_SECRET` | secret long aléatoire ; Vercel l'envoie en `Authorization: Bearer …` à chaque exécution du cron |
| `SUPABASE_SERVICE_ROLE_KEY` | déjà requise pour les invitations ; la synchronisation planifiée lit les jetons avec cette clé |
| `NEXT_PUBLIC_APP_URL` | origine publique du studio (URL de retour par défaut, vérification des cadres) |

Sans `META_APP_ID` / `META_APP_SECRET`, la carte « Connexions Meta Ads » explique quoi faire et aucun bouton n'appelle Meta. Les autres fonctions (saisie manuelle, tableaux de bord externes) restent disponibles.

## 3. Parcours de connexion

1. `GET /api/integrations/meta/connect?client=<id>` — session d'administrateur à accès complet exigée. Pose un **état signé** (client, compte, horodatage ; HMAC-SHA256 avec `META_APP_SECRET`) doublé d'un cookie httpOnly de 10 minutes, puis redirige vers `https://www.facebook.com/<version>/dialog/oauth` avec `scope=ads_read,business_management`.
2. `GET /api/integrations/meta/callback` — vérifie l'état (signature, fraîcheur, égalité avec le cookie, même administrateur), échange le `code` contre un jeton, puis contre un **jeton longue durée** (`fb_exchange_token`, ≈ 60 jours), lit `/me/adaccounts?fields=name,account_id,currency`, enregistre l'intégration avec le **premier compte** (`saveIntegration`, RLS : administrateurs) et lance une première lecture. Retour sur `/studio?meta=ok&client=<id>[&comptes=N]` ; si plusieurs comptes sont visibles, le menu **⋯ → Changer de compte publicitaire** propose la liste. Erreurs : `/studio?meta=erreur=<raison>` (`annule`, `etat`, `jeton`, `compte`, `droits`, `config`…).
3. Le jeton n'apparaît jamais dans une URL, un journal ou une réponse au navigateur : il est envoyé à Meta en en-tête `Authorization` et lu en base uniquement côté serveur (`integrationToken`, clé service pour le cron).

## 4. Synchronisation

- **Lecture** : `GET /act_<account_id>/insights?fields=spend,impressions,clicks,actions,action_values,video_thruplay_watched_actions&level=account&time_increment=7&time_range={since,until}`. La fenêtre couvre **13 semaines alignées sur les lundis** (semaine en cours comprise, ≈ 90 jours) : chaque ligne Meta correspond donc exactement à une semaine du lundi au dimanche. La pagination est suivie.
- **Conversion** (`src/lib/integrations/meta-mapping.ts`, fonctions pures) : `thruplays_3s` = somme de `video_thruplay_watched_actions` ; `purchases` / `revenue` = `omni_purchase`, sinon `purchase`, sinon `offsite_conversion.fb_pixel_purchase` (un seul type retenu, jamais additionnés : Meta répète le même achat sous plusieurs noms). Montants dans la devise du compte publicitaire (comptes en euros attendus).
- **Écriture** : une métrique « compte entier » (`livrable_id` nul) par lundi, remplacée à chaque passage (`upsertMetric`) ; `last_sync_at` et `last_error` tenus à jour sur l'intégration. Les saisies manuelles par créative ne sont pas touchées.
- **À la demande** : bouton **Synchroniser** (action `syncMetaInsights`, administrateur).
- **Chaque nuit** : `vercel.json` déclare le cron `17 5 * * *` sur `/api/integrations/meta/sync`. La route exige `Authorization: Bearer <CRON_SECRET>` (ajouté par Vercel), synchronise toutes les intégrations avec la clé service et répond `{ total, synced, failed, results }`. Sans `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` ou app Meta, elle répond **503** avec la variable manquante. Un jeton expiré est signalé sur la carte (« Connexion expirée ») : **Reconnecter** suffit.

Test manuel du cron : `curl -H "Authorization: Bearer $CRON_SECRET" https://studio.icon-flow.fr/api/integrations/meta/sync`.

## 5. Tableaux de bord externes

- Performance → client → **Relier un tableau de bord** / **Modifier l'URL** (membres ayant Clients ou Pipeline, comme la fiche client). L'URL est enregistrée sur la fiche client (`clients.dashboard_url`).
- **Looker Studio** : Fichier → *Intégrer le rapport* → copier l'URL. Un lien de rapport classique (`/reporting/…`) est converti automatiquement en lien intégrable (`/embed/reporting/…`) ; le rapport doit être partagé en lecture (lien ou domaine).
- Le cadre est servi avec `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` et `referrerpolicy="strict-origin-when-cross-origin"`. Avant l'affichage, le serveur lit les en-têtes de la cible (`X-Frame-Options`, `Content-Security-Policy: frame-ancestors`) : si le site refuse l'intégration (c'est le cas de Meta Ads Manager), un message le dit et propose « Ouvrir dans un nouvel onglet ».

## 6. Tests

```bash
node --experimental-strip-types --test src/lib/integrations/meta-mapping.test.mjs
```

Couvre la conversion insights → métriques (fixture `src/lib/integrations/__fixtures__/meta-insights.json`), les lundis, la fenêtre de 13 semaines, les URL Graph, l'état OAuth signé (falsification, expiration, cookie), les messages d'erreur et la normalisation des URL de tableau de bord. Aucun appel réseau.

## Dépannage

- **« Le lien de retour n'est plus valide »** : plus de 10 minutes entre Connecter et le retour, ou cookies bloqués sur le domaine du studio. Relance depuis la carte.
- **« Impossible d'obtenir le jeton »** : `META_APP_SECRET` erroné, ou URI de redirection non déclarée à l'identique dans l'app Meta (schéma, domaine, chemin).
- **« Aucun compte publicitaire visible »** : le compte Meta connecté n'a pas de rôle sur le compte publicitaire du client ; ajoute-le dans le Business Manager puis **Reconnecter**.
- **« Meta refuse l'accès » à la synchronisation** : l'app n'a pas l'accès avancé à `ads_read` (ou le compte connecté n'est plus analyste du compte publicitaire).
- **Cron en 503** : lis le message — il nomme la variable manquante.
