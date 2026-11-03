-- ============================================================================
-- Tests Storage « studio » côté client (migration 0011). Tout est ROLLBACK à la fin.
-- Un client lit les fichiers partagés de son dossier, jamais les autres — même
-- s'il enregistre une ligne de fichier « piégée » (nom = chemin) — et n'enregistre
-- de fichier que dans son dossier de dépôt.
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
  ('studio','clients/11111111-0000-4000-8000-000000000001/depot/1-piege'),
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

  -- Ligne « piégée » dans son dépôt (nom = chemin) : ne doit rien ouvrir de plus que ce fichier.
  insert into files (name, path, mime, size, client_id, folder, shared_with_client, uploaded_by) values
    ('clients/11111111-0000-4000-8000-000000000001/depot/1-piege', 'clients/11111111-0000-4000-8000-000000000001/depot/1-piege',
     'text/plain', 1, '11111111-0000-4000-8000-000000000001', 'Dépôt client', true, 'bbbbbbbb-0000-4000-8000-000000000001');
  select array_agg(name order by name) into visible from storage.objects where bucket_id = 'studio';
  if visible is distinct from array['clients/11111111-0000-4000-8000-000000000001/avatars/1-portrait.png', 'clients/11111111-0000-4000-8000-000000000001/depot/1-piege'] then
    raise exception 'FAIL ligne piégée : fichiers lisibles = %', visible;
  end if;
  raise notice 'PASS ligne piégée (nom = chemin) : le contrat non partagé reste illisible';

  -- Enregistrer un objet hors de son dépôt (pour le rendre lisible) : refusé.
  begin
    insert into files (name, path, mime, size, client_id, folder, shared_with_client, uploaded_by) values
      ('Contrat.pdf', 'clients/11111111-0000-4000-8000-000000000001/contrats/1-contrat.pdf', 'application/pdf', 10,
       '11111111-0000-4000-8000-000000000001', 'Dépôt client', true, 'bbbbbbbb-0000-4000-8000-000000000001');
    raise exception 'FAIL client : fichier enregistré hors de son dépôt';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS client : n''enregistre un fichier que dans son dossier de dépôt';
end $$;
reset role;

rollback;
