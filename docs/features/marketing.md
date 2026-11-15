# IconFlow Marketing — espace d'acquisition de l'agence

Deuxième espace de l'app, sous le conteneur **Ibra Group**, indépendant d'IconFlow Studio.
Même design, mêmes composants. Studio n'est pas modifié dans son fonctionnement ni ses données.

## Accès et indépendance des droits

- Nouveaux modules dans `profiles.permissions` : `marketing_dashboard`, `marketing_reception`,
  `marketing_prospects`, `marketing_calendrier`, `marketing_relances`, `marketing_reglages`. Accordés dans **Équipe & accès**
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

## Réception des leads (migration 0017 — additive, rejouable, avec retour arrière)

Tout ce qu'un site envoie arrive d'abord dans la table `leads_inbox`, tel quel. L'application transforme
ensuite chaque ligne en prospect. Aucun lead n'est supprimé ni ignoré en silence.

### Pourquoi la réception ne dépend pas de l'application

Le site n'écrit plus dans l'application (VPS). Il appelle une **fonction de la base** :
`POST {SUPABASE_URL}/rest/v1/rpc/lead_inbox_receive`. Si l'application est arrêtée ou en redéploiement, le lead
est quand même enregistré ; il sera transformé en prospect au retour de l'application.

- **Insertion seule.** Le rôle public (`anon`) n'a aucun droit sur `leads_inbox` : ni lecture, ni modification,
  ni suppression, ni insertion directe. Il a seulement le droit d'exécuter `lead_inbox_receive`, qui ne sait
  qu'ajouter une ligne et ne renvoie aucune donnée de la table.
- **Aucune suppression.** Un déclencheur refuse tout `DELETE` sur `leads_inbox`, quel que soit le rôle.
- **Lecture réservée.** Seul un membre qui a le module `marketing_reception` lit les lignes et peut les
  retraiter (RLS). Prouvé par `supabase/tests/leads_inbox.sql`.

### Contrat à respecter par un site

Requête : `POST {SUPABASE_URL}/rest/v1/rpc/lead_inbox_receive`, en-têtes `Content-Type: application/json` et
`apikey: <clé publique Supabase>`. Le corps est un objet JSON libre (16 000 octets au plus). Champs reconnus :

| Champ | Rôle |
|---|---|
| `email` | obligatoire pour devenir un prospect (sinon la ligne passe « erreur », elle n'est pas perdue) |
| `name` ou `prenom`, `phone`, `marque` | identité du contact |
| `site` | nom du site (ex. `iconflow.fr`) |
| `landing_page` | page d'entrée : première page vue, avec ses paramètres |
| `page` | page où le formulaire a été envoyé |
| `referrer` | site d'origine du visiteur |
| `utm` | objet des paramètres de campagne (`utm_source`, `utm_campaign`, `fbclid`…) |
| `suspect` | `true` si le champ piège du formulaire a été rempli |
| `recu_le` | heure d'envoi côté site (sert à l'anti-doublon) |
| `request_id` | facultatif : identifiant unique de requête fourni par le site |

Réponse `200` : `{ "ok": true, "stored": true, "id": "<identifiant de la ligne>", "duplicate": false }`.
Un renvoi du même lead répond le même `id` avec `duplicate: true` (aucun doublon). Le site ne doit considérer
le lead comme reçu que s'il lit `ok: true` **et** un `id`. Corps illisible ou trop gros : `400`. Plus de 300
leads en 10 minutes : `503`, le site doit réessayer.

Identifiant de requête : celui du site s'il en envoie un, sinon une empreinte de `site + email + recu_le`.

Le site `iconflow.fr` (dépôt `funnel-ads`, `api/lead.js`) envoie déjà tous ces champs et se règle par
variables, sans changement de code : `LEAD_INBOX_URL` (l'adresse ci-dessus), `LEAD_INBOX_KEY_HEADER=apikey`,
`LEAD_INBOX_KEY` (clé publique Supabase), `LEAD_REQUIRE_ID=1`, `LEAD_SITE_NAME=iconflow.fr`.

### Statuts d'une ligne

| Statut | Sens | Suite |
|---|---|---|
| `recu` | enregistrée, pas encore traitée | le planificateur la traite dans la minute |
| `traite` | transformée en prospect (lien vers la fiche) | rien |
| `erreur` | traitement impossible, la raison est écrite sur la ligne | corriger puis « Retraiter » |
| `suspect` | champ piège rempli, ou clé de site absente ou inconnue | jamais traitée seule : « Retraiter » si elle est légitime |

### Traitement (ligne → prospect), rejouable

`src/lib/marketing/inbox-core.ts` (règles, testées hors ligne) et `src/lib/marketing/inbox.ts` (base, alertes).
Rapprochement par email, insensible à la casse : un email déjà connu complète le prospect existant (jamais
d'écrasement), sinon un prospect est créé avec son site, sa page d'entrée, son site d'origine et ses
paramètres de campagne. Traiter deux fois la même ligne ne crée pas de doublon. Un lead de test suit tout le
circuit mais ne crée aucun prospect.

Limite de la phase 1 : le traitement crée ou complète un **prospect**. La séparation contact / prospect arrive
en phase 2.

### Page Marketing › Réception

Compteurs par statut, lignes reçues (site, page d'entrée, contact, campagne, statut, état de l'alerte), détail
avec la charge utile brute, bouton **Retraiter** par ligne, **Traiter maintenant**, **Envoyer un lead de test**.
Le bloc « État du service » dit si le planificateur tourne, si les alertes partent, et pour chaque variable
attendue « lue » ou « manquante » — jamais une valeur.

### Alertes par email

À chaque nouveau lead et à chaque erreur de traitement, un email part aux adresses saisies dans
Marketing › Réglages (« Adresses à prévenir »). Les alertes partent dès que `RESEND_API_KEY` et `EMAIL_FROM`
sont lues : elles ne dépendent pas du réglage « envoi réel », qui concerne les emails adressés aux prospects.
Sans ces deux variables, l'alerte est notée « simulée » sur la ligne et la page l'affiche. Sans adresse
saisie : « aucun destinataire ».

### Planificateur (pg_cron dans Supabase)

Toutes les minutes, la base appelle `POST {APP}/api/marketing/cron` (Bearer `CRON_SECRET`). L'application
traite les lignes `recu` et note l'heure de son passage. Choix de pg_cron plutôt qu'une tâche sur le VPS : il
vit à côté des données, survit aux redéploiements du VPS et garde l'historique de ses exécutions.

- Installation à la main, une fois : `supabase/ops/marketing_planificateur.sql` (ce n'est pas une migration :
  il contient l'adresse de l'app et range le secret dans le coffre Supabase).
- Le planificateur **n'envoie aucun email aux prospects** : la file des relances et rappels n'est pas touchée.
- Marketing › Réglages affiche la date du dernier passage. État : actif (moins de 5 min), en retard (5 à
  15 min), arrêté (plus de 15 min), jamais exécuté. Arrêté ou jamais exécuté : bandeau en haut de chaque page
  Marketing, et email d'alerte (au plus un toutes les 6 heures).
- Limite : cet email part quand quelqu'un ouvre l'espace Marketing. Pour être prévenu même application
  éteinte, le même fichier contient une sentinelle facultative, côté base (non testée).

### Clés de site (facultatives)

Table `marketing_lead_sites` (nom, empreinte SHA-256 de la clé, active). Tant qu'aucune clé active n'existe,
tout envoi est accepté. Dès qu'une clé existe, un envoi sans en-tête `x-lead-site-key` valide est gardé en
`suspect`, et le nom du site vient de la clé, pas de la charge utile. Non utilisé en phase 1.

### Revenir à l'ancienne route

L'ancienne route `POST /api/marketing/optin` reste en place et inchangée. Pour y revenir : remettre sur le
site les anciennes valeurs de `LEAD_INBOX_URL`, `LEAD_INBOX_KEY_HEADER` et `LEAD_INBOX_KEY`, puis redéployer
le site. Les lignes déjà dans `leads_inbox` restent lisibles et retraitables.

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

### Traitement à la minute (non activé)

La route `/api/marketing/emails/run` (Bearer `CRON_SECRET`) n'est appelée par personne. Le planificateur de la
réception (voir plus haut) ne l'appelle pas, volontairement : l'installer ne fait partir aucun email vers un
prospect. Brancher cette file reste une décision à part.

## Flux publics (points d'extension, non branchés)

- `POST /api/marketing/optin` — **ancienne route**, gardée en secours (voir « Revenir à l'ancienne route »).
  Elle écrit directement un prospect et ne garde ni le site ni la page d'entrée. Secret partagé
  `MARKETING_OPTIN_SECRET`, validation zod, déduplication par email, limitation de débit.
  **Réponse = preuve d'écriture** : `200 { ok: true, stored: true, id, created }` uniquement quand la ligne a été
  écrite puis relue en base (`id` = prospect, `created` = faux si l'email existait déjà). Toute erreur de lecture ou
  d'écriture répond `500` — jamais « enregistré ». Sans base reliée (démo) : `stored: false`. L'appelant ne doit
  considérer le lead comme reçu que s'il lit `ok: true` **et** un `id`.
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

## Sans base reliée (développement)

Aucune donnée de démonstration : sans base, l'espace Marketing démarre **vide** (`src/lib/marketing/demo-store.ts`,
mémoire de session). Les 39 prospects fictifs ont été retirés du code. Rien n'a été supprimé dans la base de
production. Dans ce mode, aucun email réel, aucune réservation réelle, aucune écriture vers la production ;
les écrans portent le badge « Démo ».

## Variables d'environnement

| Variable | Rôle | Sans elle |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | traitement des leads sans session (planificateur) | les lignes restent « reçu » |
| `CRON_SECRET` | autorise le planificateur à appeler `/api/marketing/cron` | la route répond 503 |
| `RESEND_API_KEY`, `EMAIL_FROM` | envoi des alertes et des emails | simulation, affichée dans l'app |
| `NEXT_PUBLIC_APP_URL` | lien « Ouvrir la réception » dans les alertes | l'alerte part sans lien |
| `MARKETING_OPTIN_SECRET` | ancienne route d'opt-in | elle répond « non configuré » |

Côté Supabase (coffre Vault) : secret `iconflow_cron_secret`, même valeur que `CRON_SECRET`.
Marketing › Réception indique pour chacune « lue » ou « manquante », jamais la valeur.

## Migrations

Dans l'ordre, additives et rejouables :

1. `supabase/migrations/0008_marketing.sql` — espace Marketing (prospects, RDV, outbox, réglages, RPC, RLS).
2. `supabase/migrations/0015_marketing_prospect_marque_utm.sql` — colonnes `marque` / `utm`.
3. `supabase/migrations/0016_marketing_crm.sql` — qualification, prochaine action, table `marketing_prospect_events` + RLS.
4. `supabase/migrations/0017_leads_inbox.sql` — boîte de réception, fonction `lead_inbox_receive`, clés de
   site, colonnes `site` / `landing_page` / `referrer` sur les prospects, module `marketing_reception`.
   Retour arrière : `supabase/rollbacks/0017_leads_inbox.down.sql` (exporter `leads_inbox` avant).

Hors migration, à la main : `supabase/ops/marketing_planificateur.sql`.

## Tests

- `supabase/tests/marketing.sql` et `supabase/tests/leads_inbox.sql` : droits et règles en base, sur une base
  de test (`begin … rollback`). **Jamais sur la production.**
- `pnpm dlx tsx scripts/leads-inbox-selfcheck.ts` : traitement des leads, hors ligne (31 vérifications).

Le code tolère un déploiement avant les migrations (page Réception : bandeau « migration 0017 non appliquée »,
journal best-effort), mais chaque fonction ne marche vraiment qu'une fois sa migration appliquée.
