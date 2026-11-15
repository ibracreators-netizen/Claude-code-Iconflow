-- ============================================================================
-- RETOUR ARRIÈRE de 0025_marketing_automations.sql
-- Supprime le journal des automatisations et les propositions de création de client en attente.
-- Les clients déjà créés dans Studio ne sont pas touchés. Avant de lancer : éteindre les six
-- règles dans Marketing › Réglages › Automatisations (ou supprimer la ligne « automations »).
-- ============================================================================
drop table if exists public.marketing_client_proposals;
drop table if exists public.marketing_automation_runs;
update public.leads_inbox set alert_status = null where alert_status = 'desactivee';
alter table public.leads_inbox drop constraint if exists leads_inbox_alert_status_check;
alter table public.leads_inbox add constraint leads_inbox_alert_status_check
  check (alert_status is null or alert_status in ('envoyee','simulee','echec','aucun_destinataire'));
delete from public.marketing_settings where key in ('automations', 'automation_state');
update public.marketing_settings set value = jsonb_build_object('version', 24) where key = 'schema';
