-- ============================================================================
-- Iconflow Studio — 0010 SUPPRESSION DÉFINITIVE D'UN MEMBRE (additif, idempotent)
-- Supprime un membre de l'agence : réattribue/annule toutes les références à son
-- profil, puis supprime la ligne profiles. Le compte d'authentification (auth.users)
-- est supprimé côté application avec la clé service (libère l'e-mail).
-- Réservé à un administrateur à accès complet ; jamais soi-même ; agence uniquement.
-- ============================================================================
set client_min_messages = warning;

create or replace function public.agency_delete_member(p_member_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare member_name text; member_role text; r record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not my_is_full_access() then raise exception 'admin_only'; end if;
  if p_member_id = auth.uid() then raise exception 'cannot_edit_self'; end if;
  select coalesce(display_name, email), role into member_name, member_role from public.profiles where id = p_member_id;
  if not found then raise exception 'target_not_found'; end if;
  if member_role <> 'agency' then raise exception 'not_a_member'; end if;

  -- Toutes les colonnes qui référencent profiles(id) : on annule (si nullable) ou on réattribue
  -- à l'administrateur qui supprime (colonnes NOT NULL, ex. messages.author_id) pour garder l'historique.
  for r in
    select kcu.table_name as tbl, kcu.column_name as col, c.is_nullable as nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    join information_schema.columns c
      on c.table_schema = tc.table_schema and c.table_name = kcu.table_name and c.column_name = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and ccu.table_name = 'profiles' and ccu.column_name = 'id'
  loop
    if r.nullable = 'YES' then
      execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col) using p_member_id;
    else
      execute format('update public.%I set %I = $2 where %I = $1', r.tbl, r.col, r.col) using p_member_id, auth.uid();
    end if;
  end loop;

  delete from public.profiles where id = p_member_id;
  insert into public.activity_log (kind, actor_id, summary) values ('note', auth.uid(), member_name || ' (membre) supprimé définitivement');
  return member_name;
end $$;

revoke all on function public.agency_delete_member(uuid) from public, anon;
grant execute on function public.agency_delete_member(uuid) to authenticated;
