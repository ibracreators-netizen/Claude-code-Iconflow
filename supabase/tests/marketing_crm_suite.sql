-- ============================================================================
-- Test migration 0026 (couleur des colonnes, suivi quotidien, historique d'équipe). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
-- ============================================================================
begin;
set local search_path = public;
insert into auth.users (id, email) values
  ('dddd0000-0000-4000-8000-000000000001','admin@icon-flow.test'), ('dddd0000-0000-4000-8000-000000000002','setter@icon-flow.test'),
  ('dddd0000-0000-4000-8000-000000000003','closer@icon-flow.test'), ('dddd0000-0000-4000-8000-000000000004','client@icon-flow.test'),
  ('dddd0000-0000-4000-8000-000000000005','membre@icon-flow.test');
update profiles set role='agency', permissions=null where id='dddd0000-0000-4000-8000-000000000001';
update profiles set role='marketing', marketing_role='setter', client_id=null, permissions='["marketing_espace","marketing_prospects","marketing_classement"]'::jsonb where id='dddd0000-0000-4000-8000-000000000002';
update profiles set role='marketing', marketing_role='closer', client_id=null, permissions='["marketing_espace","marketing_prospects","marketing_classement"]'::jsonb where id='dddd0000-0000-4000-8000-000000000003';
update profiles set role='agency', permissions='["marketing_prospects","marketing_classement"]'::jsonb where id='dddd0000-0000-4000-8000-000000000005';

do $$ declare cl uuid; p uuid; begin
  insert into clients (name, slug) values ('Client test crm', 'client-test-crm') returning id into cl;
  update profiles set role='client', client_id=cl where id='dddd0000-0000-4000-8000-000000000004';
  if (select (value->>'version')::int from marketing_settings where key='schema') < 26 then raise exception 'FAIL version de schéma'; end if;
  update marketing_pipeline_stages set color = 'violet' where key = 'followup';
  begin update marketing_pipeline_stages set color = 'fluo' where key = 'followup'; raise exception 'FAIL couleur inconnue acceptée';
  exception when check_violation then null; end;
  insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000003', current_date, '{"relances": 4}');
  begin insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000003', current_date, '{"relances": 9}'); raise exception 'FAIL deux saisies pour le même jour';
  exception when unique_violation then null; end;
  begin insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000003', current_date + 10, '{}'); raise exception 'FAIL saisie datée dans le futur';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000003', current_date - 1, '[1,2]'); raise exception 'FAIL suivi qui n''est pas un objet';
  exception when check_violation then null; end;
  insert into marketing_team_log (profile_id, actor_id, kind, data) values ('dddd0000-0000-4000-8000-000000000002', 'dddd0000-0000-4000-8000-000000000001', 'invitation', '{"role":"setter"}');
  begin insert into marketing_team_log (profile_id, kind) values ('dddd0000-0000-4000-8000-000000000002', 'nimporte'); raise exception 'FAIL type d''historique inconnu accepté';
  exception when check_violation then null; end;
  insert into marketing_prospects (name, email, setter_id) values ('Lead du setter', 'lead-setter@exemple.test', 'dddd0000-0000-4000-8000-000000000002') returning id into p;
  insert into marketing_prospects (name, email, closer_id) values ('Lead du closer', 'lead-closer@exemple.test', 'dddd0000-0000-4000-8000-000000000003');
  raise notice 'PASS couleur de colonne contrôlée ; une saisie par membre et par jour, jamais dans le futur ; historique typé';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
-- Setter : son suivi seulement, pas l'historique des comptes, email seulement sur ses leads.
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000002',true);
do $$ declare n int; mine uuid; other uuid; begin
  insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000002', current_date, '{"appels": 30}');
  if (select count(*) from marketing_kpi_entries) <> 1 then raise exception 'FAIL setter : voit le suivi d''un autre (% lignes)', (select count(*) from marketing_kpi_entries); end if;
  begin insert into marketing_kpi_entries (profile_id, day, metrics) values ('dddd0000-0000-4000-8000-000000000003', current_date - 1, '{"relances": 99}'); raise exception 'FAIL setter saisit pour un autre';
  exception when insufficient_privilege then null; end;
  update marketing_kpi_entries set metrics = '{"relances": 0}' where profile_id = 'dddd0000-0000-4000-8000-000000000003'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter modifie le suivi d''un autre'; end if;
  if (select count(*) from marketing_team_log) <> 0 then raise exception 'FAIL setter lit l''historique des comptes'; end if;
  begin insert into marketing_team_log (profile_id, kind) values ('dddd0000-0000-4000-8000-000000000002', 'role'); raise exception 'FAIL setter écrit dans l''historique des comptes';
  exception when insufficient_privilege then null; end;
  begin update marketing_pipeline_stages set color = 'rose' where key = 'followup'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL setter modifie une colonne'; end if;
  exception when insufficient_privilege then null; end;
  select id into mine from marketing_prospects where name = 'Lead du setter';
  insert into marketing_prospect_events (prospect_id, kind, data, created_by) values (mine, 'email', '{"sujet":"Bonjour","statut":"simule"}', 'dddd0000-0000-4000-8000-000000000002');
  if (select count(*) from marketing_prospects) <> 1 then raise exception 'FAIL setter voit un lead qui n''est pas le sien'; end if;
  raise notice 'PASS setter : son suivi quotidien seulement, aucun accès à l''historique des comptes ni aux colonnes, email journalisé sur son lead';
end $$;
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000003',true);
do $$ declare other uuid; begin
  if (select count(*) from marketing_kpi_entries) <> 1 or (select profile_id from marketing_kpi_entries) <> 'dddd0000-0000-4000-8000-000000000003' then raise exception 'FAIL closer : périmètre du suivi incorrect'; end if;
  if (select count(*) from marketing_prospect_events where kind = 'email') <> 0 then raise exception 'FAIL closer lit l''email d''un lead qui n''est pas le sien'; end if;
  raise notice 'PASS closer : son suivi seulement, pas les emails des leads des autres';
end $$;
-- Membre de l'agence avec KPI mais sans la page Équipe : lit tout le suivi, pas l'historique des comptes.
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000005',true);
do $$ begin
  if (select count(*) from marketing_kpi_entries) <> 2 then raise exception 'FAIL membre agence : ne lit pas le suivi de l''équipe'; end if;
  if (select count(*) from marketing_team_log) <> 0 then raise exception 'FAIL membre sans la page Équipe lit l''historique des comptes'; end if;
  raise notice 'PASS membre agence (KPI) : suivi de toute l''équipe lisible, historique des comptes réservé à la page Équipe';
end $$;
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
  if (select count(*) from marketing_team_log) <> 1 or (select count(*) from marketing_kpi_entries) <> 2 then raise exception 'FAIL administrateur : historique ou suivi invisibles'; end if;
  update marketing_kpi_entries set metrics = '{"appels": 31}' where profile_id = 'dddd0000-0000-4000-8000-000000000002'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas corriger un suivi'; end if;
  begin delete from marketing_team_log; raise exception 'FAIL l''historique des comptes a pu être vidé';
  exception when insufficient_privilege then null; end;
  update marketing_pipeline_stages set color = 'bleu' where key = 'followup'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas colorer une colonne'; end if;
  raise notice 'PASS administrateur : lit l''historique (non modifiable), corrige un suivi, colore une colonne';
end $$;
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from marketing_kpi_entries) <> 0 or (select count(*) from marketing_team_log) <> 0 then raise exception 'FAIL un compte client voit des données de l''équipe'; end if;
  raise notice 'PASS compte client du portail : rien';
end $$;
rollback;
