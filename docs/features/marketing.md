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

## Données marketing (tableau de bord)

Uniquement des données réelles et sourcées (chaque carte indique sa source et sa fraîcheur). La publicité
(Meta Ads) s'affiche « non connecté » : aucun ROAS/CPA inventé. Le module Performance de Studio est inchangé.

## Variables d'environnement

- `MARKETING_OPTIN_SECRET` — secret du webhook d'opt-in (facultatif ; sans lui, l'endpoint répond « non configuré »).
- `CRON_SECRET` — protège le worker d'emails (déjà utilisé par la synchro Meta).
- `RESEND_API_KEY` / `EMAIL_FROM` — envoi réel (sinon DRY RUN / Supabase). `NEXT_PUBLIC_APP_URL` — liens des emails.

Migration à relire et à appliquer à la main : `supabase/migrations/0008_marketing.sql`.
