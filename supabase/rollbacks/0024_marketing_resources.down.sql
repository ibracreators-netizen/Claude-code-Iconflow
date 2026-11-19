-- ============================================================================
-- RETOUR ARRIÈRE de 0024_marketing_resources.sql
--
-- ATTENTION : supprime les documents et dossiers de l'espace Marketing (SOPs, ressources), les
-- étapes d'onboarding et la progression des membres. Les documents de Studio ne sont pas touchés.
-- Avant de lancer :
--   copy (select * from public.documents where space = 'marketing') to stdout with csv header;
--   copy (select * from public.marketing_onboarding_steps) to stdout with csv header;
-- ============================================================================
drop table if exists public.marketing_onboarding_progress;
drop table if exists public.marketing_onboarding_steps;
drop policy if exists documents_marketing_write on public.documents;
drop policy if exists documents_marketing_read on public.documents;
drop policy if exists folders_marketing_write on public.document_folders;
drop policy if exists folders_marketing_read on public.document_folders;
delete from public.documents where space = 'marketing';
delete from public.document_folders where space = 'marketing';
alter table public.documents drop constraint if exists documents_marketing_internal;
alter table public.documents drop constraint if exists documents_space_check;
alter table public.document_folders drop constraint if exists document_folders_space_check;
alter table public.document_folders drop constraint if exists document_folders_marketing_role_check;
drop index if exists public.documents_space_idx;
drop index if exists public.document_folders_space_idx;
alter table public.documents drop column if exists space;
alter table public.document_folders drop column if exists space, drop column if exists marketing_role;
drop function if exists public.my_marketing_role();
update public.marketing_settings set value = jsonb_build_object('version', 23) where key = 'schema';
