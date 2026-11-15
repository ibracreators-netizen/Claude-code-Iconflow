-- ============================================================================
-- RETOUR ARRIÈRE de 0023_marketing_ads.sql
-- Supprime la copie des dépenses publicitaires par campagne. Rien n'est modifié dans Meta ni dans la
-- connexion Meta de Studio ; les chiffres se rechargent par une synchronisation si la migration est réappliquée.
-- ============================================================================
drop table if exists public.marketing_ad_insights;
delete from public.marketing_settings where key = 'ads';
update public.marketing_settings set value = jsonb_build_object('version', 22) where key = 'schema';
