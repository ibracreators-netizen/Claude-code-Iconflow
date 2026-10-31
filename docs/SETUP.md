# Mise en production — Iconflow Studio

Ce guide part du projet Supabase existant (`xqacgjtlktzrmfcolbst`) qui contient déjà vos clients et données. Aucune étape ne supprime ou ne renomme une table existante.

## 1. Base de données (10 min)

**Avant tout, vérifier où en est la base** (SQL Editor → New query, coller, Run) :

```sql
select to_regclass('public.tasks') as tables_0002,
       (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('permissions','disabled_at','invited_by')) as colonnes_0004,
       to_regprocedure('public.my_has_module(text)') as fonctions_0005,
       to_regclass('public.pipeline_stages') as tables_0006,
       (select string_agg(id, ',') from storage.buckets where id in ('studio','avatars')) as buckets;
```

Résultat attendu quand tout est appliqué : `tables_0002 = tasks`, `colonnes_0004 = 3`, `fonctions_0005 = my_has_module(text)`, `tables_0006 = pipeline_stages`, `buckets = studio,avatars`. Une valeur vide indique la migration à exécuter.

Règles d'exécution dans le **SQL Editor** : un fichier à la fois, **collé en entier**, **sans texte sélectionné** dans l'éditeur au moment de Run (sinon seule la sélection s'exécute). Un fichier s'applique tout ou rien : si le bandeau affiche une erreur, rien de ce fichier n'a été appliqué, corrige puis relance-le. Après le dernier fichier, attends une dizaine de secondes (Supabase recharge son cache de schéma) puis recharge l'app ; si une table reste « introuvable », exécute `notify pgrst, 'reload schema';`.

Sur le projet existant, **commence à 0002** : `0001_baseline.sql` ne fait rien (il recrée le schéma legacy seulement sur un projet vide). Exécutez **dans l'ordre** :

1. `supabase/migrations/0001_baseline.sql` — idempotent. Sur votre projet existant, il ne crée rien de nouveau (tables, politiques et fonctions déjà présentes sont conservées). Sur un projet vide, il recrée le schéma legacy.
2. `supabase/migrations/0002_studio_v2.sql` — ajoute les colonnes et tables v2 (contacts, tâches, documents, fichiers, factures, messages, activité, planning, métriques, Brain agence), le bucket Storage `studio`, les triggers et les RPC `transition_livrable`, `agency_transition_brief`, `next_invoice_number`.
3. `supabase/migrations/0003_avatars.sql` — bucket public `avatars` pour les photos de profil (chaque compte n'écrit que dans son dossier).
4. `supabase/migrations/0004_team.sql` — équipe & accès : droits par module (`profiles.permissions`), retrait d'accès (`profiles.disabled_at`), invitations (`invited_by`).
5. `supabase/migrations/0005_access_rls.sql` — les droits par module et le retrait d'accès sont appliqués **par la base elle-même** (RLS) : un membre limité à « Livrables » ne lit ni n'écrit les factures même en appelant l'API Supabase directement ; un compte retiré perd tout accès immédiatement ; seul un administrateur à accès complet peut modifier un autre administrateur ; il reste toujours au moins un administrateur ; le journal d'activité est signé par son auteur et infalsifiable ; le trigger de profil ne fait plus confiance aux métadonnées d'inscription ; les statuts client incohérents avec l'étape du pipeline sont corrigés.
6. `supabase/migrations/0006_product.sql` — étapes de pipeline personnalisables, briefs à plusieurs concepts (le contenu existant devient le premier concept), livrables en batch, lien sur les événements du planning, dossiers de la bibliothèque de documents, URL de tableau de bord par client, intégrations (Meta Ads, jetons réservés aux administrateurs), suppression définitive d'un client.

Vérification rapide :

```sql
select table_name from information_schema.tables where table_schema='public' order by 1;
select id, name, public from storage.buckets where id in ('studio','avatars');
```

> Tous les scripts peuvent être relancés sans risque (idempotents) et dans n'importe quel ordre une fois 0005 passée : un ancien script ne recrée jamais une politique ni une fonction remplacée par un plus récent (vérifié par `supabase/tests/replay.sql`). Les migrations 0002 à 0006 sont toutes nécessaires : l'application suppose les tables de 0002, les colonnes de 0004, les politiques de 0005 et les tables de 0006.

## 2. Comptes

Tout se gère depuis **Équipe & accès** dans le studio : inviter un membre (avec les pages qu'il peut voir), inviter un client (rattaché à son espace), retirer ou rétablir un accès, renvoyer un lien de connexion, consulter l'historique de chaque compte. Les invitations et le renvoi de lien passent par l'API admin Supabase, donc par la variable serveur `SUPABASE_SERVICE_ROLE_KEY` (voir section 3). Sans elle, l'interface l'indique ; le reste (droits, retrait d'accès) fonctionne par la RLS du compte connecté.

- **Parcours d'un invité** : il reçoit l'email Supabase, clique sur le lien, arrive connecté sur `/bienvenue` et choisit un mot de passe (il peut aussi passer et se connecter plus tard par lien magique). Le mot de passe se change ensuite dans *Paramètres* (agence) ou *Mon compte* (client).

- **Redirect URLs (obligatoire)** : dans Supabase → **Authentication → URL Configuration**, ajoutez chaque URL de déploiement suivie de `/auth/callback` : `https://studio.iconflow.fr/auth/callback`, l'URL Vercel de prévisualisation (`https://<projet>.vercel.app/auth/callback`) et `http://localhost:3000/auth/callback` en local. Sans cela, les liens d'invitation et de connexion échouent (« Ce lien n'est plus valide »). `NEXT_PUBLIC_APP_URL` doit pointer vers l'URL où les invités doivent atterrir.

- **Deux niveaux de droits** : un membre en **accès complet** est administrateur (tous les modules, gestion de tous les comptes). Un membre **limité** ne voit que ses modules ; s'il a « Équipe & accès », il gère les comptes clients et les autres membres limités, ne donne que les modules qu'il possède, jamais l'accès complet, et ne touche pas aux administrateurs. Il reste toujours au moins un administrateur actif (protégé par la base).

- **Fondateur / admins historiques** : les emails listés dans `app_settings.admin_emails` (par défaut `ibracreators@gmail.com`, `ibra@iconflow.fr`) obtiennent automatiquement le rôle `agency` avec accès complet. Les comptes existants gardent leur profil tel quel, avec accès complet (`permissions` vide = tout). Pour ajouter un administrateur de départ : `update public.app_settings set value = value || '["nouvel@email"]' where key = 'admin_emails';`

- **Sécurité des inscriptions** : désactivez les inscriptions publiques dans Supabase → *Authentication → Providers → Email → Allow new users to sign up* (décoché). Le trigger ne tient de toute façon aucun compte des métadonnées d'une inscription (rôle, client) : un compte auto-inscrit est un client sans espace, donc sans accès.

- **Client (à la main, sans la clé service)** : Supabase → **Authentication → Users → Invite user**, puis rattachez le profil créé :

  ```sql
  update public.profiles set role='client', client_id='<uuid du client>' where id='<uuid auth>';
  ```

## 3. Variables d'environnement

| Variable | Où la trouver | Portée |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon / publishable key | publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | **serveur uniquement, jamais dans Git** — requise pour inviter des comptes et renvoyer des liens depuis le studio (le retrait d'accès fonctionne sans, par la RLS) |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app | publique |
| `ANTHROPIC_API_KEY` | console.anthropic.com | facultative, serveur — affine l'import Brain par Claude ; sans elle, lecture simple |
| `META_APP_ID` / `META_APP_SECRET` | developers.facebook.com → app → Marketing API | facultatives — connexion Meta Ads (secret côté serveur uniquement) |
| `CRON_SECRET` | valeur aléatoire que tu choisis | facultative — protège la synchro Meta planifiée (Vercel l'envoie en Bearer) ; voir [docs/features/meta-ads.md](features/meta-ads.md) |
| `RESEND_API_KEY` / `EMAIL_FROM` | resend.com → API Keys ; `EMAIL_FROM` avec un domaine vérifié | recommandées — le studio envoie lui-même invitations et liens de connexion ; sans elles, Supabase envoie (limité) ; voir [docs/features/emails.md](features/emails.md) |

Toutes les variables « facultatives » peuvent rester vides : la fonctionnalité concernée s'annonce alors comme non configurée, le reste de l'app marche. Le fichier `.env.example` sert de modèle. Le dépôt GitHub est public : ne commitez jamais un `.env`.

## 4. Déploiement Vercel (5 min)

1. Vercel → *Add New Project* → importer `ibracreators-netizen/Claude-code-Iconflow`, branche de production `main` (ou la branche de travail en preview).
2. Framework : Next.js (détecté). Build : `pnpm build`.
3. Ajouter les variables d'environnement ci-dessus.
4. *Domains* → ajouter `studio.iconflow.fr` et suivre l'instruction DNS (CNAME vers `cname.vercel-dns.com`). L'ancien site statique peut rester en ligne sur une autre URL le temps de la bascule.
5. **Région des fonctions** : `vercel.json` fixe `cdg1` (Paris) pour que le serveur soit à côté de la base. Vérifie la région de ton projet Supabase (Settings → General → Region) et aligne si besoin : `fra1` Francfort, `lhr1` Londres, `iad1` Virginie. Chaque page fait plusieurs allers-retours vers Supabase : à l'autre bout du monde, chacun coûte ~100 ms.

## 5. Storage (fichiers)

Le bucket privé `studio` est créé par la migration (limite 500 Mo par fichier). Les chemins suivent `clients/<client_id>/<dossier>/<fichier>` ; les clients ne voient que les fichiers marqués *partagés* et ne peuvent déposer que dans `clients/<leur id>/depot/`.

## 6. Recette

1. Connexion agence → `/studio` : tableau de bord, clients existants visibles.
2. Ouvrir un client → onglet Aperçu → modifier l'étape et une note agence (RPC `agency_save_client_management`).
3. Créer un brief vidéo, l'envoyer au contrôle Ibra, le proposer au client.
4. Connexion client → `/app/validations` → valider ou demander une correction (RPC `client_decide_script`).
5. Ajouter un livrable, le proposer au client, valider côté client (RPC `transition_livrable`).
6. Documents : créer, partager avec le client, vérifier la lecture côté client.
7. Fichiers : téléverser, partager, télécharger côté client.
8. Facture : créer, envoyer, marquer payée, imprimer.

## Dépannage

L'application se diagnostique elle-même : si la base n'est pas prête, l'espace affiche un écran **« Installation à terminer »** qui nomme l'objet manquant et la migration à exécuter, avec l'état de chaque étape. Le même état est visible dans **Paramètres → Connexion aux données**. Quand une autre erreur serveur survient, la page d'erreur affiche une **référence** (digest) à retrouver dans Vercel → Logs pour lire le message complet.


- **« Quelque chose s'est mal passé » / React error #441** : une requête serveur a échoué (le message est masqué en production). Regarde la référence affichée : `IF|table|…` ou `IF|function|…` = migration manquante ; `IF|network` = variables Supabase absentes ou projet en pause ; `IF|permission|…` = droit de table manquant (commande `grant` proposée à l'écran). Vercel → Logs donne toujours le message complet, sur une ligne `[iconflow] erreur de rendu` qui porte la route et la référence.
- **« Accès refusé pour ce compte »** : le profil n'a pas le bon rôle (`profiles.role`) ou pas de `client_id`.
- **Écran blanc après connexion** : vérifier `NEXT_PUBLIC_APP_URL` et les Redirect URLs Supabase.
- **Upload impossible** : le bucket `studio` n'existe pas (relancer `0002_studio_v2.sql`), le fichier dépasse 500 Mo, ou le membre n'a ni « Fichiers » ni « Livrables ».
- **« Ce lien n'est plus valide » après un email d'invitation** : l'URL de l'app n'est pas dans les Redirect URLs Supabase, ou le lien a déjà servi → « Renvoyer un lien de connexion » depuis la fiche du compte.
- **Un membre ne voit pas une page** : ouvrir sa fiche dans Équipe & accès et cocher le module. Les pages, les actions et la base appliquent la même liste.
- **« Il doit rester au moins un administrateur »** : rétablir ou nommer un autre administrateur à accès complet avant de retirer celui-ci.
