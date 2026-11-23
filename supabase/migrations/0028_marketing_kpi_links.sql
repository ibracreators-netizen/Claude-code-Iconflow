-- ============================================================================
-- Iconflow — 0028 LIENS DE SAISIE DES KPI (un lien personnel et permanent par commercial)
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0028_marketing_kpi_links.down.sql
--
--   • marketing_kpi_people : les personnes autorisées à saisir leurs KPI par un lien, sans compte.
--     Chacune a un jeton secret (au moins 32 caractères, tiré au hasard par l'application) : c'est lui
--     qui ouvre la page /kpi/<jeton>. Lu et géré seulement par qui gère l'espace Marketing.
--   • marketing_kpi_person_entries : une saisie par personne et par jour (mêmes gardes que
--     marketing_kpi_entries). Écrite par l'application seulement (clé service, depuis le lien, après
--     vérification du jeton à chaque envoi) ; lue par qui lit le suivi quotidien de l'équipe.
--   • marketing_kpi_link_people() : nom et rôle des personnes, SANS jeton ni coordonnées, pour afficher
--     leurs saisies dans les KPI et le tableau de bord.
-- Aucun droit pour anon. Aucune table existante n'est modifiée.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.marketing_kpi_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  role text not null check (role in ('setter','closer')),
  -- Jeton du lien : aléatoire, tiré par l'application (crypto), jamais dérivé du nom ni de l'identifiant.
  token text not null unique check (char_length(token) between 32 and 128 and token ~ '^[A-Za-z0-9_-]+$'),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_entry_at timestamptz
);
create index if not exists marketing_kpi_people_created_idx on public.marketing_kpi_people (created_at desc);

create table if not exists public.marketing_kpi_person_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.marketing_kpi_people(id) on delete cascade,
  day date not null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) < 2000),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, day),
  check (day <= (current_date + 1))
);
create index if not exists marketing_kpi_person_entries_day_idx on public.marketing_kpi_person_entries (day desc);

alter table public.marketing_kpi_people enable row level security;
alter table public.marketing_kpi_person_entries enable row level security;
revoke all on table public.marketing_kpi_people, public.marketing_kpi_person_entries from anon;
-- Saisies : écrites par l'application seulement (clé service), jamais par un compte connecté.
revoke insert, update, truncate on table public.marketing_kpi_person_entries from authenticated;

do $$ begin
  -- Personnes et jetons : réservés à qui gère l'espace (droit « Réglages marketing », membre de l'agence).
  if not exists (select 1 from pg_policies where tablename='marketing_kpi_people' and policyname='mkt_kpi_people_manage') then
    create policy mkt_kpi_people_manage on public.marketing_kpi_people for all to authenticated
      using (my_has_module('marketing_reglages') and mkt_sees_all())
      with check (my_has_module('marketing_reglages') and mkt_sees_all());
  end if;
  -- Saisies : lues comme le suivi quotidien de l'équipe (membre de l'agence avec le droit KPI).
  if not exists (select 1 from pg_policies where tablename='marketing_kpi_person_entries' and policyname='mkt_kpi_person_entries_read') then
    create policy mkt_kpi_person_entries_read on public.marketing_kpi_person_entries for select to authenticated
      using (my_has_module('marketing_classement') and mkt_sees_all());
  end if;
  -- Effacer une saisie : qui gère l'espace.
  if not exists (select 1 from pg_policies where tablename='marketing_kpi_person_entries' and policyname='mkt_kpi_person_entries_delete') then
    create policy mkt_kpi_person_entries_delete on public.marketing_kpi_person_entries for delete to authenticated
      using (my_has_module('marketing_reglages') and mkt_sees_all());
  end if;
end $$;

-- Noms à afficher à côté des saisies (KPI, tableau de bord) : ni jeton, ni email, ni téléphone.
create or replace function public.marketing_kpi_link_people()
returns table (id uuid, name text, role text, active boolean, last_entry_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.active, p.last_entry_at
    from public.marketing_kpi_people p
   where my_has_module('marketing_classement') and mkt_sees_all()
$$;
revoke all on function public.marketing_kpi_link_people() from public, anon;
grant execute on function public.marketing_kpi_link_people() to authenticated, service_role;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 28))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(28, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
