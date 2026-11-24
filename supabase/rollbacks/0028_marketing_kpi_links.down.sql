-- ============================================================================
-- Retour arrière de 0028_marketing_kpi_links.sql
-- Supprime les personnes autorisées par lien, leurs jetons (tous les liens /kpi/… cessent de marcher)
-- et leurs saisies. Le suivi quotidien des membres (marketing_kpi_entries) n'est pas touché.
-- Exporter marketing_kpi_person_entries avant si l'historique doit être gardé.
-- ============================================================================
drop function if exists public.marketing_kpi_link_people();
drop table if exists public.marketing_kpi_person_entries;
drop table if exists public.marketing_kpi_people;
update public.marketing_settings set value = jsonb_build_object('version', 26) where key = 'schema';
