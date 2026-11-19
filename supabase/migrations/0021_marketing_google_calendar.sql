-- ============================================================================
-- Iconflow — 0021 CALENDRIER RELIÉ À GOOGLE (lecture seule)
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0021_marketing_google_calendar.down.sql
--
--   • marketing_google_accounts : le compte Google que chaque membre a connecté, son jeton de
--     renouvellement CHIFFRÉ (clé MARKETING_ENCRYPTION_KEY, côté serveur), les agendas choisis.
--     Aucun accès par l'API pour les membres : la table n'est lue et écrite que par le serveur.
--   • marketing_calendar_events : copie des événements des agendas choisis, sur une fenêtre de
--     quelques semaines. L'app n'écrit JAMAIS dans Google.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.marketing_google_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  google_email text,
  refresh_token_enc text not null,                -- chiffré (AES-256-GCM) ; jamais envoyé au navigateur
  status text not null default 'ok' check (status in ('ok','invalide')),
  calendars jsonb not null default '[]'::jsonb,   -- [{ id, name, primary, selected }]
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_google_accounts enable row level security;
revoke all on table public.marketing_google_accounts from anon, authenticated;   -- serveur uniquement (clé service)

create table if not exists public.marketing_calendar_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.marketing_google_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  calendar_id text not null,
  calendar_name text,
  google_event_id text not null,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  kind text not null default 'bloque' check (kind in ('rdv','bloque')),   -- rdv = au moins un invité ; bloque = créneau sans invité
  attendees jsonb not null default '[]'::jsonb,   -- emails des invités (hors propriétaire)
  contact_id uuid references public.marketing_contacts(id) on delete set null,          -- rapproché par l'email d'un invité
  appointment_id uuid references public.marketing_appointments(id) on delete set null,  -- même rendez-vous déjà reçu de l'outil de réservation
  html_link text,
  synced_at timestamptz not null default now()
);
create unique index if not exists marketing_calendar_events_key on public.marketing_calendar_events (account_id, calendar_id, google_event_id);
create index if not exists marketing_calendar_events_time_idx on public.marketing_calendar_events (starts_at);
create index if not exists marketing_calendar_events_profile_idx on public.marketing_calendar_events (profile_id, starts_at);

alter table public.marketing_calendar_events enable row level security;
revoke all on table public.marketing_calendar_events from anon;
revoke insert, update, delete, truncate on table public.marketing_calendar_events from authenticated;   -- écrit par le serveur uniquement
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_calendar_events' and policyname='mkt_calendar_events_read') then
    create policy mkt_calendar_events_read on public.marketing_calendar_events for select to authenticated
      using (my_has_module('marketing_calendrier'));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marketing_google_accounts_touch') then
    create trigger marketing_google_accounts_touch before update on public.marketing_google_accounts for each row execute function public.marketing_touch();
  end if;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 21))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(21, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
