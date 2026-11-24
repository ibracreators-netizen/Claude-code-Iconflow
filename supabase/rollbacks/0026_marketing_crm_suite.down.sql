-- ============================================================================
-- Retour arrière de 0026_marketing_crm_suite.sql
-- Supprime le suivi quotidien saisi par l'équipe, l'historique des comptes et la couleur des
-- colonnes. Les prospects, contacts, tâches et la chronologie (emails compris) ne sont pas touchés.
-- ============================================================================
drop table if exists public.marketing_kpi_entries;
drop table if exists public.marketing_team_log;
drop index if exists public.marketing_prospect_events_author_idx;
alter table public.marketing_pipeline_stages drop constraint if exists marketing_pipeline_stages_color_check;
alter table public.marketing_pipeline_stages drop column if exists color;
delete from public.marketing_settings where key = 'email_templates';
update public.marketing_settings set value = jsonb_build_object('version', 25) where key = 'schema';
