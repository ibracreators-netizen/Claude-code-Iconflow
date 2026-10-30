-- ============================================================================
-- Iconflow Studio — 0004 ÉQUIPE & ACCÈS (additif, idempotent)
-- Droits par module, retrait d'accès, invitations.
-- ============================================================================

alter table public.profiles
  add column if not exists permissions jsonb,              -- null = accès complet ; sinon liste de modules
  add column if not exists disabled_at timestamptz,        -- accès retiré par l'agence
  add column if not exists invited_by uuid references public.profiles(id);

-- Profil automatique : un rôle "agency" n'est accordé que s'il vient d'une invitation
-- (auth.users.invited_at renseigné par l'API admin) ou de la liste admin_emails.
-- Créée seulement si absente : une version plus récente (migration suivante) ne doit jamais être écrasée en rejouant ce script.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'handle_new_user') then
    execute $fn$
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean; invited_client uuid; invited_role text; inviter uuid;
begin
  select coalesce((select value from app_settings where key='admin_emails') ? lower(new.email), false) into is_admin;
  invited_client := nullif(new.raw_user_meta_data->>'client_id','')::uuid;
  invited_role := new.raw_user_meta_data->>'role';
  inviter := nullif(new.raw_user_meta_data->>'invited_by','')::uuid;
  if is_admin or (new.invited_at is not null and invited_role = 'agency') then
    insert into public.profiles (id, role, client_id, display_name, email, invited_by)
      values (new.id, 'agency', null, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email, inviter)
      on conflict (id) do update set email = excluded.email;
  else
    insert into public.profiles (id, role, client_id, display_name, email, invited_by)
      values (new.id, 'client', invited_client, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email, inviter)
      on conflict (id) do update set email = excluded.email;
  end if;
  return new;
end $$;
    $fn$;
  end if;
end $do$;

-- L'agence peut gérer les autres profils (droits, accès, fonction, rattachement client),
-- jamais le sien par cette voie, et sans changer un rôle.
do $$
begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_agency_manage') then
    create policy profiles_agency_manage on public.profiles for update to authenticated
      using (my_role() = 'agency' and id <> auth.uid())
      with check (my_role() = 'agency' and id <> auth.uid() and role = (select p.role from public.profiles p where p.id = profiles.id));
  end if;
end $$;

-- Un membre ne peut modifier sur son propre profil que nom, fonction et photo :
-- jamais son rôle, ses droits, son rattachement ni son accès.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
    and permissions is not distinct from (select p.permissions from public.profiles p where p.id = auth.uid())
    and client_id is not distinct from (select p.client_id from public.profiles p where p.id = auth.uid())
    and disabled_at is not distinct from (select p.disabled_at from public.profiles p where p.id = auth.uid())
  );

create index if not exists activity_actor_time_idx on public.activity_log (actor_id, created_at desc);
