# Tests SQL (RLS + RPC)

Trois fichiers, chacun dans une transaction annulée à la fin (`rollback`) :

- `rls.sql` — périmètres agence / client et RPC (ci-dessous) ;
- `team.sql` — migration 0004 : trigger de profil (aucune métadonnée de confiance), gestion des profils, rôle verrouillé ;
- `access.sql` — migration 0005 : droits par module appliqués par la RLS, compte retiré coupé, module Équipe borné, dernier administrateur protégé, journal signé, rattrapage des statuts client.

`rls.sql` vérifie :

- profil automatique (email admin ⇒ `agency`),
- circuit des briefs côté agence (vidéo et statique) et interdiction de valider à la place du client,
- circuit des livrables, classement agence (compare-and-swap),
- périmètre client : ne voit que son espace, pas les fiches Brain, documents non partagés, brouillons de facture, tâches ni Brain agence ; décide via `client_decide_script` et `transition_livrable` ; écrit messages et dépôt de fichiers uniquement,
- isolation entre clients, accès anonyme vide.

## En local (PostgreSQL 16)

```bash
createdb iconflow
psql -d iconflow -c "create extension if not exists pgcrypto" -f supabase/tests/local-shim.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/migrations/0001_baseline.sql -f supabase/migrations/0002_studio_v2.sql -f supabase/migrations/0003_avatars.sql -f supabase/migrations/0004_team.sql -f supabase/migrations/0005_access_rls.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/tests/team.sql
psql -d iconflow -v ON_ERROR_STOP=1 -f supabase/tests/access.sql   # lancé depuis la racine du dépôt (il relance la migration 0005)
```

`local-shim.sql` imite le strict nécessaire de Supabase (`auth.users`, `auth.uid()`, `storage.*`, rôles). Sur un vrai projet Supabase, `rls.sql` et `team.sql` se lancent tels quels dans le SQL Editor : ils se terminent par `rollback`, aucune donnée n'est conservée (`access.sql` inclut la migration par `\i`, réservé à psql).
