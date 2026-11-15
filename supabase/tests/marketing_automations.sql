-- ============================================================================
-- Test migration 0025 (automatisations : journal, propositions de client). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
-- ============================================================================
begin;
set local search_path = public;
insert into auth.users (id, email) values
  ('eeee0000-0000-4000-8000-000000000001','admin@icon-flow.test'), ('eeee0000-0000-4000-8000-000000000002','setter@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000003','membre@icon-flow.test'), ('eeee0000-0000-4000-8000-000000000004','client@icon-flow.test');
update profiles set role='agency', permissions=null where id='eeee0000-0000-4000-8000-000000000001';
update profiles set role='marketing', marketing_role='setter', client_id=null, permissions='["marketing_espace","marketing_prospects","marketing_taches"]'::jsonb where id='eeee0000-0000-4000-8000-000000000002';
update profiles set role='agency', permissions='["marketing_reglages","marketing_prospects"]'::jsonb where id='eeee0000-0000-4000-8000-000000000003';

do $$ declare cl uuid; p uuid; begin
  insert into clients (name, slug) values ('Client test automatisations', 'client-test-automatisations') returning id into cl;
  update profiles set role='client', client_id=cl where id='eeee0000-0000-4000-8000-000000000004';
  if (select (value->>'version')::int from marketing_settings where key='schema') < 25 then raise exception 'FAIL version de schéma'; end if;
  insert into marketing_prospects (name, email, setter_id) values ('Prospect signé', 'signe@exemple.test', 'eeee0000-0000-4000-8000-000000000002') returning id into p;
  insert into marketing_automation_runs (rule, dedupe_key, prospect_id, action) values ('signed', 'signed:' || p, p, 'Passé en « Gagné »');
  begin insert into marketing_automation_runs (rule, dedupe_key, prospect_id, action) values ('signed', 'signed:' || p, p, 'doublon'); raise exception 'FAIL une règle a pu agir deux fois pour la même clé';
  exception when unique_violation then null; end;
  begin insert into marketing_automation_runs (rule, dedupe_key, action) values ('inconnue', 'x', 'x'); raise exception 'FAIL règle inconnue acceptée';
  exception when check_violation then null; end;
  insert into marketing_client_proposals (prospect_id) values (p);
  begin insert into marketing_client_proposals (prospect_id) values (p); raise exception 'FAIL deux propositions pour le même prospect';
  exception when unique_violation then null; end;
  if (select status from marketing_client_proposals where prospect_id = p) <> 'en_attente' or (select client_id from marketing_client_proposals where prospect_id = p) is not null then raise exception 'FAIL une proposition doit attendre la validation, sans client'; end if;
  insert into leads_inbox (request_id, payload, status, alert_status) values ('test-auto-0025', '{"email":"a@exemple.test"}'::jsonb, 'traite', 'desactivee');
  raise notice 'PASS une règle n''agit qu''une fois par clé ; une proposition par prospect, en attente, sans client ; alerte « désactivée » acceptée';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
-- Setter : ni le journal, ni les propositions.
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from marketing_automation_runs) <> 0 then raise exception 'FAIL setter lit le journal des automatisations'; end if;
  if (select count(*) from marketing_client_proposals) <> 0 then raise exception 'FAIL setter voit les propositions de client'; end if;
  update marketing_client_proposals set status = 'cree'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter valide une proposition'; end if;
  begin insert into marketing_automation_runs (rule, dedupe_key, action) values ('signed', 'intrus', 'x'); raise exception 'FAIL setter écrit dans le journal';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS setter : aucun accès au journal ni aux propositions';
end $$;
-- Membre de l'agence avec la page Réglages : lit le journal, ne décide pas d'une création de client.
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
  if (select count(*) from marketing_automation_runs) <> 1 then raise exception 'FAIL membre avec Réglages : ne lit pas le journal'; end if;
  begin update marketing_automation_runs set action = 'réécrit'; raise exception 'FAIL le journal a pu être réécrit';
  exception when insufficient_privilege then null; end;
  begin delete from marketing_automation_runs; raise exception 'FAIL le journal a pu être vidé';
  exception when insufficient_privilege then null; end;
  if (select count(*) from marketing_client_proposals) <> 0 then raise exception 'FAIL un membre sans accès complet voit les propositions'; end if;
  update marketing_client_proposals set status = 'cree'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL un membre sans accès complet valide une proposition'; end if;
  raise notice 'PASS membre avec Réglages : journal en lecture seule ; la création de client reste à l''administrateur';
end $$;
-- Administrateur : décide.
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
  if (select count(*) from marketing_client_proposals where status = 'en_attente') <> 1 then raise exception 'FAIL administrateur : proposition invisible'; end if;
  update marketing_client_proposals set status = 'ignoree', decided_by = 'eeee0000-0000-4000-8000-000000000001', decided_at = now(); get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur : décision refusée'; end if;
  begin update marketing_client_proposals set status = 'nimporte'; raise exception 'FAIL statut inconnu accepté';
  exception when check_violation then null; end;
  raise notice 'PASS administrateur : voit et décide les propositions';
end $$;
-- Compte client du portail : rien.
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from marketing_automation_runs) <> 0 or (select count(*) from marketing_client_proposals) <> 0 then raise exception 'FAIL un compte client voit des données d''automatisation'; end if;
  raise notice 'PASS compte client du portail : aucune donnée d''automatisation';
end $$;
rollback;
