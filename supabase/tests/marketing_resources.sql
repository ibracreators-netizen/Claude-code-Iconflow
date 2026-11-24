-- ============================================================================
-- Test migration 0024 (ressources, SOPs, onboarding). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
-- ============================================================================
begin;
set local search_path = public;
insert into auth.users (id, email) values
  ('ffff0000-0000-4000-8000-000000000001','admin@icon-flow.test'), ('ffff0000-0000-4000-8000-000000000002','setter@icon-flow.test'),
  ('ffff0000-0000-4000-8000-000000000003','closer@icon-flow.test'), ('ffff0000-0000-4000-8000-000000000004','client@icon-flow.test');
update profiles set role='agency', permissions=null where id='ffff0000-0000-4000-8000-000000000001';
update profiles set role='marketing', marketing_role='setter', client_id=null, permissions='["marketing_espace","marketing_ressources"]'::jsonb where id='ffff0000-0000-4000-8000-000000000002';
update profiles set role='marketing', marketing_role='closer', client_id=null, permissions='["marketing_espace","marketing_ressources"]'::jsonb where id='ffff0000-0000-4000-8000-000000000003';

do $$ declare cl uuid; fs uuid; fc uuid; ds uuid; begin
  insert into clients (name, slug) values ('Client test ressources', 'client-test-ressources') returning id into cl;
  update profiles set role='client', client_id=cl where id='ffff0000-0000-4000-8000-000000000004';
  if (select count(*) from document_folders where space='marketing') <> 12 then raise exception 'FAIL structure : % dossiers au lieu de 12', (select count(*) from document_folders where space='marketing'); end if;
  if (select count(*) from documents where space='marketing') <> 0 or (select count(*) from marketing_onboarding_steps) <> 0 then raise exception 'FAIL la structure n''est pas vide'; end if;
  select id into fs from document_folders where space='marketing' and marketing_role='setter' and name='SOPs';
  select id into fc from document_folders where space='marketing' and marketing_role='closer' and name='SOPs';
  insert into documents (title, kind, space, folder_id) values ('SOP setter', 'sop', 'marketing', fs) returning id into ds;
  insert into documents (title, kind, space, folder_id) values ('SOP closer', 'sop', 'marketing', fc);
  insert into documents (title, kind, client_id, shared_with_client) values ('Document Studio partagé', 'doc', cl, true);
  insert into documents (title, kind) values ('Document Studio interne', 'doc');
  begin insert into documents (title, kind, space, client_id) values ('Fuite', 'doc', 'marketing', cl); raise exception 'FAIL un document Marketing a pu être rattaché à un client';
  exception when check_violation then null; end;
  begin insert into documents (title, kind, space, shared_with_client) values ('Fuite', 'doc', 'marketing', true); raise exception 'FAIL un document Marketing a pu être partagé à un client';
  exception when check_violation then null; end;
  insert into marketing_onboarding_steps (role, title, document_id, position) values ('setter', 'Lire la SOP', ds, 10), ('setter', 'Écouter trois appels', null, 20), ('closer', 'Lire la trame', null, 10);
  raise notice 'PASS structure vide (12 dossiers, aucun contenu) ; un document Marketing ne peut être ni rattaché ni partagé à un client';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ffff0000-0000-4000-8000-000000000002',true);
do $$ declare n int; s uuid; begin
  if (select count(*) from document_folders) <> 4 or exists (select 1 from document_folders where marketing_role <> 'setter') then raise exception 'FAIL setter : voit % dossiers', (select count(*) from document_folders); end if;
  if (select count(*) from documents) <> 1 or (select title from documents) <> 'SOP setter' then raise exception 'FAIL setter : voit % document(s)', (select count(*) from documents); end if;
  if (select count(*) from marketing_onboarding_steps) <> 2 then raise exception 'FAIL setter : voit les étapes d''un autre rôle'; end if;
  begin insert into documents (title, kind, space) values ('Intrus', 'doc', 'marketing'); raise exception 'FAIL setter crée un document';
  exception when insufficient_privilege then null; end;
  update documents set title = 'piraté'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter modifie un document'; end if;
  begin insert into marketing_onboarding_steps (role, title) values ('setter', 'Intrus'); raise exception 'FAIL setter crée une étape';
  exception when insufficient_privilege then null; end;
  select id into s from marketing_onboarding_steps where title = 'Lire la SOP';
  insert into marketing_onboarding_progress (step_id, profile_id) values (s, 'ffff0000-0000-4000-8000-000000000002');
  begin insert into marketing_onboarding_progress (step_id, profile_id) values (s, 'ffff0000-0000-4000-8000-000000000003'); raise exception 'FAIL setter coche une étape pour un autre';
  exception when insufficient_privilege then null; end;
  if (select count(*) from marketing_onboarding_progress) <> 1 then raise exception 'FAIL progression'; end if;
  raise notice 'PASS setter : dossier, documents et étapes de son rôle en lecture seule ; il ne coche que sa propre progression';
end $$;
select set_config('request.jwt.claim.sub','ffff0000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from documents) <> 1 or (select title from documents) <> 'SOP closer' or (select count(*) from marketing_onboarding_steps) <> 1 or (select count(*) from marketing_onboarding_progress) <> 0 then raise exception 'FAIL closer : périmètre incorrect'; end if;
  raise notice 'PASS closer : seulement les ressources de son rôle, pas la progression des autres';
end $$;
select set_config('request.jwt.claim.sub','ffff0000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from documents) <> 1 or (select title from documents) <> 'Document Studio partagé' then raise exception 'FAIL compte client : voit % document(s)', (select count(*) from documents); end if;
  if (select count(*) from marketing_onboarding_steps) <> 0 then raise exception 'FAIL compte client lit l''onboarding'; end if;
  raise notice 'PASS compte client : son document partagé comme avant, aucune ressource Marketing';
end $$;
select set_config('request.jwt.claim.sub','ffff0000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from documents where space='marketing') <> 2 or (select count(*) from documents where space='studio') < 2 or (select count(*) from marketing_onboarding_progress) <> 1 then raise exception 'FAIL administrateur'; end if;
  update documents set title = 'SOP setter v2' where title = 'SOP setter';
  raise notice 'PASS administrateur : écrit les ressources, lit la progression de l''équipe ; les documents de Studio gardent leur espace';
end $$;
reset role;
rollback;
