-- ============================================================================
-- Iconflow Studio — 0011 CORRECTIF : LECTURE DES FICHIERS PARTAGÉS PAR LE CLIENT
-- (idempotent, rejouable)
-- Dans la politique « studio_client_read » de 0002, la sous-requête comparait
-- f.path à « name » non qualifié : PostgreSQL le résolvait en files.name (le nom
-- affiché) et non en storage.objects.name (le chemin). La condition n'était donc
-- jamais vraie : un compte client ne pouvait ouvrir aucun fichier partagé.
-- Correctif : chemin qualifié (objects.name) et fichier rattaché au même client.
-- 0002 ne recrée la politique que si elle est absente : la rejouer ne revient
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
