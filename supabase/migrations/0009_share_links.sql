-- ============================================================================
-- Iconflow Studio — 0009 LIENS DE PARTAGE PUBLIC (additif, idempotent, rejouable)
-- Un registre unique des liens publics d'un client : briefs publiés et casting
-- (avatars). Sert l'historique et la gestion (révocation) côté studio. Les pages
-- publiques restent servies par la clé service, filtrées sur le jeton : aucune
-- politique anonyme n'est ouverte sur les tables de données.
-- Le partage de brief (0007) continue de fonctionner tel quel : public_token reste
-- sur la table briefs ; on y ajoute seulement une ligne de registre en parallèle.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('brief','casting')),
  entity_id uuid,                    -- id du brief ; null pour un casting (niveau client)
  token text not null unique,
  label text,                        -- titre du brief / nom du client, pour l'historique
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id)
);

create index if not exists share_links_client_idx on public.share_links (client_id, created_at desc);
create unique index if not exists share_links_active_entity_idx
  on public.share_links (kind, entity_id) where revoked_at is null and entity_id is not null;

alter table public.share_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='share_links' and policyname='share_links_agency_all') then
    create policy share_links_agency_all on public.share_links for all to public
      using (my_role() = 'agency') with check (my_role() = 'agency');
  end if;
end $$;

-- Reprise des briefs déjà publiés : ils apparaissent dans l'historique des partages.
insert into public.share_links (client_id, kind, entity_id, token, label, created_at)
select b.client_id, 'brief', b.id, b.public_token, b.title, coalesce(b.published_at, now())
from public.briefs b
where b.public_token is not null
  and not exists (
    select 1 from public.share_links s
    where s.kind = 'brief' and s.entity_id = b.id and s.revoked_at is null
  );
