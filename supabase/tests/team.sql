-- ============================================================================
-- Tests Équipe & accès (migration 0004). Tout est ROLLBACK à la fin.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','ibracreators@gmail.com');
-- Invitation agence : le trigger ne fait confiance à aucune métadonnée (même avec invited_at) ;
-- c'est le studio qui complète le profil juste après, avec la clé service.
insert into auth.users (id, email, raw_user_meta_data, invited_at) values ('aaaaaaaa-0000-4000-8000-000000000002','sarah@icon-flow.fr','{"role":"agency","full_name":"Sarah","invited_by":"aaaaaaaa-0000-4000-8000-000000000001"}'::jsonb, now());
-- Auto-inscription frauduleuse avec role=agency et client_id dans les métadonnées → client sans espace
insert into clients (id, name, slug) values ('11111111-0000-4000-8000-000000000001','Lashéa','lashea');
insert into auth.users (id, email, raw_user_meta_data) values ('cccccccc-0000-4000-8000-000000000003','pirate@evil.test','{"role":"agency","client_id":"11111111-0000-4000-8000-000000000001"}'::jsonb);
insert into auth.users (id, email, raw_user_meta_data, invited_at) values ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test','{"role":"client","client_id":"11111111-0000-4000-8000-000000000001"}'::jsonb, now());

do $$ begin
  if (select role from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'client' then raise exception 'FAIL le trigger ne doit jamais accorder agency depuis les métadonnées'; end if;
  if (select display_name from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'Sarah' then raise exception 'FAIL nom affiché'; end if;
  if (select role || coalesce(client_id::text,'∅') from profiles where id='cccccccc-0000-4000-8000-000000000003') <> 'client∅' then raise exception 'FAIL auto-inscription rattachée à un client'; end if;
  if (select client_id from profiles where id='bbbbbbbb-0000-4000-8000-000000000001') is not null then raise exception 'FAIL rattachement client pris des métadonnées'; end if;
  raise notice 'PASS trigger : profils créés sans accès, aucune métadonnée de confiance';
end $$;

-- Complément de profil par le studio (clé service = superuser ici)
update profiles set role='agency', invited_by='aaaaaaaa-0000-4000-8000-000000000001' where id='aaaaaaaa-0000-4000-8000-000000000002';
update profiles set client_id='11111111-0000-4000-8000-000000000001', invited_by='aaaaaaaa-0000-4000-8000-000000000001' where id='bbbbbbbb-0000-4000-8000-000000000001';
do $$ begin
  if (select role from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'agency' then raise exception 'FAIL invité agence'; end if;
  if (select invited_by from profiles where id='aaaaaaaa-0000-4000-8000-000000000002') <> 'aaaaaaaa-0000-4000-8000-000000000001' then raise exception 'FAIL invited_by'; end if;
  if (select client_id from profiles where id='bbbbbbbb-0000-4000-8000-000000000001') <> '11111111-0000-4000-8000-000000000001' then raise exception 'FAIL client rattaché'; end if;
  raise notice 'PASS complément de profil par le studio : membre agence et client rattaché';
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
  exception when insufficient_privilege then null; when others then if sqlerrm not like '%last_admin%' then raise; end if; end;
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
