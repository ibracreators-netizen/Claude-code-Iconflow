-- ============================================================================
-- Iconflow — 0022 RÔLES ET ACCÈS DE L'ESPACE MARKETING (Setter, Closer, Media buyer)
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0022_marketing_roles.down.sql
--
-- Principe : un vendeur n'est PAS un membre « agence ». Il reçoit un rôle à part, `marketing`.
-- Toutes les règles de l'espace Studio exigent le rôle `agency` : un compte `marketing` y est donc
-- refusé partout, sans qu'aucune règle de Studio ait été modifiée.
--
--   • Admin        : membre agence à accès complet (inchangé). Voit tout.
--   • Setter, Closer : seulement les prospects qui leur sont attribués, leurs contacts, leurs
--                      tâches, leurs rendez-vous. Appliqué ligne par ligne, dans la base.
--   • Media buyer  : l'entonnoir et la publicité, par des fonctions qui ne renvoient AUCUNE
--                    coordonnée (ni nom, ni email, ni téléphone). Aucun accès aux contacts.
-- ============================================================================
set client_min_messages = warning;

-- ─── Le rôle commercial ──────────────────────────────────────────────────────
alter table public.profiles add column if not exists marketing_role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_marketing_role_check') then
    alter table public.profiles add constraint profiles_marketing_role_check
      check (marketing_role is null or marketing_role in ('setter','closer','media_buyer'));
  end if;
  -- Un compte commercial n'est jamais rattaché à un client : il ne peut donc rien lire du portail client.
  if not exists (select 1 from pg_constraint where conname = 'profiles_marketing_no_client') then
    alter table public.profiles add constraint profiles_marketing_no_client check (role <> 'marketing' or client_id is null);
  end if;
end $$;

-- ─── Droit à un module : les comptes commerciaux n'ont que des modules Marketing ──
create or replace function public.my_has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.disabled_at is null and (
      (p.role = 'agency' and (p.permissions is null
            or p_module in ('dashboard','parametres')
            or (jsonb_typeof(p.permissions) = 'array' and p.permissions ? p_module)))
      -- Rôle commercial : uniquement des modules « marketing_… », et seulement ceux de sa liste.
      or (p.role = 'marketing' and p_module like 'marketing\_%'
            and jsonb_typeof(p.permissions) = 'array' and p.permissions ? p_module))
    from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.my_has_module(text) from public;
grant execute on function public.my_has_module(text) to authenticated, anon;

create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.disabled_at is null and (
      (p.role = 'agency' and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array' and exists (select 1 from jsonb_array_elements_text(p.permissions) e where e.value like 'marketing\_%'))))
      or (p.role = 'marketing' and jsonb_typeof(p.permissions) = 'array'
            and exists (select 1 from jsonb_array_elements_text(p.permissions) e where e.value like 'marketing\_%')))
    from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.my_has_marketing() from public;
grant execute on function public.my_has_marketing() to authenticated, anon;

-- « Voit tout » : un membre agence (dans la limite de ses modules). Un compte commercial ne voit que le sien.
create or replace function public.mkt_sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'agency' and p.disabled_at is null from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.mkt_sees_all() from public;
grant execute on function public.mkt_sees_all() to authenticated, anon;

-- ─── Accès ligne par ligne ───────────────────────────────────────────────────
drop policy if exists mkt_prospects_rw on public.marketing_prospects;
create policy mkt_prospects_rw on public.marketing_prospects for all to authenticated
  using (my_has_module('marketing_prospects') and (mkt_sees_all() or setter_id = auth.uid() or closer_id = auth.uid()))
  with check (my_has_module('marketing_prospects') and (mkt_sees_all() or setter_id = auth.uid() or closer_id = auth.uid()));

-- Contact : visible s'il a une affaire qui m'est attribuée (ou si je viens de le créer, le temps d'ouvrir son affaire).
drop policy if exists mkt_contacts_rw on public.marketing_contacts;
create policy mkt_contacts_rw on public.marketing_contacts for all to authenticated
  using ((my_has_module('marketing_contacts') or my_has_module('marketing_prospects'))
         and (mkt_sees_all() or created_by = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.contact_id = marketing_contacts.id)))
  with check ((my_has_module('marketing_contacts') or my_has_module('marketing_prospects'))
         and (mkt_sees_all() or created_by = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.contact_id = marketing_contacts.id)));
-- (La sous-requête sur marketing_prospects est elle-même filtrée par la règle ci-dessus :
--  un commercial n'y trouve que les affaires qui lui sont attribuées.)

drop policy if exists mkt_tasks_rw on public.marketing_tasks;
create policy mkt_tasks_rw on public.marketing_tasks for all to authenticated
  using ((my_has_module('marketing_taches') or my_has_module('marketing_prospects'))
         and (mkt_sees_all() or assignee_id = auth.uid() or created_by = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.id = marketing_tasks.prospect_id)))
  with check ((my_has_module('marketing_taches') or my_has_module('marketing_prospects'))
         and (mkt_sees_all() or assignee_id = auth.uid() or created_by = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.id = marketing_tasks.prospect_id)));

drop policy if exists mkt_events_rw on public.marketing_prospect_events;
create policy mkt_events_rw on public.marketing_prospect_events for all to authenticated
  using (my_has_module('marketing_prospects')
         and (mkt_sees_all() or exists (select 1 from public.marketing_prospects p where p.id = marketing_prospect_events.prospect_id)))
  with check (my_has_module('marketing_prospects')
         and (mkt_sees_all() or exists (select 1 from public.marketing_prospects p where p.id = marketing_prospect_events.prospect_id)));

drop policy if exists mkt_appts_rw on public.marketing_appointments;
create policy mkt_appts_rw on public.marketing_appointments for all to authenticated
  using (my_has_module('marketing_calendrier')
         and (mkt_sees_all() or setter_id = auth.uid() or closer_id = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.id = marketing_appointments.prospect_id)))
  with check (my_has_module('marketing_calendrier')
         and (mkt_sees_all() or setter_id = auth.uid() or closer_id = auth.uid()
              or exists (select 1 from public.marketing_prospects p where p.id = marketing_appointments.prospect_id)));

-- Agendas Google : chacun voit les siens ; un membre agence voit ceux de l'équipe.
drop policy if exists mkt_calendar_events_read on public.marketing_calendar_events;
create policy mkt_calendar_events_read on public.marketing_calendar_events for select to authenticated
  using (my_has_module('marketing_calendrier') and (mkt_sees_all() or profile_id = auth.uid()));

-- ─── Membres visibles dans l'espace Marketing (attribution, auteur dans la chronologie) ──
-- Un compte commercial ne peut pas lire la table des profils : il passe par cette fonction,
-- qui ne renvoie que le nom, l'email professionnel et le rôle des membres de l'espace.
create or replace function public.marketing_members()
returns table (id uuid, display_name text, email text, role text, permissions jsonb, disabled_at timestamptz, marketing_role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.email, p.role,
         case when p.role = 'agency' and p.permissions is null then null else '[]'::jsonb end,
         p.disabled_at, p.marketing_role
    from public.profiles p
   where my_has_marketing() and p.disabled_at is null
     and (p.role = 'marketing'
          or (p.role = 'agency' and (p.permissions is null
              or (jsonb_typeof(p.permissions) = 'array' and exists (select 1 from jsonb_array_elements_text(p.permissions) e where e.value like 'marketing\_%')))))
$$;
revoke all on function public.marketing_members() from public, anon;
grant execute on function public.marketing_members() to authenticated, service_role;

-- ─── Entonnoir, publicité, classement : des faits, jamais de coordonnées ─────────
-- Ces fonctions servent le tableau de bord, la page Publicité et le classement. Elles ne
-- renvoient ni nom, ni email, ni téléphone, ni note ; la page d'entrée est rendue sans ses paramètres.
create or replace function public.marketing_funnel_prospects()
returns table (id uuid, created_at timestamptz, opted_in_at timestamptz, source text, site text, landing_page text, utm jsonb,
               stage_id uuid, stage_changed_at timestamptz, call_result text, outcome text, signed_amount numeric, value numeric, setter_id uuid, closer_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.created_at, p.opted_in_at, p.source, p.site, split_part(p.landing_page, '?', 1), p.utm,
         p.stage_id, p.stage_changed_at, p.call_result, p.outcome, p.signed_amount, p.value, p.setter_id, p.closer_id
    from public.marketing_prospects p
   where my_has_module('marketing_dashboard') or my_has_module('marketing_publicite') or my_has_module('marketing_classement')
$$;
create or replace function public.marketing_funnel_appointments()
returns table (id uuid, prospect_id uuid, starts_at timestamptz, created_at timestamptz, status text, result text, source text, setter_id uuid, closer_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, a.prospect_id, a.starts_at, a.created_at, a.status, a.result, a.source, a.setter_id, a.closer_id
    from public.marketing_appointments a
   where my_has_module('marketing_dashboard') or my_has_module('marketing_publicite') or my_has_module('marketing_classement')
$$;
create or replace function public.marketing_funnel_tasks()
returns table (id uuid, prospect_id uuid, kind text, status text, assignee_id uuid, done_by uuid, done_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.prospect_id, t.kind, t.status, t.assignee_id, t.done_by, t.done_at, t.created_at
    from public.marketing_tasks t
   where my_has_module('marketing_classement')
$$;
revoke all on function public.marketing_funnel_prospects() from public, anon;
revoke all on function public.marketing_funnel_appointments() from public, anon;
revoke all on function public.marketing_funnel_tasks() from public, anon;
grant execute on function public.marketing_funnel_prospects() to authenticated, service_role;
grant execute on function public.marketing_funnel_appointments() to authenticated, service_role;
grant execute on function public.marketing_funnel_tasks() to authenticated, service_role;

-- ─── Une seule fonction de Studio est resserrée ──────────────────────────────
-- avatars_purge_expired acceptait tout compte connecté qui n'était pas « client ». Avec un nouveau
-- rôle, cela aurait laissé un commercial vider la corbeille d'avatars d'un client. On exige
-- désormais un compte agence ou client actif. Le comportement pour ces deux rôles est inchangé.
create or replace function public.avatars_purge_expired(p_client uuid, p_days int default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() is null or my_role() not in ('agency','client') then raise exception 'forbidden_module'; end if;
  if my_role() = 'client' and p_client is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  delete from public.avatars
   where client_id = p_client and archived_at is not null
     and archived_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.avatars_purge_expired(uuid, int) from public, anon;
grant execute on function public.avatars_purge_expired(uuid, int) to authenticated, service_role;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 22))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(22, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
