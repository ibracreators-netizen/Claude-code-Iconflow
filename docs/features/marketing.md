# IconFlow Marketing — espace d'acquisition de l'agence

Deuxième espace de l'app, sous le conteneur **Ibra Group**, indépendant d'IconFlow Studio.
Même design, mêmes composants. Studio n'est pas modifié dans son fonctionnement ni ses données.

## Accès et indépendance des droits

- Nouveaux modules dans `profiles.permissions` : `marketing_dashboard`, `marketing_prospects`,
  `marketing_calendrier`, `marketing_relances`, `marketing_reglages`. Accordés dans **Équipe & accès**
  (groupés par espace). Un membre peut recevoir Marketing sans Studio, et inversement.
- **Indépendance réelle** : les tables Marketing ont des policies RLS gardées par le droit AU MODULE
  (`my_has_module('marketing_…')` / `my_has_marketing()`), pas seulement `my_role()='agency'`. Un membre
  agence sans module Marketing ne lit ni n'écrit ces données, même par requête API directe
  (prouvé par `supabase/tests/marketing.sql`). Pages via `requireMarketing(module)`, actions via
  `getMarketingStoreFor(module)`.
- Commutateur « Ibra Group » dans le shell (Studio ↔ Marketing) + écran `/hub`. Le commutateur
  n'apparaît que pour les membres ayant accès à Marketing : un membre Studio ne voit aucun changement.

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

## Calendrier

- Disponibilités **entièrement configurables** (jours, plages, durée, fuseau d'affichage, délai minimum) dans
  les réglages. **Aucune valeur n'est présupposée** : sans configuration, aucun créneau n'est proposé.
- Créneaux calculés dans le fuseau configuré (changement d'heure géré), stockés en UTC
  (`src/lib/marketing/slots.ts`, testé sur une bascule DST).

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

### Traitement à la minute (à brancher, non activé)

Sur Vercel Hobby, les crons ne tournent qu'une fois par jour : insuffisant pour des rappels à l'heure près.
Prévoir l'appel de `/api/marketing/emails/run` (Bearer `CRON_SECRET`) à la minute par **pg_cron** (ou une Edge
Function Supabase planifiée), ou un scheduler externe. Non activé dans cette itération.

## Flux publics (points d'extension, non branchés)

- `POST /api/marketing/optin` — opt-in (webhook), secret partagé `MARKETING_OPTIN_SECRET`, validation zod,
  déduplication par email, limitation de débit. Aucune source n'est branchée (formulaire actuel à relier plus tard).
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

Uniquement des données réelles et sourcées (chaque carte indique sa source et sa fraîcheur). Agrégations
calculées par le magasin (`src/lib/marketing/aggregate.ts`, fonction pure partagée), rendues avec
`src/components/shared/charts.tsx` (Recharts, palette validée) :

- **Opt-ins dans le temps** (aires, par jour, période 30 / 90 jours).
- **Entonnoir par cohorte, sans tromperie** : cohorte des opt-ins de la période → *RDV pris* (rendez-vous réels)
  → *Convertis* (uniquement si une conversion est **attestée par un événement de statut horodaté**). Tant
  qu'aucune conversion n'est mesurée, l'étape est marquée « non mesuré » et l'on s'appuie sur la **répartition
  par statut** (affichée à part, étiquetée « état du moment », jamais appelée « taux de conversion »).
- **Répartition par source / marque / campagne UTM** (barres chiffrées).
- **RDV à venir par semaine** (8 semaines, depuis `marketing_appointments`).
- Publicité (Meta Ads) : **« non connecté »**, aucun ROAS/CPA inventé. Toute valeur déclarative (budget saisi
  à la main) est étiquetée comme telle. Le module Performance de Studio est inchangé.

## Mode démo (données fictives, isolées)

- Les leads fictifs vivent **uniquement** dans `DemoMarketing` (`src/lib/marketing/demo-store.ts`, mémoire de
  session). **Jamais** d'insertion de faux leads dans les tables `marketing_*` de production. `resetMarketingDemo()`
  réinitialise le magasin.
- Seed enrichi : ~15 prospects variés (tous statuts, plusieurs sources/marques/UTM), RDV passés et à venir,
  relances simulées, journal d'événements complet — de quoi montrer le CRM et les graphiques.
- En démo : aucun email/relance/rappel réel (worker en simulation), aucune réservation réelle, aucune écriture
  vers la production. Tout écran alimenté par la démo porte un badge **« Démo »** (`src/components/shared/demo-badge.tsx`),
  en plus du bandeau d'espace. Les métriques réelles ne sont jamais mélangées aux données démo.

## Variables d'environnement

- `MARKETING_OPTIN_SECRET` — secret du webhook d'opt-in (facultatif ; sans lui, l'endpoint répond « non configuré »).
- `CRON_SECRET` — protège le worker d'emails (déjà utilisé par la synchro Meta).
- `RESEND_API_KEY` / `EMAIL_FROM` — envoi réel (sinon DRY RUN / Supabase). `NEXT_PUBLIC_APP_URL` — liens des emails.

## Migrations à appliquer (à la main, le moment venu — rien n'est déployé par ce chantier)

Dans l'ordre, strictement additives et rejouables :

1. `supabase/migrations/0008_marketing.sql` — espace Marketing (prospects, RDV, outbox, réglages, RPC, RLS).
2. `supabase/migrations/0015_marketing_prospect_marque_utm.sql` — colonnes `marque` / `utm` (correctif opt-in).
3. `supabase/migrations/0016_marketing_crm.sql` — qualification, prochaine action, table `marketing_prospect_events` + RLS.

RLS des nouvelles tables prouvée par `supabase/tests/marketing.sql` (un membre sans module Marketing ne lit ni
n'écrit le journal d'événements). **Ne pas exécuter sur la base réelle** : test en bac à sable (`begin … rollback`).
Le code est **tolérant au déploiement avant 0016** (journalisation best-effort, entonnoir dégradé), mais les
colonnes/table de 0016 doivent être appliquées pour que la qualification, la prochaine action et la chronologie
persistent en base.
