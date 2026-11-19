-- ============================================================================
-- Test migration 0018 (contacts, pipeline, tâches). ROLLBACK à la fin : rien n'est gardé.
-- À lancer sur une base de TEST, jamais sur la production.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('dddd0000-0000-4000-8000-000000000001','admin@icon-flow.test');
insert into auth.users (id, email) values ('dddd0000-0000-4000-8000-000000000002','studio@icon-flow.test');
insert into auth.users (id, email) values ('dddd0000-0000-4000-8000-000000000003','ventes@icon-flow.test');
update profiles set role='agency', permissions=null where id='dddd0000-0000-4000-8000-000000000001';
update profiles set role='agency', permissions='["livrables","briefs"]'::jsonb where id='dddd0000-0000-4000-8000-000000000002';
update profiles set role='agency', permissions='["marketing_prospects","marketing_taches"]'::jsonb where id='dddd0000-0000-4000-8000-000000000003';

-- ── 1. Téléphone normalisé ──
do $$ begin
  if marketing_phone_norm('06 12 34 56 78') <> '+33612345678' or marketing_phone_norm('+33 (0)6 12 34 56 78') <> '+33612345678'
     or marketing_phone_norm('0033612345678') <> '+33612345678' or marketing_phone_norm('+1 (555) 123-4567') <> '+15551234567'
     or marketing_phone_norm('') is not null then raise exception 'FAIL normalisation du téléphone'; end if;
  raise notice 'PASS téléphone normalisé (formats français et étrangers)';
end $$;

-- ── 2. Étape et ancien statut restent cohérents, quel que soit le code qui écrit ──
do $$ declare p marketing_prospects; s_nouveau uuid; s_audit uuid; s_gagne uuid; begin
  select id into s_nouveau from marketing_pipeline_stages where key='nouveau_lead';
  select id into s_audit from marketing_pipeline_stages where key='audit_reserve';
  select id into s_gagne from marketing_pipeline_stages where key='gagne';
  if (select count(*) from marketing_pipeline_stages where is_system) <> 7 then raise exception 'FAIL les sept étapes d''origine ne sont pas là'; end if;
  -- Ancien code : il n'écrit que le statut (ancienne route d'opt-in).
  insert into marketing_prospects (name, email, status) values ('Ancien code', 'ancien@exemple.fr', 'nouveau') returning * into p;
  if p.stage_id <> s_nouveau then raise exception 'FAIL insertion sans étape : étape non déduite du statut'; end if;
  -- Ancien code : la réservation interne passe le statut à « reserve ».
  update marketing_prospects set status='reserve' where id=p.id returning * into p;
  if p.stage_id <> s_audit then raise exception 'FAIL statut « reserve » : étape non suivie'; end if;
  -- Nouveau code : il écrit l'étape, le statut suit.
  update marketing_prospects set stage_id=s_gagne where id=p.id returning * into p;
  if p.status <> 'converti' or p.stage_changed_at is null then raise exception 'FAIL étape « Gagné » : ancien statut non suivi'; end if;
  -- Valeurs refusées.
  begin update marketing_prospects set call_result='inconnu' where id=p.id; raise exception 'FAIL résultat d''appel inconnu accepté';
  exception when check_violation then null; end;
  begin update marketing_prospects set outcome='inconnu' where id=p.id; raise exception 'FAIL issue inconnue acceptée';
  exception when check_violation then null; end;
  raise notice 'PASS étape et ancien statut cohérents (ancien code et nouveau code)';
end $$;

-- ── 3. Une fiche contact par email ; dernière activité tenue à jour ──
do $$ declare c uuid; p uuid; begin
  insert into marketing_contacts (name, email, phone, phone_norm) values ('Jean', 'Jean@Exemple.fr', '06 12 34 56 78', marketing_phone_norm('06 12 34 56 78')) returning id into c;
  begin insert into marketing_contacts (name, email) values ('Doublon', 'jean@exemple.fr'); raise exception 'FAIL deux contacts avec le même email (casse différente)';
  exception when unique_violation then null; end;
  insert into marketing_prospects (name, contact_id, status) values ('Jean', c, 'nouveau') returning id into p;
  insert into marketing_prospect_events (prospect_id, kind, data) values (p, 'note', '{}'::jsonb);
  if (select last_activity_at from marketing_contacts where id=c) is null then raise exception 'FAIL dernière activité du contact non mise à jour'; end if;
  raise notice 'PASS contacts : email unique sans tenir compte de la casse, dernière activité tenue à jour';
end $$;

-- ── 4. Droits : un membre Studio ne voit rien ; un membre Ventes lit et écrit ; les étapes se modifient dans Réglages ──
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from marketing_contacts) <> 0 or (select count(*) from marketing_tasks) <> 0 or (select count(*) from marketing_pipeline_stages) <> 0 then raise exception 'FAIL membre Studio lit des données Marketing'; end if;
  begin insert into marketing_contacts (name) values ('Intrus'); raise exception 'FAIL membre Studio crée un contact';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS membre Studio : contacts, tâches et étapes invisibles et non modifiables';
end $$;
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000003',true);
do $$ declare p uuid; n int; begin
  if (select count(*) from marketing_contacts) < 1 or (select count(*) from marketing_pipeline_stages) <> 7 then raise exception 'FAIL membre Ventes ne lit pas contacts ou étapes'; end if;
  select id into p from marketing_prospects where name='Jean';
  insert into marketing_tasks (prospect_id, title, assignee_id, due_at) values (p, 'À appeler', 'dddd0000-0000-4000-8000-000000000003', now() + interval '1 day');
  if (select count(*) from marketing_tasks where kind='a_appeler' and status='ouverte') <> 1 then raise exception 'FAIL tâche « À appeler » non créée'; end if;
  update marketing_pipeline_stages set name='Piraté' where key='gagne'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL membre sans le module Réglages modifie une étape'; end if;
  begin insert into marketing_tasks (prospect_id, title, kind) values (p, 'x', 'inconnu'); raise exception 'FAIL type de tâche inconnu accepté';
  exception when check_violation then null; end;
  raise notice 'PASS membre Ventes : contacts et tâches en lecture et écriture, étapes en lecture seule';
end $$;
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
  update marketing_pipeline_stages set name='Signé' where key='gagne'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas renommer une étape'; end if;
  raise notice 'PASS administrateur : étapes modifiables';
end $$;

-- ── 5. Le public n'a aucun accès ──
reset role;
set local role anon;
do $$ begin
  begin perform count(*) from marketing_contacts; raise exception 'FAIL anon lit les contacts';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from marketing_tasks; raise exception 'FAIL anon lit les tâches';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS public : aucun accès aux contacts ni aux tâches';
end $$;

reset role;
rollback;
