-- ============================================================================
-- RETOUR ARRIÈRE de 0017_leads_inbox.sql
--
-- ATTENTION : supprime la boîte de réception et donc les leads qu'elle contient.
-- Avant de lancer ce script, exporter la table :
--   copy (select * from public.leads_inbox) to stdout with csv header;
-- Les prospects déjà créés à partir de ces leads NE sont PAS supprimés.
-- Avant ce script : remettre sur le site l'ancienne adresse d'envoi
-- (voir docs/features/marketing.md, « Revenir à l'ancienne route »).
-- ============================================================================
drop function if exists public.lead_inbox_receive(jsonb);
drop trigger if exists leads_inbox_no_delete on public.leads_inbox;
drop trigger if exists leads_inbox_touch on public.leads_inbox;
drop table if exists public.leads_inbox;
drop function if exists public.leads_inbox_no_delete();
drop table if exists public.marketing_lead_sites;

-- Colonnes d'origine du lead sur les prospects (perte de ces trois informations).
alter table public.marketing_prospects drop column if exists site;
alter table public.marketing_prospects drop column if exists landing_page;
alter table public.marketing_prospects drop column if exists referrer;

-- Droit « espace Marketing » : définition d'avant 0017 (sans le module Réception).
create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array'
                and p.permissions ?| array['marketing_dashboard','marketing_prospects','marketing_calendrier','marketing_relances','marketing_reglages']))
    from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.my_has_marketing() from public;
grant execute on function public.my_has_marketing() to authenticated, anon;
