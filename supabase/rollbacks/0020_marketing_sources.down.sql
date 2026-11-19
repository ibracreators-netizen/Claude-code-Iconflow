-- ============================================================================
-- RETOUR ARRIÈRE de 0020_marketing_sources.sql
--
-- ATTENTION : les rendez-vous venus d'un outil externe (source <> 'interne') sont SUPPRIMÉS,
-- car l'ancienne règle « pas deux rendez-vous confirmés à la même heure » ne les accepte pas.
-- Ils se rechargent par une nouvelle synchronisation si la migration est réappliquée.
-- Avant de lancer : copy (select * from public.marketing_appointments) to stdout with csv header;
-- Avant ce script : retirer la variable ICLOSED_API_KEY (plus de synchronisation).
-- ============================================================================
drop table if exists public.marketing_source_runs;
delete from public.marketing_appointments where source <> 'interne';
alter table public.marketing_appointments drop constraint if exists marketing_appointments_no_overlap;
alter table public.marketing_appointments drop constraint if exists marketing_appointments_result_check;
drop index if exists public.marketing_appointments_external_key;
alter table public.marketing_appointments
  drop column if exists source, drop column if exists external_id, drop column if exists contact_id, drop column if exists setter_id,
  drop column if exists closer_id, drop column if exists result, drop column if exists title, drop column if exists calendar_event_id;
alter table public.marketing_appointments add constraint marketing_appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'confirme');
update public.marketing_settings set value = jsonb_build_object('version', 19) where key = 'schema';
