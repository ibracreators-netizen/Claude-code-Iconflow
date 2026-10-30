# Mise en production — Iconflow Studio

Ce guide part du projet Supabase existant (`xqacgjtlktzrmfcolbst`) qui contient déjà vos clients et données. Aucune étape ne supprime ou ne renomme une table existante.

## 1. Base de données (10 min)

Dans le dashboard Supabase → **SQL Editor** → *New query*, exécutez **dans l'ordre** :

1. `supabase/migrations/0001_baseline.sql` — idempotent. Sur votre projet existant, il ne crée rien de nouveau (tables, politiques et fonctions déjà présentes sont conservées). Sur un projet vide, il recrée le schéma legacy.
2. `supabase/migrations/0002_studio_v2.sql` — ajoute les colonnes et tables v2 (contacts, tâches, documents, fichiers, factures, messages, activité, planning, métriques, Brain agence), le bucket Storage `studio`, les triggers et les RPC `transition_livrable`, `agency_transition_brief`, `next_invoice_number`.
3. `supabase/migrations/0003_avatars.sql` — bucket public `avatars` pour les photos de profil (chaque compte n'écrit que dans son dossier).

Vérification rapide :

```sql
select table_name from information_schema.tables where table_schema='public' order by 1;
select id, name, public from storage.buckets where id in ('studio','avatars');
```

> Les deux scripts peuvent être relancés sans risque (tout est protégé par `if not exists`).

## 2. Comptes

- **Agence** : les emails listés dans `app_settings.admin_emails` (par défaut `ibracreators@gmail.com`, `ibra@iconflow.fr`) obtiennent automatiquement le rôle `agency` à la création de leur compte Auth. Pour ajouter un membre d'équipe :

  ```sql
  update public.app_settings
  set value = value || '["prenom@icon-flow.fr"]'::jsonb
  where key = 'admin_emails';
  ```

  Les comptes existants gardent leur profil tel quel (`profiles.role`).

- **Client** : Supabase → **Authentication → Users → Invite user**. Dans *User Metadata*, renseignez `{"client_id": "<uuid du client>", "full_name": "Prénom Nom"}`. Le trigger `handle_new_user` crée le profil `client` rattaché à son espace. Pour un compte client déjà existant sans rattachement :

  ```sql
  update public.profiles set role='client', client_id='<uuid du client>' where id='<uuid auth>';
  ```

- **Mot de passe ou lien magique** : les deux fonctionnent. Pour le lien magique, ajoutez l'URL de l'app dans **Authentication → URL Configuration → Redirect URLs** : `https://studio.iconflow.fr/auth/callback` (et `http://localhost:3000/auth/callback` en local).

## 3. Variables d'environnement

| Variable | Où la trouver | Portée |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon / publishable key | publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | **serveur uniquement, jamais dans Git** |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app | publique |

Le fichier `.env.example` sert de modèle. Le dépôt GitHub est public : ne commitez jamais un `.env`.

## 4. Déploiement Vercel (5 min)

1. Vercel → *Add New Project* → importer `ibracreators-netizen/Claude-code-Iconflow`, branche de production `main` (ou la branche de travail en preview).
2. Framework : Next.js (détecté). Build : `pnpm build`.
3. Ajouter les variables d'environnement ci-dessus.
4. *Domains* → ajouter `studio.iconflow.fr` et suivre l'instruction DNS (CNAME vers `cname.vercel-dns.com`). L'ancien site statique peut rester en ligne sur une autre URL le temps de la bascule.

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

- **« Accès refusé pour ce compte »** : le profil n'a pas le bon rôle (`profiles.role`) ou pas de `client_id`.
- **Écran blanc après connexion** : vérifier `NEXT_PUBLIC_APP_URL` et les Redirect URLs Supabase.
- **Upload impossible** : le bucket `studio` n'existe pas (relancer `0002_studio_v2.sql`) ou le fichier dépasse 500 Mo.
