-- ============================================================================
-- Iconflow — 0008 MARKETING (additif, idempotent, rejouable)
-- Espace « IconFlow Marketing » : prospects, rendez-vous, file d'emails (outbox),
-- réglages. STRICTEMENT indépendant de Studio : les policies vérifient le droit
-- AU MODULE (my_has_module / my_has_marketing), pas seulement my_role()='agency'.
-- Les flux publics (opt-in, réservation) et le worker passent par la clé service
-- (hors RLS) ; aucune policy anonyme n'est ouverte ici.
-- ============================================================================
set client_min_messages = warning;
create extension if not exists btree_gist;

-- ─── Droit « espace Marketing » (au moins un module marketing, ou accès complet) ──
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

-- ─── Prospects (leads) ──────────────────────────────────────────────────────
create table if not exists public.marketing_prospects (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  source text,
  status text not null default 'nouveau' check (status in ('nouveau','relance','reserve','converti','perdu')),
  opted_in_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Déduplication par email (insensible à la casse), email facultatif.
create unique index if not exists marketing_prospects_email_key on public.marketing_prospects (lower(email)) where email is not null;
create index if not exists marketing_prospects_status_idx on public.marketing_prospects (status, created_at desc);

-- ─── Rendez-vous (stockés en UTC) ───────────────────────────────────────────
create table if not exists public.marketing_appointments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.marketing_prospects(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirme' check (status in ('confirme','annule','deplace')),
  meeting_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists marketing_appointments_start_idx on public.marketing_appointments (starts_at);
-- Anti-double-réservation PAR LA BASE : deux rendez-vous CONFIRMÉS ne peuvent se chevaucher.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_appointments_no_overlap') then
    alter table public.marketing_appointments
      add constraint marketing_appointments_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'confirme');
  end if;
end $$;

-- ─── File d'emails (patron outbox) ──────────────────────────────────────────
create table if not exists public.marketing_scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.marketing_prospects(id) on delete cascade,
  appointment_id uuid references public.marketing_appointments(id) on delete cascade,
  template text not null,                 -- rappel_rdv | relance_optin
  params jsonb not null default '{}'::jsonb,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','claimed','sent','failed','uncertain','cancelled')),
  idempotency_key text not null unique,   -- une décision d'envoi au plus par clé
  claimed_by text,
  claimed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,               -- identifiant renvoyé par Resend (réconciliation)
  dry_run boolean not null default true,  -- l'envoi a-t-il été simulé (DRY RUN) ?
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_emails_due_idx on public.marketing_scheduled_emails (status, send_at);
create index if not exists marketing_emails_prospect_idx on public.marketing_scheduled_emails (prospect_id);

-- ─── Réglages Marketing (clé/valeur, indépendants d'app_settings de Studio) ──
create table if not exists public.marketing_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- touch updated_at
create or replace function public.marketing_touch() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_prospects_touch') then
    create trigger marketing_prospects_touch before update on public.marketing_prospects for each row execute function public.marketing_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marketing_appointments_touch') then
    create trigger marketing_appointments_touch before update on public.marketing_appointments for each row execute function public.marketing_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marketing_emails_touch') then
    create trigger marketing_emails_touch before update on public.marketing_scheduled_emails for each row execute function public.marketing_touch();
  end if;
end $$;

-- ─── RLS : chaque table ouverte au seul détenteur du module (indépendance réelle) ──
alter table public.marketing_prospects enable row level security;
alter table public.marketing_appointments enable row level security;
alter table public.marketing_scheduled_emails enable row level security;
alter table public.marketing_settings enable row level security;

do $$ begin
  -- Prospects : module marketing_prospects
  if not exists (select 1 from pg_policies where tablename='marketing_prospects' and policyname='mkt_prospects_rw') then
    create policy mkt_prospects_rw on public.marketing_prospects for all to authenticated
      using (my_has_module('marketing_prospects')) with check (my_has_module('marketing_prospects'));
  end if;
  -- Rendez-vous : module marketing_calendrier
  if not exists (select 1 from pg_policies where tablename='marketing_appointments' and policyname='mkt_appts_rw') then
    create policy mkt_appts_rw on public.marketing_appointments for all to authenticated
      using (my_has_module('marketing_calendrier')) with check (my_has_module('marketing_calendrier'));
  end if;
  -- File d'emails : module marketing_relances (le worker passe par la clé service, hors RLS)
  if not exists (select 1 from pg_policies where tablename='marketing_scheduled_emails' and policyname='mkt_emails_rw') then
    create policy mkt_emails_rw on public.marketing_scheduled_emails for all to authenticated
      using (my_has_module('marketing_relances')) with check (my_has_module('marketing_relances'));
  end if;
  -- Réglages : lecture par tout détenteur d'un module marketing, écriture réservée au module « réglages ».
  if not exists (select 1 from pg_policies where tablename='marketing_settings' and policyname='mkt_settings_read') then
    create policy mkt_settings_read on public.marketing_settings for select to authenticated using (my_has_marketing());
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_settings' and policyname='mkt_settings_write') then
    create policy mkt_settings_write on public.marketing_settings for all to authenticated
      using (my_has_module('marketing_reglages')) with check (my_has_module('marketing_reglages'));
  end if;
end $$;
