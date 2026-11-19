-- ============================================================================
-- Iconflow — 0020 SOURCES EXTERNES DE RENDEZ-VOUS (iClosed, puis d'autres outils)
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0020_marketing_sources.down.sql
--
--   • marketing_appointments : d'où vient le rendez-vous (source, identifiant externe),
--     qui le tient (setter, closer), et son résultat (à venir, présent, absent, annulé, reporté).
--   • L'interdiction de chevauchement ne vaut plus que pour les rendez-vous pris DANS l'app :
--     deux closers peuvent avoir un appel à la même heure dans l'outil de réservation.
--   • marketing_source_runs : journal de chaque synchronisation.
-- Ne modifie aucun rendez-vous existant (ils gardent source = 'interne').
-- ============================================================================
set client_min_messages = warning;

alter table public.marketing_appointments add column if not exists source text not null default 'interne';
alter table public.marketing_appointments add column if not exists external_id text;
alter table public.marketing_appointments add column if not exists contact_id uuid references public.marketing_contacts(id) on delete set null;
alter table public.marketing_appointments add column if not exists setter_id uuid references public.profiles(id) on delete set null;
alter table public.marketing_appointments add column if not exists closer_id uuid references public.profiles(id) on delete set null;
alter table public.marketing_appointments add column if not exists result text not null default 'a_venir';
alter table public.marketing_appointments add column if not exists title text;
alter table public.marketing_appointments add column if not exists calendar_event_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_appointments_result_check') then
    alter table public.marketing_appointments add constraint marketing_appointments_result_check
      check (result in ('a_venir','present','absent','annule','reporte'));
  end if;
end $$;
create unique index if not exists marketing_appointments_external_key on public.marketing_appointments (source, external_id) where external_id is not null;
create index if not exists marketing_appointments_closer_idx on public.marketing_appointments (closer_id, starts_at);
create index if not exists marketing_appointments_contact_idx on public.marketing_appointments (contact_id);

-- Anti-double-réservation : seulement pour les rendez-vous pris dans l'app.
alter table public.marketing_appointments drop constraint if exists marketing_appointments_no_overlap;
alter table public.marketing_appointments add constraint marketing_appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'confirme' and source = 'interne');

create table if not exists public.marketing_source_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  mode text not null default 'api' check (mode in ('api','webhook','manuel')),
  ok boolean not null default true,
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists marketing_source_runs_idx on public.marketing_source_runs (source, started_at desc);
alter table public.marketing_source_runs enable row level security;
revoke all on table public.marketing_source_runs from anon;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_source_runs' and policyname='mkt_source_runs_read') then
    create policy mkt_source_runs_read on public.marketing_source_runs for select to authenticated using (my_has_module('marketing_reglages'));
  end if;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 20))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(20, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
