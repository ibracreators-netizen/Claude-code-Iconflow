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
  unsubscribed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Déduplication par email (insensible à la casse), email facultatif.
create unique index if not exists marketing_prospects_email_key on public.marketing_prospects (lower(email)) where email is not null;
create index if not exists marketing_prospects_status_idx on public.marketing_prospects (status, created_at desc);
alter table public.marketing_prospects add column if not exists unsubscribed_at timestamptz;

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

-- ─── RPC : réservation atomique (anti-chevauchement + annulation des relances en MÊME transaction) ──
-- Appelable par un membre « calendrier » (RLS) OU par le serveur via la clé service (flux public).
-- La contrainte d'exclusion garantit qu'un créneau chevauchant est refusé ; tout se joue dans une transaction.
create or replace function public.marketing_book_appointment(p_prospect uuid, p_start timestamptz, p_end timestamptz, p_meeting_url text default null)
returns public.marketing_appointments
language plpgsql security definer set search_path = public as $$
declare appt public.marketing_appointments; cfg jsonb; off jsonb; send timestamptz;
begin
  if auth.uid() is not null and not my_has_module('marketing_calendrier') then raise exception 'forbidden_module'; end if;
  if p_end <= p_start then raise exception 'bad_range'; end if;
  insert into public.marketing_appointments (prospect_id, starts_at, ends_at, status, meeting_url, created_by)
    values (p_prospect, p_start, p_end, 'confirme', p_meeting_url, auth.uid())
    returning * into appt;                                    -- lève exclusion_violation si chevauchement
  update public.marketing_prospects set status = 'reserve' where id = p_prospect and status in ('nouveau','relance');
  -- Relances d'opt-in encore en file pour ce prospect : annulées dans la même transaction que la réservation.
  update public.marketing_scheduled_emails set status = 'cancelled'
    where prospect_id = p_prospect and template = 'relance_optin' and status in ('pending','claimed');
  -- Rappels de RDV programmés d'après les réglages (rien si aucun offset configuré).
  select value into cfg from public.marketing_settings where key = 'config';
  if cfg ? 'reminder_offsets_hours' and jsonb_typeof(cfg->'reminder_offsets_hours') = 'array' then
    for off in select * from jsonb_array_elements(cfg->'reminder_offsets_hours') loop
      send := p_start - make_interval(hours => (off::text)::numeric::int);
      if send > now() then
        insert into public.marketing_scheduled_emails (prospect_id, appointment_id, template, params, send_at, idempotency_key)
          values (p_prospect, appt.id, 'rappel_rdv', jsonb_build_object('hours_before', (off::text)::numeric::int), send, 'rappel:' || appt.id || ':' || (off::text))
          on conflict (idempotency_key) do nothing;
      end if;
    end loop;
  end if;
  return appt;
end $$;
revoke all on function public.marketing_book_appointment(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.marketing_book_appointment(uuid, timestamptz, timestamptz, text) to authenticated, service_role;

-- ─── RPC : annulation d'un RDV + annulation de ses rappels (même transaction) ──
create or replace function public.marketing_cancel_appointment(p_id uuid)
returns public.marketing_appointments
language plpgsql security definer set search_path = public as $$
declare appt public.marketing_appointments;
begin
  if auth.uid() is not null and not my_has_module('marketing_calendrier') then raise exception 'forbidden_module'; end if;
  update public.marketing_appointments set status = 'annule' where id = p_id returning * into appt;
  if appt.id is null then raise exception 'not_found'; end if;
  update public.marketing_scheduled_emails set status = 'cancelled'
    where appointment_id = p_id and status in ('pending','claimed');
  return appt;
end $$;
revoke all on function public.marketing_cancel_appointment(uuid) from public, anon;
grant execute on function public.marketing_cancel_appointment(uuid) to authenticated, service_role;

-- ─── RPC : le worker réclame les emails dus (verrou FOR UPDATE SKIP LOCKED, anti-doublon concurrent) ──
create or replace function public.marketing_claim_due_emails(p_worker text, p_limit int default 25)
returns setof public.marketing_scheduled_emails
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.marketing_scheduled_emails e
     set status = 'claimed', claimed_by = p_worker, claimed_at = now(), attempts = e.attempts + 1
   where e.id in (
     select id from public.marketing_scheduled_emails
      where status = 'pending' and send_at <= now()
      order by send_at
      for update skip locked
      limit greatest(1, least(p_limit, 200)))
   returning e.*;
end $$;
revoke all on function public.marketing_claim_due_emails(text, int) from public, anon, authenticated;
grant execute on function public.marketing_claim_due_emails(text, int) to service_role;
