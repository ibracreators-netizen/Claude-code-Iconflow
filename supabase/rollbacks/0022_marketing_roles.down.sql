-- ============================================================================
-- RETOUR ARRIÈRE de 0022_marketing_roles.sql
--
-- Les comptes commerciaux (rôle « marketing ») perdent tout accès : leur accès est RETIRÉ
-- (disabled_at) avant de revenir aux anciennes règles, qui ne les connaissent pas.
-- Ils ne sont pas supprimés. À lancer après avoir remis en ligne une version de
-- l'application antérieure à la phase 6.
-- ============================================================================
update public.profiles set disabled_at = coalesce(disabled_at, now()) where role = 'marketing';

drop function if exists public.marketing_funnel_tasks();
drop function if exists public.marketing_funnel_appointments();
drop function if exists public.marketing_funnel_prospects();
drop function if exists public.marketing_members();

-- Règles d'avant : par module seulement.
drop policy if exists mkt_prospects_rw on public.marketing_prospects;
create policy mkt_prospects_rw on public.marketing_prospects for all to authenticated
  using (my_has_module('marketing_prospects')) with check (my_has_module('marketing_prospects'));
drop policy if exists mkt_contacts_rw on public.marketing_contacts;
create policy mkt_contacts_rw on public.marketing_contacts for all to authenticated
  using (my_has_module('marketing_contacts') or my_has_module('marketing_prospects'))
  with check (my_has_module('marketing_contacts') or my_has_module('marketing_prospects'));
drop policy if exists mkt_tasks_rw on public.marketing_tasks;
create policy mkt_tasks_rw on public.marketing_tasks for all to authenticated
  using (my_has_module('marketing_taches') or my_has_module('marketing_prospects'))
  with check (my_has_module('marketing_taches') or my_has_module('marketing_prospects'));
drop policy if exists mkt_events_rw on public.marketing_prospect_events;
create policy mkt_events_rw on public.marketing_prospect_events for all to authenticated
  using (my_has_module('marketing_prospects')) with check (my_has_module('marketing_prospects'));
drop policy if exists mkt_appts_rw on public.marketing_appointments;
create policy mkt_appts_rw on public.marketing_appointments for all to authenticated
  using (my_has_module('marketing_calendrier')) with check (my_has_module('marketing_calendrier'));
drop policy if exists mkt_calendar_events_read on public.marketing_calendar_events;
create policy mkt_calendar_events_read on public.marketing_calendar_events for select to authenticated
  using (my_has_module('marketing_calendrier'));
drop function if exists public.mkt_sees_all();

-- Fonctions de droits : définitions d'avant 0022.
create or replace function public.my_has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or p_module in ('dashboard','parametres')
            or (jsonb_typeof(p.permissions) = 'array' and p.permissions ? p_module))
    from public.profiles p where p.id = auth.uid()), false)
$$;
create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array'
                and p.permissions ?| array['marketing_dashboard','marketing_reception','marketing_contacts','marketing_prospects','marketing_taches','marketing_calendrier','marketing_relances','marketing_reglages']))
    from public.profiles p where p.id = auth.uid()), false)
$$;
create or replace function public.avatars_purge_expired(p_client uuid, p_days int default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() = 'client' and p_client is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  delete from public.avatars
   where client_id = p_client and archived_at is not null
     and archived_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics n = row_count;
  return n;
end $$;

alter table public.profiles drop constraint if exists profiles_marketing_no_client;
alter table public.profiles drop constraint if exists profiles_marketing_role_check;
alter table public.profiles drop column if exists marketing_role;
update public.marketing_settings set value = jsonb_build_object('version', 21) where key = 'schema';
