-- ============================================================================
-- Iconflow Studio — 0010 SUPPRESSION DÉFINITIVE D'UN COMPTE (additif, idempotent)
-- Supprime un compte (membre de l'agence OU compte client) : réattribue/annule toutes
-- les références à son profil ET à son compte d'authentification, puis supprime la ligne
-- profiles. La suppression du compte auth.users (libère l'e-mail) se fait côté application
-- avec la clé service, une fois les références nettoyées ici.
-- Réservé à un administrateur à accès complet ; jamais soi-même.
-- ============================================================================
set client_min_messages = warning;

create or replace function public.agency_delete_member(p_member_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare member_name text; r record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not my_is_full_access() then raise exception 'admin_only'; end if;
  if p_member_id = auth.uid() then raise exception 'cannot_edit_self'; end if;
  select coalesce(display_name, email) into member_name from public.profiles where id = p_member_id;
  if not found then raise exception 'target_not_found'; end if;

  -- 1) Références au profil (public.profiles.id), hors table profiles : annulées, ou réattribuées à
  --    l'administrateur si la colonne est NOT NULL (ex. messages.author_id) pour garder l'historique.
  for r in
    select kcu.table_name as tbl, kcu.column_name as col, c.is_nullable as nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    join information_schema.columns c on c.table_schema = tc.table_schema and c.table_name = kcu.table_name and c.column_name = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and ccu.table_name = 'profiles' and ccu.column_name = 'id' and kcu.table_name <> 'profiles'
  loop
    if r.nullable = 'YES' then execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col) using p_member_id;
    else execute format('update public.%I set %I = $2 where %I = $1', r.tbl, r.col, r.col) using p_member_id, auth.uid(); end if;
  end loop;

  -- profiles.invited_by (auto-référence) : annulé pour les autres comptes.
  update public.profiles set invited_by = null where invited_by = p_member_id;

  -- 2) Références au compte d'authentification (auth.users.id) depuis les tables publiques, hors profiles
  --    (ex. livrable_comments.author, validations.decided_by, briefs.validated_by, management.updated_by).
  --    À nettoyer avant de supprimer le compte auth, sinon la suppression échoue (contrainte NO ACTION).
  for r in
    select kcu.table_name as tbl, kcu.column_name as col, c.is_nullable as nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    join information_schema.columns c on c.table_schema = tc.table_schema and c.table_name = kcu.table_name and c.column_name = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and ccu.table_schema = 'auth' and ccu.table_name = 'users' and ccu.column_name = 'id' and kcu.table_name <> 'profiles'
  loop
    if r.nullable = 'YES' then execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col) using p_member_id;
    else execute format('update public.%I set %I = $2 where %I = $1', r.tbl, r.col, r.col) using p_member_id, auth.uid(); end if;
  end loop;

  delete from public.profiles where id = p_member_id;
  insert into public.activity_log (kind, actor_id, summary) values ('note', auth.uid(), member_name || ' : compte supprimé définitivement');
  return member_name;
end $$;

revoke all on function public.agency_delete_member(uuid) from public, anon;
grant execute on function public.agency_delete_member(uuid) to authenticated;
