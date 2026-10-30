# Architecture

## Principes

1. **Supabase est la source de vérité.** La RLS autorise chaque lecture et écriture ; les transitions métier passent par des RPC atomiques. L'interface ne fait jamais autorité.
2. **Compatibilité ascendante.** Les tables legacy (clients, profiles, briefs, livrables, validations, avatars, brand_dossiers, brain_entries, agency_client_management…) sont conservées à l'identique ; la v2 n'ajoute que des colonnes et des tables.
3. **Un seul contrat de données.** `src/lib/data/store.ts` décrit toutes les opérations. Deux implémentations : `SupabaseStore` (production) et `DemoStore` (mémoire, pour explorer sans backend). Les pages ne connaissent que le contrat.
4. **Server Components + Server Actions.** Les pages lisent via `getStore()` ; les mutations passent par `src/lib/actions/*` qui renvoient toujours `{ ok, data | error }` avec un message français (`humanError`).

## Arborescence

```
src/
  app/
    login/                   connexion (mot de passe, lien magique, démo)
    auth/callback, signout   échange OTP, déconnexion
    (studio)/studio/…        espace agence
    (portal)/app/…           espace client
    (print)/print/…          vues imprimables (factures)
  components/
    ui/                      primitives (bouton, champ, badge, carte, dialogue…)
    shared/                  statuts, graphiques, timeline, navigation mensuelle
    layout/                  shell (sidebar, topbar, palette ⌘K), navigation
  lib/
    data/                    types, contrat, implémentations, données démo
    actions/                 server actions par module
    auth/session.ts          session + garde de rôle (requireAgency / requireClient)
    supabase/                clients serveur / navigateur / proxy
  proxy.ts                   garde de routes (Next 16)
supabase/
  migrations/0001_baseline.sql   schéma legacy idempotent
  migrations/0002_studio_v2.sql  extension v2
  migrations/0003_avatars.sql    bucket public des photos de profil
  migrations/0004_team.sql       droits par module, retrait d'accès, invitations
  legacy/                        dump prod 2026-10-30 + propositions historiques
```

## Droits par membre (espace agence)

`profiles.permissions` : `null` = accès complet ; sinon la liste des modules autorisés (`src/lib/permissions.ts`). La garde est appliquée trois fois : navigation filtrée dans le shell, `requireAgency("<module>")` dans chaque page, `getStoreFor("<module>")` dans chaque server action. `profiles.disabled_at` coupe la session (et bannit le compte Auth quand la clé service est disponible).

## Rôles et périmètres

| Rôle | Lecture | Écriture |
|---|---|---|
| `agency` | tout | tout (RLS `my_role()='agency'`) |
| `client` | son client, briefs non « rédaction », livrables, validations, avatars, dossier de marque, documents/fichiers partagés, factures non brouillon, messages, activité, événements non internes, métriques | décisions (RPC), choix d'avatar, dossier de marque, messages, dépôt de fichiers (`Dépôt client`) |

## Circuits métier (inchangés depuis le legacy)

- **Brief vidéo** : rédaction → contrôle Ibra (`attente_ibra`) → attente client → validé. Correction client = retour en rédaction + `script_version + 1`. Toute modification de contenu d'un brief soumis le remet en rédaction.
- **Brief statique** : rédaction → contrôle Ibra → validé (Ibra seul).
- **Livrable** : contrôle agence → attente client → validé / correction demandée → (re)proposé au client.
- Chaque décision client est tracée dans `validations` (`item_kind` script / rushs / crea).

## Design system

Tokens dans `src/app/globals.css` (Tailwind v4 `@theme`) : vert Iconflow `#5BE683`, surfaces sombres/claires, rayons 8–22 px, ombres douces, police Geist. Les graphiques utilisent une palette catégorielle validée (contraste + daltonisme) par surface.

## Montée en charge

- Requêtes scopées et indexées (client_id, mois, statut, position).
- Rendu serveur par requête, pas d'état global ; sessions Supabase rafraîchies dans `proxy.ts`.
- Fichiers volumineux directement du navigateur vers Storage (pas de transit serveur).
- Prêt pour Vercel Edge/Node ; pas de dépendance à un processus long.
