-- ============================================================================
-- Tests Storage « studio » côté client (migration 0011). Tout est ROLLBACK à la fin.
-- Un client lit les fichiers partagés de son dossier, jamais les autres.
-- ============================================================================
begin;
set local search_path = public;

insert into clients (id, name, slug, status) values
  ('11111111-0000-4000-8000-000000000001','Lashéa','lashea','active'),
  ('11111111-0000-4000-8000-000000000002','Nova','nova','active');
insert into auth.users (id, email) values ('bbbbbbbb-0000-4000-8000-000000000001','client@lashea.test');
update profiles set client_id='11111111-0000-4000-8000-000000000001' where id='bbbbbbbb-0000-4000-8000-000000000001';

insert into files (name, path, mime, size, client_id, folder, shared_with_client) values
  ('Portrait.png',   'clients/11111111-0000-4000-8000-000000000001/avatars/1-portrait.png', 'image/png', 10, '11111111-0000-4000-8000-000000000001', 'Avatars', true),
  ('Contrat.pdf',    'clients/11111111-0000-4000-8000-000000000001/contrats/1-contrat.pdf', 'application/pdf', 10, '11111111-0000-4000-8000-000000000001', 'Contrats', false),
  ('Nova.png',       'clients/11111111-0000-4000-8000-000000000002/avatars/1-nova.png', 'image/png', 10, '11111111-0000-4000-8000-000000000002', 'Avatars', true);
insert into storage.objects (bucket_id, name) values
  ('studio','clients/11111111-0000-4000-8000-000000000001/avatars/1-portrait.png'),
  ('studio','clients/11111111-0000-4000-8000-000000000001/contrats/1-contrat.pdf'),
  ('studio','clients/11111111-0000-4000-8000-000000000002/avatars/1-nova.png');

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000001',true);
do $$
declare visible text[];
begin
  select array_agg(name order by name) into visible from storage.objects where bucket_id = 'studio';
  if visible is distinct from array['clients/11111111-0000-4000-8000-000000000001/avatars/1-portrait.png'] then
    raise exception 'FAIL client : fichiers lisibles = %', visible;
  end if;
  raise notice 'PASS client : lit son fichier partagé, ni le non partagé ni celui d''un autre client';
end $$;
reset role;

rollback;
