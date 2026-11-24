-- ============================================================================
-- RETOUR ARRIÈRE de 0021_marketing_google_calendar.sql
-- Supprime les comptes Google connectés (jetons chiffrés compris) et la copie des événements.
-- Rien n'est modifié dans Google. Chaque membre devra reconnecter son compte si la migration
-- est réappliquée. Pour retirer aussi l'accès côté Google : myaccount.google.com/permissions.
-- ============================================================================
drop table if exists public.marketing_calendar_events;
drop table if exists public.marketing_google_accounts;
update public.marketing_settings set value = jsonb_build_object('version', 20) where key = 'schema';
