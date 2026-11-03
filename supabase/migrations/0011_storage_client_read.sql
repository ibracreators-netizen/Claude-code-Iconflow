-- ============================================================================
-- Iconflow Studio — 0011 CORRECTIF SÉCURITÉ : FICHIERS CÔTÉ CLIENT
-- (idempotent, rejouable)
--
-- 1. storage.objects « studio_client_read » (0002) : la sous-requête comparait
--    f.path à « name » non qualifié, que PostgreSQL résout en files.name (le nom
--    affiché), pas en storage.objects.name (le chemin). La condition ne regardait
--    donc pas le fichier demandé : en temps normal elle n'était jamais vraie (le
--    client ne pouvait ouvrir aucun fichier partagé), mais il suffisait qu'une
--    ligne partagée ait path = name pour qu'un compte client lise TOUS les objets
--    de son dossier, y compris ceux qui ne lui sont pas partagés.
--    Correctif : chemin qualifié (objects.name) et fichier rattaché au même client.
-- 2. public.files « files_client_insert » (0002) : un client n'enregistre plus
--    qu'un fichier de son dossier de dépôt (clients/<son id>/depot/…), là où le
--    stockage le laisse téléverser — et non un objet quelconque de son dossier.
--
-- 0002 ne recrée ces politiques que si elles sont absentes : la rejouer ne revient
-- pas sur ce correctif.
-- ============================================================================
set client_min_messages = warning;

drop policy if exists studio_client_read on storage.objects;
create policy studio_client_read on storage.objects for select to authenticated
  using (
    bucket_id = 'studio'
    and (storage.foldername(objects.name))[1] = 'clients'
    and (storage.foldername(objects.name))[2] = my_client_id()::text
    and exists (
      select 1 from public.files f
      where f.path = objects.name and f.shared_with_client and f.client_id = my_client_id()
    )
  );

drop policy if exists files_client_insert on public.files;
create policy files_client_insert on public.files for insert to authenticated
  with check (
    client_id = my_client_id()
    and uploaded_by = auth.uid()
    and folder = 'Dépôt client'
    and path like 'clients/' || my_client_id()::text || '/depot/%'
  );
