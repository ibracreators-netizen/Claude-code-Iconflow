-- ============================================================================
-- Iconflow — 0016 MARKETING CRM (additif, idempotent, rejouable)
--
-- Enrichit le CRM d'acquisition SANS toucher à l'existant :
--   • qualification + prochaine action sur marketing_prospects (colonnes nullables) ;
--   • journal d'événements par prospect (marketing_prospect_events) qui alimente
--     la chronologie de la fiche et l'entonnoir par cohortes.
--
-- Strictement additive : `add column if not exists`, `create table if not exists`,
-- aucune colonne modifiée, aucune donnée réécrite, aucune contrainte posée sur les
-- lignes déjà présentes. RLS gardée par le droit AU MODULE (my_has_module), comme
-- les tables Marketing de 0008. Les flux publics et le worker passent par la clé
-- service (hors RLS) : aucune policy anonyme ouverte ici.
-- ============================================================================
set client_min_messages = warning;

-- ─── Qualification + prochaine action (colonnes nullables, déclaratives) ──────
alter table public.marketing_prospects add column if not exists besoin text;
alter table public.marketing_prospects add column if not exists budget text;
alter table public.marketing_prospects add column if not exists next_action_at timestamptz;
alter table public.marketing_prospects add column if not exists next_action_note text;

comment on column public.marketing_prospects.besoin is
  'Besoin exprimé par le prospect (qualification, saisi à la main).';
comment on column public.marketing_prospects.budget is
  'Budget indicatif déclaré (texte libre). Valeur DÉCLARATIVE — jamais une métrique calculée ni publicitaire.';
comment on column public.marketing_prospects.next_action_at is
  'Date de la prochaine action de suivi (relance / appel). Sert à la mise en évidence « à relancer aujourd''hui ».';
comment on column public.marketing_prospects.next_action_note is
  'Note associée à la prochaine action de suivi.';

-- Tri / filtre « à relancer » et « opt-ins récents » sans scan complet.
create index if not exists marketing_prospects_next_action_idx
  on public.marketing_prospects (next_action_at) where next_action_at is not null;
create index if not exists marketing_prospects_optin_idx
  on public.marketing_prospects (opted_in_at desc) where opted_in_at is not null;

-- ─── Journal d'événements d'un prospect (chronologie + entonnoir par cohortes) ─
-- kind (valeurs applicatives, non contraintes pour rester rejouable/extensible) :
--   cree | opt_in | statut | note | qualification | prochaine_action
--   | rdv_pris | rdv_annule | relance_programmee
create table if not exists public.marketing_prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.marketing_prospects(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists marketing_prospect_events_idx
  on public.marketing_prospect_events (prospect_id, created_at desc);
create index if not exists marketing_prospect_events_kind_idx
  on public.marketing_prospect_events (kind, created_at desc);

comment on table public.marketing_prospect_events is
  'Journal horodaté par prospect (opt-in, statut, note, qualification, RDV, relance). Alimente la chronologie de la fiche et l''entonnoir par cohortes. Écrit par les actions membres (RLS) ou par la clé service pour les flux publics.';

-- ─── RLS : mêmes droits que les prospects (module marketing_prospects) ────────
alter table public.marketing_prospect_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_prospect_events' and policyname='mkt_events_rw') then
    create policy mkt_events_rw on public.marketing_prospect_events for all to authenticated
      using (my_has_module('marketing_prospects')) with check (my_has_module('marketing_prospects'));
  end if;
end $$;
