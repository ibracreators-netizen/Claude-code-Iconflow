-- ============================================================================
-- RETOUR ARRIÈRE de 0019_marketing_import.sql
-- Supprime les rapports d'import et les références externes. Les contacts et prospects
-- importés NE sont PAS supprimés ; mais sans ces références, relancer un import ou une
-- synchronisation ne reconnaîtra plus les fiches que par email ou téléphone.
-- Avant de lancer : copy (select * from public.marketing_external_refs) to stdout with csv header;
-- ============================================================================
drop table if exists public.marketing_imports;
drop table if exists public.marketing_external_refs;
update public.marketing_settings set value = jsonb_build_object('version', 18) where key = 'schema';
