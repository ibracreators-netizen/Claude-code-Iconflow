-- ============================================================================
-- Tests migration 0006 (étapes personnalisables, concepts, dossiers, intégrations, suppression client). ROLLBACK à la fin.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','ibracreators@gmail.com');           -- admin complet
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000002','mehdi@icon-flow.fr');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000003','sarah@icon-flow.fr');
update profiles set role='agency', permissions='["dashboard","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002';   -- Mehdi : pas de pipeline ni briefs
update profiles set role='agency', permissions='["dashboard","pipeline","briefs","documents","brain","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000003'; -- Sarah
insert into clients (id, name, slug, status) values ('11111111-0000-4000-8000-000000000001','Lashéa','lashea','active'), ('11111111-0000-4000-8000-000000000002','Nova','nova','active');
insert into auth.users (id, email) values ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test');
update profiles set client_id='11111111-0000-4000-8000-000000000001' where id='bbbbbbbb-0000-4000-8000-000000000001';
insert into briefs (id, client_id, month, kind, title, status, content) values
  ('b0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'Script 01', 'attente_client', '{"concept":"legacy"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'Script 02', 'redaction', '{}'::jsonb);
insert into livrables (id, client_id, month, kind, title, file_url) values ('d0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'Batch 1', 'https://f.io/x');
insert into files (name, path, client_id, folder, uploaded_by) values ('x.mp4','clients/11111111-0000-4000-8000-000000000001/exports/x.mp4','11111111-0000-4000-8000-000000000001','Exports','aaaaaaaa-0000-4000-8000-000000000001');
insert into tasks (title, client_id) values ('Monter V1','11111111-0000-4000-8000-000000000001');
insert into invoices (number, client_id, status) values (next_invoice_number('facture'),'11111111-0000-4000-8000-000000000001','envoyee');
insert into activity_log (kind, actor_id, client_id, summary) values ('note','aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','Historique Lashéa');
insert into activity_log (kind, actor_id, client_id, summary) values ('client.stage','aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','Lashéa → En cours');
insert into activity_log (kind, actor_id, client_id, summary) values ('invoice.sent','aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','Facture envoyée');

-- Reprise : la migration a créé un concept par brief existant à partir du contenu
\i supabase/migrations/0006_product.sql
set local client_min_messages = notice;
do $$ begin
  if (select count(*) from brief_concepts where brief_id='b0000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FAIL reprise : un concept par brief'; end if;
  if (select content->>'concept' from brief_concepts where brief_id='b0000000-0000-4000-8000-000000000001') <> 'legacy' then raise exception 'FAIL reprise : contenu du brief repris'; end if;
  if (select count(*) from pipeline_stages) <> 3 then raise exception 'FAIL étapes par défaut'; end if;
  if exists (select 1 from pg_constraint where conrelid='public.agency_client_management'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%stage%') then raise exception 'FAIL contrainte figée sur stage toujours présente'; end if;
  raise notice 'PASS migration 0006 : reprise des concepts, étapes par défaut, contrainte levée (rejouable)';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- ── Sarah (pipeline + briefs + documents + brain) ──
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000003',true);
do $$ declare n int; r record; begin
  insert into pipeline_stages (key, label, color, position) values ('scaling','Scaling','violet',3);
  perform agency_save_client_management('11111111-0000-4000-8000-000000000001','scaling','on scale',0);
  if (select stage from agency_client_management where client_id='11111111-0000-4000-8000-000000000001') <> 'scaling' then raise exception 'FAIL étape personnalisée refusée'; end if;
  if not exists (select 1 from activity_log where summary = 'Lashéa → Scaling') then raise exception 'FAIL libellé de l''étape dans le journal'; end if;
  begin
    perform agency_save_client_management('11111111-0000-4000-8000-000000000001','inconnue','x',1); raise exception 'FAIL étape inconnue acceptée';
  exception when others then if sqlerrm not like '%bad_stage%' then raise; end if; end;
  perform agency_delete_stage('scaling','in_progress');
  if (select stage from agency_client_management where client_id='11111111-0000-4000-8000-000000000001') <> 'in_progress' then raise exception 'FAIL report des clients à la suppression d''une étape'; end if;
  if exists (select 1 from pipeline_stages where key='scaling') then raise exception 'FAIL étape non supprimée'; end if;
  -- concepts : écriture avec le module Briefs
  insert into brief_concepts (brief_id, title, position, content) values ('b0000000-0000-4000-8000-000000000001','Concept 2',1,'{"concept":"v2"}'::jsonb);
  if (select count(*) from brief_concepts where brief_id='b0000000-0000-4000-8000-000000000001') <> 2 then raise exception 'FAIL ajout concept'; end if;
  -- dossiers
  insert into document_folders (id, name) values ('f0000000-0000-4000-8000-00000000000a','Stratégie');
  insert into documents (title, folder_id) values ('Plan Q4','f0000000-0000-4000-8000-00000000000a');
  delete from document_folders where id='f0000000-0000-4000-8000-00000000000a';
  if (select folder_id from documents where title='Plan Q4') is not null then raise exception 'FAIL document non détaché à la suppression du dossier'; end if;
  -- intégrations : réservé aux administrateurs
  begin
    insert into integrations (client_id, provider, account_id, access_token) values ('11111111-0000-4000-8000-000000000001','meta','act_1','secret'); raise exception 'FAIL membre limité crée une intégration';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- suppression définitive : réservée aux administrateurs
  begin
    perform agency_delete_client('11111111-0000-4000-8000-000000000002'); raise exception 'FAIL membre limité supprime un client';
  exception when others then if sqlerrm not like '%admin_only%' then raise; end if; end;
  raise notice 'PASS membre Pipeline/Briefs/Documents : étapes, concepts, dossiers ; intégrations et suppression refusées';
end $$;

-- ── Mehdi (livrables seulement) : rien de tout cela ──
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from pipeline_stages) <> 3 then raise exception 'FAIL les étapes doivent rester lisibles par l''agence'; end if;
  begin
    insert into pipeline_stages (key, label) values ('x','X'); raise exception 'FAIL étape créée sans module Pipeline';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into brief_concepts (brief_id, title) values ('b0000000-0000-4000-8000-000000000001','Intrus'); raise exception 'FAIL concept créé sans module Briefs';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if (select count(*) from integrations) <> 0 then raise exception 'FAIL intégrations visibles par un membre limité'; end if;
  if (select count(*) from brief_concepts) <> 3 then raise exception 'FAIL concepts non lisibles par l''agence'; end if;
  raise notice 'PASS membre Livrables : lecture des étapes et concepts, aucune écriture';
end $$;

-- ── Client : concepts des briefs soumis uniquement ──
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from brief_concepts) <> 2 then raise exception 'FAIL le client doit voir les concepts du brief soumis (2) et pas ceux du brief en rédaction'; end if;
  if (select count(*) from pipeline_stages) <> 0 then raise exception 'FAIL client voit les étapes'; end if;
  if (select count(*) from document_folders) <> 0 then raise exception 'FAIL client voit les dossiers'; end if;
  if (select count(*) from activity_log) <> 1 or exists (select 1 from activity_log where kind in ('note','client.stage','task.done')) then raise exception 'FAIL le client doit voir 1 événement (facture) et aucun événement interne, vu %', (select count(*) from activity_log); end if;
  raise notice 'PASS client : concepts des briefs visibles seulement, journal sans événements internes';
end $$;

-- ── Fondateur : intégration, puis suppression définitive ──
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
do $$ declare paths text[]; begin
  insert into integrations (client_id, provider, account_id, access_token) values ('11111111-0000-4000-8000-000000000001','meta','act_1','secret');
  if (select count(*) from integrations) <> 1 then raise exception 'FAIL intégration admin'; end if;
  select agency_delete_client('11111111-0000-4000-8000-000000000001') into paths;
  if array_length(paths, 1) <> 1 or paths[1] <> 'clients/11111111-0000-4000-8000-000000000001/exports/x.mp4' then raise exception 'FAIL chemins storage renvoyés : %', paths; end if;
  if exists (select 1 from clients where id='11111111-0000-4000-8000-000000000001') then raise exception 'FAIL client non supprimé'; end if;
  if exists (select 1 from briefs where client_id='11111111-0000-4000-8000-000000000001') or exists (select 1 from brief_concepts) or exists (select 1 from livrables where client_id='11111111-0000-4000-8000-000000000001') or exists (select 1 from tasks where client_id='11111111-0000-4000-8000-000000000001') or exists (select 1 from invoices where client_id='11111111-0000-4000-8000-000000000001') or exists (select 1 from integrations) or exists (select 1 from agency_client_management where client_id='11111111-0000-4000-8000-000000000001') then raise exception 'FAIL données du client restantes'; end if;
  if (select client_id from profiles where id='bbbbbbbb-0000-4000-8000-000000000001') is not null or (select disabled_at from profiles where id='bbbbbbbb-0000-4000-8000-000000000001') is null then raise exception 'FAIL compte client non coupé'; end if;
  if not exists (select 1 from activity_log where summary='Lashéa supprimé définitivement') then raise exception 'FAIL journal de suppression'; end if;
  if exists (select 1 from activity_log where client_id='11111111-0000-4000-8000-000000000001') then raise exception 'FAIL historique encore rattaché'; end if;
  raise notice 'PASS fondateur : intégration, suppression définitive complète (storage à nettoyer renvoyé, compte client coupé, journal conservé)';
end $$;

reset role;
rollback;
