-- ============================================================================
-- Test migration 0022 (rôles Setter, Closer, Media buyer). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
-- Prouve, dans la base : chaque commercial ne voit que ce qui lui est attribué, le media buyer
-- n'a aucune coordonnée, aucun de ces rôles ne lit quoi que ce soit de Studio, et un compte
-- client du portail ne lit rien de Marketing.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values
  ('eeee0000-0000-4000-8000-000000000001','admin@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000002','setter-a@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000003','setter-b@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000004','closer@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000005','media@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000006','client@icon-flow.test');
update profiles set role='agency', permissions=null, display_name='Admin' where id='eeee0000-0000-4000-8000-000000000001';
update profiles set role='marketing', marketing_role='setter', client_id=null, display_name='Setter A', permissions='["marketing_espace","marketing_contacts","marketing_prospects","marketing_taches","marketing_calendrier","marketing_classement","marketing_ressources"]'::jsonb where id in ('eeee0000-0000-4000-8000-000000000002','eeee0000-0000-4000-8000-000000000003');
update profiles set display_name='Setter B' where id='eeee0000-0000-4000-8000-000000000003';
update profiles set role='marketing', marketing_role='closer', client_id=null, display_name='Closer', permissions='["marketing_espace","marketing_contacts","marketing_prospects","marketing_taches","marketing_calendrier","marketing_classement","marketing_ressources"]'::jsonb where id='eeee0000-0000-4000-8000-000000000004';
update profiles set role='marketing', marketing_role='media_buyer', client_id=null, display_name='Media', permissions='["marketing_dashboard","marketing_publicite","marketing_ressources"]'::jsonb where id='eeee0000-0000-4000-8000-000000000005';

-- Jeu de données (posé hors RLS) : un client Studio, deux prospects (A pour le setter A + closer, B pour le setter B).
do $$ declare cl uuid; ca uuid; cb uuid; pa uuid; pb uuid; begin
  insert into clients (name, slug) values ('Client Studio test', 'client-studio-test') returning id into cl;
  update profiles set role='client', client_id=cl where id='eeee0000-0000-4000-8000-000000000006';
  begin update profiles set client_id = cl where id='eeee0000-0000-4000-8000-000000000002'; raise exception 'FAIL un compte commercial a pu être rattaché à un client';
  exception when check_violation then null; end;
  insert into marketing_contacts (name, email, phone) values ('Contact A', 'contact-a@exemple.fr', '0611111111') returning id into ca;
  insert into marketing_contacts (name, email, phone) values ('Contact B', 'contact-b@exemple.fr', '0622222222') returning id into cb;
  insert into marketing_prospects (name, email, contact_id, setter_id, closer_id, landing_page, utm, signed_amount, outcome)
    values ('Contact A', 'contact-a@exemple.fr', ca, 'eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-000000000004', '/optin?email=contact-a@exemple.fr&utm_source=meta', '{"utm_campaign":"sprint"}', 4000, 'signe') returning id into pa;
  insert into marketing_prospects (name, email, contact_id, setter_id) values ('Contact B', 'contact-b@exemple.fr', cb, 'eeee0000-0000-4000-8000-000000000003') returning id into pb;
  insert into marketing_tasks (prospect_id, title, assignee_id) values (pa, 'À appeler A', 'eeee0000-0000-4000-8000-000000000002'), (pb, 'À appeler B', 'eeee0000-0000-4000-8000-000000000003');
  insert into marketing_prospect_events (prospect_id, kind) values (pa, 'note'), (pb, 'note');
  insert into marketing_appointments (prospect_id, starts_at, ends_at, source, external_id, closer_id) values (pa, '2027-02-01 09:00+00', '2027-02-01 09:30+00', 'iclosed', 't1', 'eeee0000-0000-4000-8000-000000000004'), (pb, '2027-02-01 09:00+00', '2027-02-01 09:30+00', 'iclosed', 't2', null);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- ── Setter A : seulement ce qui lui est attribué ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from marketing_prospects) <> 1 or (select name from marketing_prospects) <> 'Contact A' then raise exception 'FAIL setter A : voit % prospect(s)', (select count(*) from marketing_prospects); end if;
  if (select count(*) from marketing_contacts) <> 1 or (select email from marketing_contacts) <> 'contact-a@exemple.fr' then raise exception 'FAIL setter A : voit un contact qui ne lui est pas attribué'; end if;
  if (select count(*) from marketing_tasks) <> 1 or (select count(*) from marketing_prospect_events) <> 1 or (select count(*) from marketing_appointments) <> 1 then raise exception 'FAIL setter A : tâches, chronologie ou rendez-vous d''un autre visibles'; end if;
  update marketing_prospects set notes = 'piraté' where name = 'Contact B'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter A modifie le prospect du setter B'; end if;
  update marketing_contacts set name = 'piraté' where email = 'contact-b@exemple.fr'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter A modifie le contact du setter B'; end if;
  -- Il travaille normalement sur le sien.
  update marketing_prospects set notes = 'rappelé' where name = 'Contact A'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL setter A ne peut pas modifier son prospect'; end if;
  -- Il ne peut pas se servir : s'attribuer un prospect, ou donner le sien à un autre.
  begin update marketing_prospects set setter_id = 'eeee0000-0000-4000-8000-000000000003', closer_id = null where name = 'Contact A'; raise exception 'FAIL setter A a retiré son prospect de sa vue en le réattribuant';
  exception when insufficient_privilege then null; end;
  begin insert into marketing_prospects (name, setter_id) values ('Volé', 'eeee0000-0000-4000-8000-000000000003'); raise exception 'FAIL setter A crée un prospect attribué à un autre';
  exception when insufficient_privilege then null; end;
  insert into marketing_prospects (name, setter_id) values ('Le mien', 'eeee0000-0000-4000-8000-000000000002');
  -- Réception, relances, réglages, import : rien.
  if (select count(*) from leads_inbox) <> 0 or (select count(*) from marketing_scheduled_emails) <> 0 or (select count(*) from marketing_imports) <> 0 or (select count(*) from marketing_external_refs) <> 0 then raise exception 'FAIL setter A lit la réception, les relances ou les imports'; end if;
  update marketing_pipeline_stages set name = 'Piraté'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter A modifie les étapes'; end if;
  begin perform count(*) from marketing_google_accounts; raise exception 'FAIL setter A lit les comptes Google';
  exception when insufficient_privilege then null; end;
  -- Les fonctions « sans coordonnées » ne lui donnent pas l'entonnoir de toute l'agence… sauf le classement, qu'il a.
  if (select count(*) from marketing_members()) < 5 then raise exception 'FAIL setter A ne voit pas les membres de l''équipe (noms pour l''attribution)'; end if;
  raise notice 'PASS setter : seulement ses prospects, contacts, tâches, chronologie et rendez-vous ; ne peut ni se servir ni réattribuer';
end $$;

-- ── Closer : le prospect A lui est attribué comme closer ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from marketing_prospects) <> 1 or (select count(*) from marketing_contacts) <> 1 or (select count(*) from marketing_appointments) <> 1 then raise exception 'FAIL closer : périmètre incorrect'; end if;
  update marketing_prospects set call_result = 'present', outcome = 'signe', signed_amount = 4000 where name = 'Contact A';
  raise notice 'PASS closer : seulement ses prospects, saisie du résultat d''appel possible';
end $$;

-- ── Media buyer : l'entonnoir, sans aucune coordonnée ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000005',true);
do $$ declare r record; cols text; begin
  if (select count(*) from marketing_prospects) <> 0 or (select count(*) from marketing_contacts) <> 0 or (select count(*) from marketing_tasks) <> 0
     or (select count(*) from marketing_prospect_events) <> 0 or (select count(*) from marketing_appointments) <> 0 or (select count(*) from leads_inbox) <> 0 then raise exception 'FAIL media buyer lit des contacts, prospects, tâches ou leads'; end if;
  begin insert into marketing_contacts (name) values ('Intrus'); raise exception 'FAIL media buyer crée un contact';
  exception when insufficient_privilege then null; end;
  if (select count(*) from marketing_funnel_prospects()) < 2 or (select count(*) from marketing_funnel_appointments()) <> 2 then raise exception 'FAIL media buyer ne reçoit pas l''entonnoir'; end if;
  select * into r from marketing_funnel_prospects() where signed_amount = 4000;
  if r.landing_page <> '/optin' then raise exception 'FAIL la page d''entrée garde ses paramètres : %', r.landing_page; end if;
  select string_agg(a.attname, ',') into cols from pg_proc p join pg_type t on t.oid = p.prorettype, unnest(p.proargnames) as a(attname) where p.proname in ('marketing_funnel_prospects','marketing_funnel_appointments','marketing_funnel_tasks');
  if cols ~ '(^|,)(name|email|phone|notes|call_note|title|meeting_url)(,|$)' then raise exception 'FAIL une fonction d''entonnoir renvoie une coordonnée : %', cols; end if;
  if (select count(*) from marketing_funnel_tasks()) <> 0 then raise exception 'FAIL media buyer lit les tâches par la fonction du classement'; end if;
  raise notice 'PASS media buyer : aucun contact ni prospect lisible ; entonnoir disponible, sans nom, email, téléphone ni note';
end $$;

-- ── Aucun de ces rôles n'entre dans Studio ──
do $$ declare uid text; t text; n bigint; begin
  foreach uid in array array['eeee0000-0000-4000-8000-000000000002','eeee0000-0000-4000-8000-000000000004','eeee0000-0000-4000-8000-000000000005'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    foreach t in array array['clients','briefs','livrables','invoices','documents','document_folders','tasks','messages','files','metrics','integrations','activity','app_settings','avatars','validations','contacts'] loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        if n <> 0 then raise exception 'FAIL % lit % ligne(s) de la table Studio %', uid, n, t; end if;
      exception when insufficient_privilege then null; when undefined_table then null; end;
    end loop;
    begin insert into clients (name, slug) values ('Intrus', 'intrus'); raise exception 'FAIL % crée un client', uid;
    exception when insufficient_privilege then null; end;
    if (select count(*) from profiles) <> 1 then raise exception 'FAIL % lit les profils des autres', uid; end if;
    if my_has_module('dashboard') or my_has_module('clients') or my_has_module('factures') or my_has_module('equipe') or my_role() = 'agency' or my_is_full_access() then raise exception 'FAIL % a un droit Studio', uid; end if;
    begin perform avatars_purge_expired((select id from clients limit 1), 1); raise exception 'FAIL % a pu vider la corbeille d''avatars', uid;
    exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  end loop;
  raise notice 'PASS setter, closer, media buyer : aucune ligne de Studio lisible (clients, facturation, documents, équipe), aucune écriture';
end $$;

-- ── Un compte commercial ne peut pas se donner des droits ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  begin
    update profiles set permissions = null, role = 'agency' where id = 'eeee0000-0000-4000-8000-000000000002'; get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL un setter s''est donné l''accès complet'; end if;
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if my_is_full_access() or my_role() = 'agency' then raise exception 'FAIL élévation de droits'; end if;
  raise notice 'PASS un compte commercial ne peut pas modifier son rôle ni ses droits';
end $$;

-- ── Un compte client du portail ne lit rien de Marketing ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000006',true);
do $$ begin
  if (select count(*) from marketing_prospects) <> 0 or (select count(*) from marketing_contacts) <> 0 or (select count(*) from marketing_tasks) <> 0 or (select count(*) from marketing_appointments) <> 0
     or (select count(*) from marketing_pipeline_stages) <> 0 or (select count(*) from marketing_settings) <> 0 or (select count(*) from leads_inbox) <> 0
     or (select count(*) from marketing_funnel_prospects()) <> 0 or (select count(*) from marketing_members()) <> 0 then raise exception 'FAIL un compte client lit des données Marketing'; end if;
  raise notice 'PASS compte client du portail : aucune donnée Marketing lisible';
end $$;

-- ── L'administrateur voit tout ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from marketing_prospects) < 3 or (select count(*) from marketing_contacts) < 2 or (select count(*) from marketing_tasks) < 2 then raise exception 'FAIL l''administrateur ne voit pas tout'; end if;
  -- Témoin : les tables de Studio contiennent bien des lignes (le test « aucune ligne lisible » n'est pas vide de sens).
  if (select count(*) from clients) < 1 or (select count(*) from profiles) < 6 then raise exception 'FAIL témoin Studio'; end if;
  raise notice 'PASS administrateur : tout est visible';
end $$;

reset role;
rollback;
