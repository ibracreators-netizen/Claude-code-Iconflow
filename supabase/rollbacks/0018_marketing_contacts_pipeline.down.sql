-- ============================================================================
-- RETOUR ARRIÈRE de 0018_marketing_contacts_pipeline.sql
--
-- ATTENTION : supprime les contacts, les étapes du pipeline et les tâches Marketing.
-- Les prospects restent, avec leur ancien statut (colonne `status`, jamais retirée).
-- Avant de lancer, exporter :
--   copy (select * from public.marketing_contacts) to stdout with csv header;
--   copy (select * from public.marketing_tasks) to stdout with csv header;
--   copy (select id, contact_id, stage_id, setter_id, closer_id, value, call_result, outcome, signed_amount, call_note
--           from public.marketing_prospects) to stdout with csv header;
-- À lancer APRÈS les retours arrière des migrations suivantes (0019 et plus), et après
-- avoir remis en ligne une version de l'application antérieure à la phase 2.
-- ============================================================================
drop trigger if exists marketing_events_contact_activity on public.marketing_prospect_events;
drop function if exists public.marketing_contact_touch_activity();
drop trigger if exists marketing_prospects_stage_sync on public.marketing_prospects;
drop function if exists public.marketing_prospects_stage_sync();

-- Les prospects dont le statut d'origine avait été regroupé (« Relancé ») le retrouvent,
-- sauf s'ils ont changé d'étape depuis.
update public.marketing_prospects p set status = e.data->>'ancien_statut'
  from public.marketing_prospect_events e
 where e.prospect_id = p.id and e.kind = 'migration_etape'
   and e.data->>'ancien_statut' in ('nouveau','relance','reserve','converti','perdu')
   and p.stage_id = (select id from public.marketing_pipeline_stages where key = e.data->>'etape');
delete from public.marketing_prospect_events where kind = 'migration_etape';

drop table if exists public.marketing_tasks;
alter table public.marketing_prospects drop constraint if exists marketing_prospects_call_result_check;
alter table public.marketing_prospects drop constraint if exists marketing_prospects_outcome_check;
alter table public.marketing_prospects
  drop column if exists contact_id, drop column if exists stage_id, drop column if exists stage_changed_at,
  drop column if exists title, drop column if exists value, drop column if exists setter_id, drop column if exists closer_id,
  drop column if exists call_result, drop column if exists outcome, drop column if exists signed_amount, drop column if exists call_note;
drop table if exists public.marketing_pipeline_stages;
drop table if exists public.marketing_contacts;
drop function if exists public.marketing_stage_key_for_status(text);
drop function if exists public.marketing_phone_norm(text);

-- Droit « espace Marketing » : définition de 0017.
create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array'
                and p.permissions ?| array['marketing_dashboard','marketing_reception','marketing_prospects','marketing_calendrier','marketing_relances','marketing_reglages']))
    from public.profiles p where p.id = auth.uid()), false)
$$;
update public.marketing_settings set value = jsonb_build_object('version', 17) where key = 'schema';
