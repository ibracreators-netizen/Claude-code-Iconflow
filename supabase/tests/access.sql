-- ============================================================================
-- Tests Droits par module au niveau base (migration 0005). Tout est ROLLBACK à la fin.
-- ============================================================================
begin;
set local search_path = public;

-- Fondateur (admin_emails) → agence, accès complet
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001','ibracreators@gmail.com');
-- Membres : profils complétés comme le fait le studio avec la clé service
insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-000000000002','mehdi@icon-flow.fr','{"full_name":"Mehdi"}'::jsonb);
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000003','eva@icon-flow.fr');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000004','paul@icon-flow.fr');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000005','dan@icon-flow.fr');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000006','sarah@icon-flow.fr');
update profiles set role='agency', permissions='["dashboard","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002';           -- Mehdi : livrables
update profiles set role='agency', permissions='["dashboard","equipe","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000003';  -- Eva : équipe + livrables
update profiles set role='agency', permissions='["dashboard","planning","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000004';            -- Paul : planning
update profiles set role='agency', permissions=null where id='aaaaaaaa-0000-4000-8000-000000000005';                                                      -- Dan : accès complet (sera retiré)
update profiles set role='agency', permissions=null where id='aaaaaaaa-0000-4000-8000-000000000006';                                                      -- Sarah : accès complet

-- Client et données
insert into clients (id, name, slug, status) values ('11111111-0000-4000-8000-000000000001','Lashéa','lashea','onboarding');
insert into agency_client_management (client_id, stage, updated_by) values ('11111111-0000-4000-8000-000000000001','in_progress','aaaaaaaa-0000-4000-8000-000000000001');
insert into auth.users (id, email) values ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test');
update profiles set client_id='11111111-0000-4000-8000-000000000001' where id='bbbbbbbb-0000-4000-8000-000000000001';
insert into invoices (id, number, client_id, status) values ('f0000000-0000-4000-8000-000000000001', next_invoice_number('facture'), '11111111-0000-4000-8000-000000000001', 'envoyee');
insert into livrables (id, client_id, month, kind, title, file_url, status) values ('d0000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'V1', 'https://f.io/x', 'en_controle');
insert into livrables (id, client_id, month, kind, title, file_url, status) values ('d0000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'V2', 'https://f.io/y', 'en_controle');
insert into tasks (id, title) values ('e0000000-0000-4000-8000-000000000001','Monter V1');
insert into activity_log (kind, actor_id, summary) values ('note','aaaaaaaa-0000-4000-8000-000000000002','Ancienne action de Mehdi');

-- Auto-inscription frauduleuse : rôle, client et invitant dans les métadonnées → ignorés
insert into auth.users (id, email, raw_user_meta_data) values ('cccccccc-0000-4000-8000-000000000003','pirate@evil.test',
  '{"role":"agency","client_id":"11111111-0000-4000-8000-000000000001","invited_by":"aaaaaaaa-0000-4000-8000-000000000001","full_name":"Pirate"}'::jsonb);

do $$ begin
  if (select role from profiles where id='aaaaaaaa-0000-4000-8000-000000000001') <> 'agency' then raise exception 'FAIL fondateur agence'; end if;
  if (select role || coalesce(client_id::text,'∅') || coalesce(invited_by::text,'∅') from profiles where id='cccccccc-0000-4000-8000-000000000003') <> 'client∅∅' then raise exception 'FAIL auto-inscription : métadonnées prises en compte'; end if;
  if (select display_name from profiles where id='cccccccc-0000-4000-8000-000000000003') <> 'Pirate' then raise exception 'FAIL nom affiché depuis les métadonnées'; end if;
  raise notice 'PASS trigger : aucun rôle, rattachement ni invitant pris des métadonnées';
end $$;

-- Rattrapage statut/étape (la migration est rejouable : on la relance sur des données incohérentes)
\i supabase/migrations/0005_access_rls.sql
set local client_min_messages = notice; -- la migration coupe les notices ; on les rétablit pour lire les PASS
do $$ begin
  if (select status from clients where id='11111111-0000-4000-8000-000000000001') <> 'active' then raise exception 'FAIL rattrapage : client onboarding classé en cours doit devenir actif'; end if;
  raise notice 'PASS rattrapage statut client ← étape pipeline';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- ── Mehdi (livrables seulement) ────────────────────────────────────────────
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from invoices) <> 0 then raise exception 'FAIL membre sans Facturation lit les factures'; end if;
  if (select count(*) from tasks) <> 0 then raise exception 'FAIL membre sans Tâches lit les tâches'; end if;
  if (select count(*) from clients) <> 1 then raise exception 'FAIL les noms de clients doivent rester lisibles'; end if;
  if (select count(*) from livrables) <> 2 then raise exception 'FAIL membre Livrables ne voit pas les livrables'; end if;
  if (select count(*) from profiles) < 7 then raise exception 'FAIL les profils (noms des collègues) doivent rester lisibles'; end if;
  begin
    insert into tasks (title) values ('Intrusion'); raise exception 'FAIL insertion tâche acceptée sans module';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into invoices (number, client_id, status) values ('X-1','11111111-0000-4000-8000-000000000001','envoyee'); raise exception 'FAIL insertion facture acceptée sans module';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update clients set name='Pwned' where id='11111111-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL membre sans Clients modifie une fiche client'; end if;
  update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL membre sans Équipe retire l''accès du fondateur'; end if;
  update profiles set permissions=null where id='aaaaaaaa-0000-4000-8000-000000000004';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL membre sans Équipe change les droits d''un collègue'; end if;
  -- Journal : signé par son auteur, jamais effacé
  begin
    insert into activity_log (kind, actor_id, summary) values ('note','aaaaaaaa-0000-4000-8000-000000000001','Faux'); raise exception 'FAIL journal : action attribuée à quelqu''un d''autre';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into activity_log (kind, actor_id, summary) values ('note','aaaaaaaa-0000-4000-8000-000000000002','Vraie action');
  delete from activity_log where actor_id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL journal effaçable'; end if;
  -- Livrable : transition autorisée (module Livrables)
  perform transition_livrable('d0000000-0000-4000-8000-000000000001','attente_client');
  if (select status from livrables where id='d0000000-0000-4000-8000-000000000001') <> 'attente_client' then raise exception 'FAIL transition livrable'; end if;
  if not exists (select 1 from activity_log where summary = 'V1 → Attente client') then raise exception 'FAIL libellé lisible dans le journal'; end if;
  -- Suivi agence : module Clients ou Pipeline requis
  begin
    perform agency_save_client_management('11111111-0000-4000-8000-000000000001','completed','x',1); raise exception 'FAIL suivi agence sans module';
  exception when others then if sqlerrm not like '%forbidden_module%' then raise; end if; end;
  -- Storage studio : Livrables suffit
  insert into storage.objects (bucket_id, name) values ('studio','clients/11111111-0000-4000-8000-000000000001/livrables/v1.mp4');
  raise notice 'PASS membre limité : lecture bornée au module, écritures refusées, journal signé, RPC gardées';
end $$;

-- ── Paul (planning seulement) : pas de livrables, pas de storage ───────────
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000004',true);
do $$ begin
  begin
    perform transition_livrable('d0000000-0000-4000-8000-000000000002','attente_client'); raise exception 'FAIL transition livrable sans module';
  exception when others then if sqlerrm not like '%forbidden_module%' then raise; end if; end;
  begin
    insert into storage.objects (bucket_id, name) values ('studio','clients/11111111-0000-4000-8000-000000000001/x.mp4'); raise exception 'FAIL storage sans module';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS membre Planning : livrables et storage refusés';
end $$;

-- ── Eva (équipe + livrables) : gère les comptes limités et clients, pas les administrateurs ──
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
  update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL membre Équipe limité retire l''accès d''un administrateur'; end if;
  update profiles set permissions='["dashboard","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000005';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL membre Équipe limité rétrograde un administrateur'; end if;
  update profiles set permissions='["dashboard","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL membre Équipe ne peut pas réduire un collègue limité'; end if;
  update profiles set permissions='["dashboard","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL membre Équipe ne peut pas donner un module qu''il possède'; end if;
  begin
    update profiles set permissions=null where id='aaaaaaaa-0000-4000-8000-000000000002'; raise exception 'FAIL accès complet accordé par un membre limité';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update profiles set permissions='["dashboard","factures","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002'; raise exception 'FAIL module non possédé accordé';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000004';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL membre Équipe ne peut pas retirer l''accès d''un collègue limité (module Planning qu''elle n''a pas)'; end if;
  update profiles set permissions='["dashboard","planning","livrables","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000004';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL ajouter un module possédé à un collègue qui en a d''autres'; end if;
  begin
    update profiles set permissions='["dashboard","planning","factures","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000004'; raise exception 'FAIL module non possédé ajouté';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update profiles set title='CMO' where id='bbbbbbbb-0000-4000-8000-000000000001';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL membre Équipe ne gère pas les comptes clients'; end if;
  raise notice 'PASS module Équipe : sous-ensemble de ses droits, administrateurs intouchables, clients gérés';
end $$;

-- ── Fondateur : tout, sauf supprimer le dernier administrateur ─────────────
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
  update profiles set permissions=null where id='aaaaaaaa-0000-4000-8000-000000000002';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL fondateur accorde l''accès complet'; end if;
  update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000005';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL fondateur retire un administrateur'; end if;
  update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000006';
  update profiles set permissions='["dashboard","parametres"]'::jsonb where id='aaaaaaaa-0000-4000-8000-000000000002';
  reset role;
  begin
    update profiles set disabled_at=now() where id='aaaaaaaa-0000-4000-8000-000000000001'; raise exception 'FAIL dernier administrateur désactivé';
  exception when others then if sqlerrm not like '%last_admin%' then raise; end if; end;
  raise notice 'PASS dernier administrateur protégé (même avec la clé service)';
end $$;

-- ── Dan : accès retiré → plus rien, même avec un jeton encore valide ───────
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000005',true);
do $$ begin
  if (select count(*) from clients) <> 0 then raise exception 'FAIL compte retiré lit encore les clients'; end if;
  if (select count(*) from livrables) <> 0 then raise exception 'FAIL compte retiré lit encore les livrables'; end if;
  if (select count(*) from profiles) <> 1 then raise exception 'FAIL compte retiré doit ne voir que son profil (pour l''écran « accès retiré »)'; end if;
  if (select disabled_at from profiles where id='aaaaaaaa-0000-4000-8000-000000000005') is null then raise exception 'FAIL disabled_at doit rester lisible'; end if;
  raise notice 'PASS compte retiré : coupé au niveau base';
end $$;

-- ── Client : rien ne change ─────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from clients) <> 1 then raise exception 'FAIL client ne voit plus son espace'; end if;
  if (select count(*) from invoices) <> 1 then raise exception 'FAIL client ne voit plus ses factures envoyées'; end if;
  if (select count(*) from profiles) <> 1 then raise exception 'FAIL client voit d''autres profils'; end if;
  raise notice 'PASS client : périmètre inchangé';
end $$;

reset role;
rollback;
