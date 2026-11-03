-- ============================================================================
-- Iconflow Studio — 0011 IA PROCESS (dossiers de production vidéo IA) — additif, idempotent
-- Un dossier = un brief : appartient à un client et contient autant de concepts qu'on
-- veut. Tout le contenu (concepts, parties, prompts, générations, notes, historique,
-- commentaires) est stocké dans un document JSONB (data.concepts[]). Jeton public pour
-- le partage en ligne (page de lecture + export JSON), servi par la clé service ;
-- aucune politique anonyme n'est ouverte sur la table.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.ia_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,                -- nom du dossier
  data jsonb not null default '{}'::jsonb,
  public_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create unique index if not exists ia_plans_public_token_key on public.ia_plans (public_token) where public_token is not null;
create index if not exists ia_plans_client_idx on public.ia_plans (client_id, created_at desc);

alter table public.ia_plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='ia_plans' and policyname='ia_plans_agency_all') then
    create policy ia_plans_agency_all on public.ia_plans for all to public
      using (my_role() = 'agency') with check (my_role() = 'agency');
  end if;
end $$;
