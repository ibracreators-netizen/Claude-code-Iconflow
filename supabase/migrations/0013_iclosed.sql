-- ============================================================================
-- Iconflow — 0013 iCLOSED (connecteur Marketing) — additif, idempotent, RÉVERSIBLE
-- ⚠️ NON APPLIQUÉE. À relire puis appliquer à la main, sur une base isolée d'abord.
-- Ne touche pas Studio. Dépend de 0005 (my_has_module) et 0008 (tables marketing_*).
--
-- Objet : recevoir les événements iClosed (webhooks) proprement —
--   * références externes stables (réconciliation par ID fournisseur) ;
--   * journal des livraisons (dédup, rejeu, désordre) ;
--   * champs structurés qualification/attribution sur le prospect ;
--   * garanties base : une seule relance en file par prospect, report de RDV ATOMIQUE
--     (mise à jour en place, sans trou), reprise sûre des claims bloqués, purge de rétention.
-- Aucune policy anonyme ; le récepteur passe par la clé service (hors RLS).
--
-- ROLLBACK (réversible) :
--   drop function if exists public.marketing_reschedule_appointment(uuid,timestamptz,timestamptz);
--   drop function if exists public.marketing_sweep_stale_claims(int);
--   drop function if exists public.marketing_prune_inbound_events(int);
--   drop index  if exists public.marketing_emails_one_active_relance;
--   drop table  if exists public.marketing_inbound_events;
--   drop table  if exists public.marketing_external_refs;
--   alter table public.marketing_prospects
--     drop column if exists qualification, drop column if exists attribution,
--     drop column if exists needs_review,  drop column if exists review_reason;
-- ============================================================================
set client_min_messages = warning;

-- ─── Références externes (un ID stable par fournisseur/compte/objet) ──────────
create table if not exists public.marketing_external_refs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                 -- 'iclosed'
  account_id text,                        -- compte côté fournisseur
  external_id text not null,              -- id contact / id appel
  kind text not null check (kind in ('contact','call')),
  prospect_id uuid references public.marketing_prospects(id) on delete set null,
  appointment_id uuid references public.marketing_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, account_id, external_id, kind)
);
create index if not exists marketing_external_refs_prospect_idx on public.marketing_external_refs (prospect_id);

-- ─── Journal des livraisons entrantes (dédup + rejeu + désordre) ──────────────
-- Rétention courte : le payload brut est purgé (voir marketing_prune_inbound_events).
create table if not exists public.marketing_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  account_id text,
  event_type text,                        -- type normalisé : contact|booking|reschedule|cancel
  raw_type text,                          -- type brut reçu (traçabilité)
  external_id text,                       -- call/contact concerné
  dedup_key text not null unique,         -- une livraison traitée au plus une fois
  occurred_at timestamptz,                -- horodatage SOURCE (ordonnancement ; peut être nul)
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processed','ignored','needs_review','error')),
  error text,
  payload jsonb                           -- brut, à purger ; aucun secret ne doit y être stocké
);
create index if not exists marketing_inbound_events_lookup_idx on public.marketing_inbound_events (provider, external_id, occurred_at);
create index if not exists marketing_inbound_events_status_idx on public.marketing_inbound_events (status, received_at);

-- ─── Prospect : qualification + attribution structurées, et drapeau de revue ──
alter table public.marketing_prospects add column if not exists qualification jsonb;  -- ex. { ad_spend, revenue }
alter table public.marketing_prospects add column if not exists attribution jsonb;    -- ex. { utm_source, utm_campaign }
alter table public.marketing_prospects add column if not exists needs_review boolean not null default false;
alter table public.marketing_prospects add column if not exists review_reason text;

-- ─── Une seule relance d'opt-in active par prospect (anti-doublon PAR LA BASE) ─
-- Remplace la clé temporelle (Date.now) : l'appli insère avec ON CONFLICT DO NOTHING.
create unique index if not exists marketing_emails_one_active_relance
  on public.marketing_scheduled_emails (prospect_id)
  where template = 'relance_optin' and status in ('pending','claimed');

-- ─── RLS (indépendance par module ; le récepteur écrit via la clé service, hors RLS) ──
alter table public.marketing_external_refs enable row level security;
alter table public.marketing_inbound_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_external_refs' and policyname='mkt_extrefs_rw') then
    create policy mkt_extrefs_rw on public.marketing_external_refs for all to authenticated
      using (my_has_module('marketing_prospects')) with check (my_has_module('marketing_prospects'));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_inbound_events' and policyname='mkt_inbound_read') then
    create policy mkt_inbound_read on public.marketing_inbound_events for select to authenticated using (my_has_marketing());
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_inbound_events' and policyname='mkt_inbound_write') then
    create policy mkt_inbound_write on public.marketing_inbound_events for all to authenticated
      using (my_has_module('marketing_relances')) with check (my_has_module('marketing_relances'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_external_refs_touch') then
    create trigger marketing_external_refs_touch before update on public.marketing_external_refs for each row execute function public.marketing_touch();
  end if;
end $$;

-- ─── Report de RDV ATOMIQUE : mise à jour EN PLACE (même ligne, aucun trou) ──
-- Corrige le report « annule puis recrée en deux appels ». L'exclusion refuse un chevauchement.
create or replace function public.marketing_reschedule_appointment(p_id uuid, p_start timestamptz, p_end timestamptz)
returns public.marketing_appointments
language plpgsql security definer set search_path = public as $$
declare appt public.marketing_appointments; cfg jsonb; off jsonb; send timestamptz;
begin
  if auth.uid() is not null and not my_has_module('marketing_calendrier') then raise exception 'forbidden_module'; end if;
  if p_end <= p_start then raise exception 'bad_range'; end if;
  update public.marketing_appointments
     set starts_at = p_start, ends_at = p_end, status = 'confirme'
   where id = p_id returning * into appt;                       -- lève exclusion_violation si chevauchement
  if appt.id is null then raise exception 'not_found'; end if;
  -- Rappels : on annule les anciens et on reprogramme d'après les réglages, dans la même transaction.
  update public.marketing_scheduled_emails set status = 'cancelled'
    where appointment_id = p_id and template = 'rappel_rdv' and status in ('pending','claimed');
  select value into cfg from public.marketing_settings where key = 'config';
  if cfg ? 'reminder_offsets_hours' and jsonb_typeof(cfg->'reminder_offsets_hours') = 'array' then
    for off in select * from jsonb_array_elements(cfg->'reminder_offsets_hours') loop
      send := p_start - make_interval(hours => (off::text)::numeric::int);
      if send > now() then
        insert into public.marketing_scheduled_emails (prospect_id, appointment_id, template, params, send_at, idempotency_key)
          values (appt.prospect_id, appt.id, 'rappel_rdv', jsonb_build_object('hours_before', (off::text)::numeric::int), send, 'rappel:' || appt.id || ':' || (off::text) || ':' || extract(epoch from p_start)::bigint)
          on conflict (idempotency_key) do nothing;
      end if;
    end loop;
  end if;
  return appt;
end $$;
revoke all on function public.marketing_reschedule_appointment(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.marketing_reschedule_appointment(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ─── Reprise SÛRE des claims bloqués : un worker interrompu laisse des lignes 'claimed'.
-- On NE renvoie PAS (l'email a pu partir) : on les bascule en 'uncertain' pour réconciliation manuelle.
create or replace function public.marketing_sweep_stale_claims(p_minutes int default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.marketing_scheduled_emails
     set status = 'uncertain', last_error = 'Claim expiré (worker interrompu) — à réconcilier, pas de renvoi auto'
   where status = 'claimed' and claimed_at is not null
     and claimed_at < now() - make_interval(mins => greatest(1, p_minutes));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.marketing_sweep_stale_claims(int) from public, anon, authenticated;
grant execute on function public.marketing_sweep_stale_claims(int) to service_role;

-- ─── Purge de rétention des payloads bruts (journal) ──────────────────────────
create or replace function public.marketing_prune_inbound_events(p_days int default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- On efface le payload brut passé le délai ; on garde la ligne (traçabilité, dédup).
  update public.marketing_inbound_events set payload = null
   where payload is not null and received_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.marketing_prune_inbound_events(int) from public, anon, authenticated;
grant execute on function public.marketing_prune_inbound_events(int) to service_role;
