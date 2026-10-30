-- TESTS PROPOSÉS — NON EXÉCUTÉS. Projet de test uniquement.
-- À exécuter par l'administrateur APRÈS revue/application de la migration.
-- Remplacer les 3 UUID ci-dessous par des fixtures existantes de TEST.
-- Aucun compte, client ou email n'est créé. Toutes les écritures sont ROLLBACK.
-- Requiert un rôle SQL autorisé à SET ROLE authenticated / anon.
begin;
set local review.agency_id = 'REPLACE_AGENCY_PROFILE_UUID';
set local review.client_user_id = 'REPLACE_CLIENT_PROFILE_UUID';
set local review.client_id = 'REPLACE_ASSIGNED_TEST_CLIENT_UUID';

do $$
begin
  if not exists(select 1 from public.profiles where id=current_setting('review.agency_id')::uuid and role='agency') then raise exception 'Agency fixture missing'; end if;
  if not exists(select 1 from public.profiles where id=current_setting('review.client_user_id')::uuid and role='client' and client_id=current_setting('review.client_id')::uuid) then raise exception 'Client fixture mismatch'; end if;
  if not exists(select 1 from public.clients where id=current_setting('review.client_id')::uuid and status is distinct from 'archived') then raise exception 'Active client fixture missing'; end if;
  if (select count(*) from auth.users u where u.id in (current_setting('review.agency_id')::uuid,current_setting('review.client_user_id')::uuid) and (u.email like '%.test' or u.email like '%.invalid'))<>2 then raise exception 'Use only fictitious .test/.invalid account fixtures'; end if;
  perform set_config('review.original_access', (select json_build_object('status',c.status,'current_step',c.current_step)::text from public.clients c where c.id=current_setting('review.client_id')::uuid),true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('review.agency_id'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('review.agency_id'),'role','authenticated')::text,true);
do $$
declare r bigint; s public.agency_client_management; step text; before_bad text;
begin
  if public.my_role() is distinct from 'agency' then raise exception 'Agency JWT fixture not effective'; end if;
  select coalesce((select revision from public.agency_client_management where client_id=current_setting('review.client_id')::uuid),0) into r;
  foreach step in array array['onboarding','in_progress','completed'] loop
    select * into s from public.agency_save_client_management(current_setting('review.client_id')::uuid,step,'NOTE FICTIVE / TEST RLS / ROLLBACK',r);
    if s.stage<>step or s.revision<>r+1 or s.updated_by<>auth.uid() then raise exception 'Agency save failed'; end if;
    r:=s.revision;
  end loop;
  before_bad:=s.notes;
  begin
    perform public.agency_save_client_management(current_setting('review.client_id')::uuid,'onboarding','STALE OVERWRITE',r-1);
    raise exception 'FAIL stale revision was accepted';
  exception when raise_exception then
    if sqlerrm<>'stale_revision' then raise; end if;
  end;
  begin
    perform public.agency_save_client_management(current_setting('review.client_id')::uuid,'unknown','',r);
    raise exception 'FAIL unknown stage was accepted';
  exception when raise_exception then if sqlerrm<>'bad_stage' then raise; end if; end;
  begin
    perform public.agency_save_client_management(current_setting('review.client_id')::uuid,'completed',repeat('x',20001),r);
    raise exception 'FAIL overlong note was accepted';
  exception when raise_exception then if sqlerrm<>'bad_notes' then raise; end if; end;
  if (select notes from public.agency_client_management where client_id=s.client_id)<>before_bad then raise exception 'Failed operation changed note'; end if;
  perform set_config('review.saved_revision',r::text,true);
  raise notice 'PASS agency allowed; three stages; revision; metadata; invalid/stale inputs refused';
end;
$$;

-- The client has the same authenticated database role, but its own real profile.
select set_config('request.jwt.claim.sub',current_setting('review.client_user_id'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('review.client_user_id'),'role','authenticated')::text,true);
do $$
declare affected bigint;
begin
  if public.my_role() is distinct from 'client' then raise exception 'Client JWT fixture not effective'; end if;
  if exists(select 1 from public.agency_client_management) then raise exception 'FAIL client can read agency notes'; end if;
  update public.agency_client_management set notes='FORBIDDEN' where client_id=current_setting('review.client_id')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL client can update agency notes'; end if;
  begin
    insert into public.agency_client_management(client_id,notes) values(current_setting('review.client_id')::uuid,'FORBIDDEN');
    raise exception 'FAIL client insert was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.agency_save_client_management(current_setting('review.client_id')::uuid,'completed','FORBIDDEN',current_setting('review.saved_revision')::bigint);
    raise exception 'FAIL client RPC was accepted';
  exception when raise_exception then if sqlerrm<>'not_an_agency' then raise; end if; end;
  begin
    delete from public.agency_client_management where client_id=current_setting('review.client_id')::uuid;
    raise exception 'FAIL client deletion was accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS client cannot read own or other agency notes, insert, update, delete or call the save RPC';
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  begin perform 1 from public.agency_client_management;raise exception 'FAIL anon table access';exception when insufficient_privilege then null;end;
  begin perform public.agency_save_client_management(current_setting('review.client_id')::uuid,'onboarding','',0);raise exception 'FAIL anon RPC access';exception when insufficient_privilege then null;end;
  raise notice 'PASS anonymous table/RPC access denied';
end;
$$;
reset role;
do $$
begin
  if current_setting('review.original_access')::jsonb is distinct from (select jsonb_build_object('status',c.status,'current_step',c.current_step) from public.clients c where c.id=current_setting('review.client_id')::uuid) then raise exception 'FAIL client access/progress fields changed'; end if;
  if not exists(select 1 from public.profiles where id=current_setting('review.client_user_id')::uuid and role='client' and client_id=current_setting('review.client_id')::uuid) then raise exception 'FAIL client assignment changed'; end if;
  if (select notes from public.agency_client_management where client_id=current_setting('review.client_id')::uuid) <> 'NOTE FICTIVE / TEST RLS / ROLLBACK' then raise exception 'FAIL denied client write changed note'; end if;
  raise notice 'PASS status/current_step/profile assignment unchanged. Rolling back ALL test writes.';
end;
$$;
rollback;
-- Si une assertion échoue : exécuter ROLLBACK dans cette même session avant reprise.
-- Ceci teste la RLS PostgreSQL avec des claims contrôlés en SQL, pas Supabase Auth
-- via navigateur. Vérifier également deux sessions simultanées / API après accord.
