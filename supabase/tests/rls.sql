-- ============================================================================
-- Tests RLS + RPC — Iconflow Studio. Tout est ROLLBACK à la fin.
-- Exécution locale : psql -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- (nécessite auth.users / auth.uid() : réel sur Supabase, shim en local).
-- ============================================================================
begin;
set local search_path = public;

-- Fixtures
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001','ibracreators@gmail.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test'),
  ('cccccccc-0000-4000-8000-000000000001','client@autre.test');
insert into clients (id, name, slug) values
  ('11111111-0000-4000-8000-000000000001','Lashéa','lashea'),
  ('22222222-0000-4000-8000-000000000001','Autre','autre');
-- Le trigger handle_new_user a créé les profils ; on rattache les clients.
update profiles set role='client', client_id='11111111-0000-4000-8000-000000000001' where id='bbbbbbbb-0000-4000-8000-000000000001';
update profiles set role='client', client_id='22222222-0000-4000-8000-000000000001' where id='cccccccc-0000-4000-8000-000000000001';

do $$ begin
  if (select role from profiles where id='aaaaaaaa-0000-4000-8000-000000000001') <> 'agency' then raise exception 'FAIL admin email should be agency'; end if;
  raise notice 'PASS trigger profil : email admin => agency';
end $$;

-- ── Session AGENCE ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into briefs (id, client_id, month, kind, title) values ('b0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'Script 01');
insert into briefs (id, client_id, month, kind, title) values ('b0000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'statique', 'Statique 01');
insert into livrables (id, client_id, month, kind, title, file_url) values ('d0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'V1', 'https://f.io/x');
insert into brain_entries (client_id, section, kind, title, content) values ('11111111-0000-4000-8000-000000000001','Identité','note','Secret','Réservé agence');
insert into documents (id, title, client_id, shared_with_client) values ('e0000000-0000-4000-8000-000000000001','Stratégie','11111111-0000-4000-8000-000000000001', true);
insert into documents (id, title, client_id, shared_with_client) values ('e0000000-0000-4000-8000-000000000002','Interne','11111111-0000-4000-8000-000000000001', false);
insert into invoices (id, number, client_id, status) values ('f0000000-0000-4000-8000-000000000001', next_invoice_number('facture'), '11111111-0000-4000-8000-000000000001', 'envoyee');
insert into invoices (id, number, client_id, status) values ('f0000000-0000-4000-8000-000000000002', next_invoice_number('facture'), '11111111-0000-4000-8000-000000000001', 'brouillon');

do $$ declare b briefs; begin
  select * into b from agency_transition_brief('b0000000-0000-4000-8000-000000000001','attente_ibra');
  if b.status <> 'attente_ibra' then raise exception 'FAIL redaction->attente_ibra'; end if;
  select * into b from agency_transition_brief('b0000000-0000-4000-8000-000000000001','attente_client');
  if b.status <> 'attente_client' or b.validated_by is null then raise exception 'FAIL attente_ibra->attente_client'; end if;
  if (select count(*) from validations where brief_id=b.id and item_kind='script') <> 1 then raise exception 'FAIL validation agence tracée'; end if;
  begin perform agency_transition_brief('b0000000-0000-4000-8000-000000000001','valide'); raise exception 'FAIL agence ne doit pas valider à la place du client';
  exception when raise_exception then if sqlerrm not like 'wrong_state:%' then raise; end if; end;
  select * into b from agency_transition_brief('b0000000-0000-4000-8000-000000000002','attente_ibra');
  select * into b from agency_transition_brief('b0000000-0000-4000-8000-000000000002','valide');
  if b.status <> 'valide' then raise exception 'FAIL statique validé par Ibra'; end if;
  raise notice 'PASS circuit brief agence (vidéo + statique)';
end $$;

do $$ declare l livrables; begin
  select * into l from transition_livrable('d0000000-0000-4000-8000-000000000001','attente_client');
  if l.status <> 'attente_client' then raise exception 'FAIL livrable en_controle->attente_client'; end if;
  begin perform transition_livrable('d0000000-0000-4000-8000-000000000001','valide'); raise exception 'FAIL agence ne valide pas un livrable';
  exception when raise_exception then if sqlerrm not like 'wrong_state:%' then raise; end if; end;
  raise notice 'PASS circuit livrable agence';
end $$;

do $$ declare m agency_client_management; begin
  select * into m from agency_save_client_management('11111111-0000-4000-8000-000000000001','in_progress','Note',0);
  if m.revision <> 1 then raise exception 'FAIL revision'; end if;
  begin perform agency_save_client_management('11111111-0000-4000-8000-000000000001','completed','x',0); raise exception 'FAIL stale accepted';
  exception when raise_exception then if sqlerrm <> 'stale_revision' then raise; end if; end;
  raise notice 'PASS classement agence (CAS)';
end $$;

-- ── Session CLIENT Lashéa ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; b briefs; l livrables; begin
  if my_role() <> 'client' then raise exception 'FAIL role client'; end if;
  if (select count(*) from clients) <> 1 then raise exception 'FAIL client voit % clients', (select count(*) from clients); end if;
  if exists (select 1 from brain_entries) then raise exception 'FAIL client voit brain_entries'; end if;
  if (select count(*) from documents) <> 1 then raise exception 'FAIL client voit documents non partagés'; end if;
  if (select count(*) from invoices) <> 1 then raise exception 'FAIL client voit les brouillons de facture'; end if;
  if exists (select 1 from tasks) then raise exception 'FAIL client voit tasks'; end if;
  if exists (select 1 from knowledge) then raise exception 'FAIL client voit knowledge'; end if;
  -- Décision script
  r := client_decide_script('b0000000-0000-4000-8000-000000000001','correction','Trop long');
  select * into b from briefs where id='b0000000-0000-4000-8000-000000000001';
  if b.status <> 'redaction' or b.script_version <> 2 then raise exception 'FAIL correction => redaction + v2'; end if;
  begin perform client_decide_script('b0000000-0000-4000-8000-000000000001','valide'); raise exception 'FAIL decision hors état';
  exception when raise_exception then if sqlerrm not like 'wrong_state:%' then raise; end if; end;
  begin perform client_decide_script('b0000000-0000-4000-8000-000000000002','valide'); raise exception 'FAIL statique client';
  exception when raise_exception then if sqlerrm <> 'static_brief_ibra_only' and sqlerrm not like 'wrong_state:%' then raise; end if; end;
  -- Décision livrable
  select * into l from transition_livrable('d0000000-0000-4000-8000-000000000001','valide','Parfait');
  if l.status <> 'valide' then raise exception 'FAIL client valide livrable'; end if;
  if (select count(*) from validations where item_ref='d0000000-0000-4000-8000-000000000001' and decision='valide') <> 1 then raise exception 'FAIL validation livrable tracée'; end if;
  -- Écritures autorisées
  insert into messages (client_id, author_id, body) values ('11111111-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','Hello');
  insert into files (name, path, client_id, folder, uploaded_by) values ('x.pdf','clients/11111111-0000-4000-8000-000000000001/depot/x.pdf','11111111-0000-4000-8000-000000000001','Dépôt client','bbbbbbbb-0000-4000-8000-000000000001');
  -- Écritures interdites
  begin insert into files (name, path, client_id, folder, uploaded_by) values ('y.pdf','p','11111111-0000-4000-8000-000000000001','Exports','bbbbbbbb-0000-4000-8000-000000000001'); raise exception 'FAIL client écrit hors Dépôt client';
  exception when insufficient_privilege then null; end;
  begin insert into tasks (title) values ('x'); raise exception 'FAIL client crée une tâche';
  exception when insufficient_privilege then null; end;
  begin update clients set name='Hack' where id='11111111-0000-4000-8000-000000000001'; if found then raise exception 'FAIL client modifie client'; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'PASS périmètre client + décisions (script, livrable)';
end $$;

-- ── Session CLIENT Autre : isolation ────────────────────────────────────────
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from briefs) or exists (select 1 from livrables) or exists (select 1 from documents) or exists (select 1 from messages) or exists (select 1 from invoices) then raise exception 'FAIL isolation entre clients'; end if;
  begin perform client_decide_script('b0000000-0000-4000-8000-000000000001','valide'); raise exception 'FAIL décision sur brief étranger';
  exception when raise_exception then if sqlerrm not in ('wrong_client','brief_not_found') and sqlerrm not like 'wrong_state:%' then raise; end if; end;
  begin perform transition_livrable('d0000000-0000-4000-8000-000000000001','correction'); raise exception 'FAIL transition livrable étranger';
  exception when raise_exception then if sqlerrm not in ('wrong_client','livrable_not_found') and sqlerrm not like 'wrong_state:%' then raise; end if; end;
  raise notice 'PASS isolation inter-clients';
end $$;

-- ── Anonyme ────────────────────────────────────────────────────────────────
reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists (select 1 from clients) then raise exception 'FAIL anon lit clients'; end if;
  if exists (select 1 from tasks) or exists (select 1 from documents) or exists (select 1 from messages) then raise exception 'FAIL anon lit des données'; end if;
  raise notice 'PASS anonyme sans accès';
end $$;

reset role;
rollback;
