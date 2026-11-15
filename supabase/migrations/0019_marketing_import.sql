-- ============================================================================
-- Iconflow — 0019 REPRISE DE DONNÉES (import GoHighLevel) ET RÉFÉRENCES EXTERNES
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0019_marketing_import.down.sql
--
--   • marketing_external_refs : « tel identifiant dans tel outil = telle fiche chez nous ».
--     C'est ce qui rend un import ou une synchronisation rejouable sans doublon
--     (GoHighLevel ici, l'outil de réservation et Google Agenda ensuite).
--   • marketing_imports : le rapport de chaque import (créés, fusionnés, rejetés et pourquoi).
-- Réservé à l'administrateur (accès complet). Ne modifie aucune donnée existante.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.marketing_external_refs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                           -- 'ghl', 'iclosed', 'google'…
  entity text not null check (entity in ('contact','prospect','appointment','member')),
  external_id text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index if not exists marketing_external_refs_key on public.marketing_external_refs (source, entity, external_id);
create index if not exists marketing_external_refs_entity_idx on public.marketing_external_refs (entity, entity_id);

create table if not exists public.marketing_imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ghl_contacts','ghl_opportunites')),
  filename text,
  total integer not null default 0,
  created integer not null default 0,
  merged integer not null default 0,
  rejected integer not null default 0,
  report jsonb not null default '{}'::jsonb,      -- lignes rejetées avec la raison (plafonné), correspondances choisies
  status text not null default 'en_cours' check (status in ('en_cours','termine')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_imports_touch') then
    create trigger marketing_imports_touch before update on public.marketing_imports for each row execute function public.marketing_touch();
  end if;
end $$;

alter table public.marketing_external_refs enable row level security;
alter table public.marketing_imports enable row level security;
revoke all on table public.marketing_external_refs, public.marketing_imports from anon;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_external_refs' and policyname='mkt_refs_admin') then
    create policy mkt_refs_admin on public.marketing_external_refs for all to authenticated using (my_is_full_access()) with check (my_is_full_access());
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_imports' and policyname='mkt_imports_admin') then
    create policy mkt_imports_admin on public.marketing_imports for all to authenticated using (my_is_full_access()) with check (my_is_full_access());
  end if;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 19))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(19, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
