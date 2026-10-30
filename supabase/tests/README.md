# Tests SQL (RLS + RPC)

`rls.sql` vérifie, dans une transaction annulée à la fin :

- profil automatique (email admin ⇒ `agency`),
- circuit des briefs côté agence (vidéo et statique) et interdiction de valider à la place du client,
- circuit des livrables, classement agence (compare-and-swap),
- périmètre client : ne voit que son espace, pas les fiches Brain, documents non partagés, brouillons de facture, tâches ni Brain agence ; décide via `client_decide_script` et `transition_livrable` ; écrit messages et dépôt de fichiers uniquement,
- isolation entre clients, accès anonyme vide.

## En local (PostgreSQL 16)

```bash
createdb iconflow
psql -d iconflow -c "create extension if not exists pgcrypto" -f supabase/tests/local-shim.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/migrations/0001_baseline.sql -f supabase/migrations/0002_studio_v2.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

`local-shim.sql` imite le strict nécessaire de Supabase (`auth.users`, `auth.uid()`, `storage.*`, rôles). Sur un vrai projet Supabase, lancez uniquement `rls.sql` dans le SQL Editor : il se termine par `rollback`, aucune donnée n'est conservée.
