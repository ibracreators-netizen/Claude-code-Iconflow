-- ============================================================================
-- Iconflow — 0026 CRM UNIQUE, ÉQUIPE ET KPI
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0026_marketing_crm_suite.down.sql
--
--   • marketing_pipeline_stages.color : couleur d'une colonne du kanban.
--   • marketing_kpi_entries : suivi quotidien déclaré par chaque membre (appels passés, etc.),
--     pour ce que le CRM ne peut pas savoir tout seul.
--   • marketing_team_log : historique d'un compte (invitation, rôle, accès).
--   • index sur l'auteur des événements : l'historique d'activité d'un membre.
-- Les emails envoyés depuis une fiche sont écrits dans la chronologie existante
-- (marketing_prospect_events, type « email ») : aucune nouvelle table, mêmes droits.
-- ============================================================================
set client_min_messages = warning;

alter table public.marketing_pipeline_stages add column if not exists color text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_pipeline_stages_color_check') then
    alter table public.marketing_pipeline_stages add constraint marketing_pipeline_stages_color_check
      check (color is null or color in ('gris','bleu','vert','jaune','orange','rouge','violet','rose'));
  end if;
end $$;

create table if not exists public.marketing_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) < 2000),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, day),
  check (day <= (current_date + 1))
);
create index if not exists marketing_kpi_entries_day_idx on public.marketing_kpi_entries (day desc);

create table if not exists public.marketing_team_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('invitation','role','acces','acces_retire','acces_retabli')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketing_team_log_profile_idx on public.marketing_team_log (profile_id, created_at desc);
create index if not exists marketing_prospect_events_author_idx on public.marketing_prospect_events (created_by, created_at desc);

alter table public.marketing_kpi_entries enable row level security;
alter table public.marketing_team_log enable row level security;
revoke all on table public.marketing_kpi_entries, public.marketing_team_log from anon;
-- Historique des comptes : écrit par le serveur seulement, lu par qui gère l'équipe.
revoke insert, update, delete, truncate on table public.marketing_team_log from authenticated;
do $$ begin
  -- Suivi quotidien : chacun saisit et lit le sien ; un membre de l'agence lit et corrige celui de l'équipe.
  if not exists (select 1 from pg_policies where tablename='marketing_kpi_entries' and policyname='mkt_kpi_entries_rw') then
    create policy mkt_kpi_entries_rw on public.marketing_kpi_entries for all to authenticated
      using (my_has_module('marketing_classement') and (mkt_sees_all() or profile_id = auth.uid()))
      with check (my_has_module('marketing_classement') and (mkt_sees_all() or profile_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_team_log' and policyname='mkt_team_log_read') then
    create policy mkt_team_log_read on public.marketing_team_log for select to authenticated
      using (my_has_module('marketing_equipe') and mkt_sees_all());
  end if;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 26))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(26, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
