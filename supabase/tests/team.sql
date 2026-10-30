-- ============================================================================
-- Tests Équipe & accès (migration 0004). Tout est ROLLBACK à la fin.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','ibracreators@gmail.com');
-- Invitation agence (invited_at renseigné par l'API admin) → rôle agency accordé
insert into auth.users (id, email, raw_user_meta_data, invited_at) values ('aaaaaaaa-0000-4000-8000-000000000002','sarah@icon-flow.fr','{"role":"agency","full_name":"Sarah","invited_by":"aaaaaaaa-0000-4000-8000-000000000001"}'::jsonb, now());
-- Auto-inscription frauduleuse avec role=agency dans les métadonnées (pas d'invited_at) → reste client
insert into auth.users (id, email, raw_user_meta_data) values ('cccccccc-0000-4000-8000-000000000003','pirate@evil.test','{"role":"agency"}'::jsonb);
insert into clients (id, name, slug) values ('11111111-0000-4000-8000-000000000001','Lashéa','lashea');
insert into auth.users (id, email, raw_user_meta_data, invited_at) values ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test','{"role":"client","client_id":"11111111-0000-4000-8000-000000000001"}'::jsonb, now());

do $$ begin
  if (select role from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'agency' then raise exception 'FAIL invité agence'; end if;
  if (select invited_by from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'aaaaaaaa-0000-4000-8000-000000000001' then raise exception 'FAIL invited_by'; end if;
  if (select role from profiles where id='cccccccc-0000-4000-8000-000000000003') <> 'client' then raise exception 'FAIL auto-inscription ne doit pas donner agency'; end if;
  if (select client_id from profiles where id='bbbbbbbb-0000-4000-8000-000000000001') <> '11111111-0000-4000-8000-000000000001' then raise exception 'FAIL client rattaché'; end if;
  raise notice 'PASS trigger : invitation agence honorée, auto-inscription bridée, client rattaché';
end $$;

-- Session agence (Ibra) : gère les droits des autres, pas les siens, sans changer de rôle
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare n int; begin
  update profiles set permissions='["dashboard","briefs","parametres"]'::jsonb, title='Head of Scripts' where id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL agence ne peut pas modifier les droits d''un membre'; end if;
  update profiles set disabled_at=now() where id='bbbbbbbb-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL agence ne peut pas retirer un accès client'; end if;
  begin
    update profiles set role='client' where id='aaaaaaaa-0000-4000-8000-000000000002';
    raise exception 'FAIL changement de rôle accepté';
  exception when check_violation then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update profiles set permissions='[]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000001';
    get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL un membre peut changer ses propres droits'; end if;
  exception when insufficient_privilege then null; end;
  update profiles set display_name='Ibra K.' where id='aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL un membre doit pouvoir changer son nom'; end if;
  raise notice 'PASS agence : droits et accès des autres modifiables, rôle verrouillé, soi-même exclu';
end $$;

-- Session client : aucune gestion
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
  update profiles set permissions='null'::jsonb, disabled_at=null where id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL client modifie un profil agence'; end if;
  if (select count(*) from profiles) <> 1 then raise exception 'FAIL client voit d''autres profils'; end if;
  raise notice 'PASS client : aucun droit de gestion, ne voit que lui';
end $$;
reset role;
rollback;
