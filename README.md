# Iconflow Studio

Plateforme interne d'**icon-flow.fr** : espace agence + espace client, au même endroit.

- **Espace agence** (`/studio`) : tableau de bord, clients & pipeline, briefs & scripts (contrôle Ibra), livrables & validations, tâches, planning, performance (Hook Rate · CTR · CPA · ROAS), Brain client + Brain agence, documents (remplace Notion / Docs / Craft), fichiers (remplace Drive), facturation, équipe.
- **Espace client** (`/app`) : vue d'ensemble, éléments à valider, Brain, briefs, livrables, avatars, performance, documents partagés, fichiers, factures, messagerie, compte.

## Stack

Next.js 16 (App Router, React 19) · TypeScript · Tailwind CSS v4 · Supabase (Auth, Postgres + RLS, Storage) · TipTap · dnd-kit · Recharts.

## Démarrer

```bash
pnpm install
cp .env.example .env.local   # renseigner les clés Supabase (sinon : mode démo)
pnpm dev
```

Sans variables Supabase, l'app démarre en **mode démo** (données fictives en mémoire) : pratique pour explorer l'interface. Avec Supabase configuré, la RLS reste l'autorité sur chaque donnée.

## Déploiement et base de données

Voir [docs/SETUP.md](docs/SETUP.md) (migrations, comptes, Vercel, domaine) et [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` | serveur de développement |
| `pnpm build` / `pnpm start` | build & serveur de production |
| `pnpm typecheck` | vérification TypeScript |
| `pnpm lint` | ESLint |

## Historique

La version précédente (site statique « ChatGPT Sites », v39) est conservée sur la branche `legacy/studio` pour référence. Son schéma Supabase est repris tel quel et étendu par `supabase/migrations/0002_studio_v2.sql`.


> Aperçu : variables Supabase (URL + clé publishable) configurées sur l'environnement **Preview** du projet Vercel — connexion à la base réelle (RLS active). Voir docs/SETUP.md.
