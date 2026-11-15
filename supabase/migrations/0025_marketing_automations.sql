-- ============================================================================
-- Iconflow — 0025 AUTOMATISATIONS DE L'ESPACE MARKETING
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0025_marketing_automations.down.sql
--
--   • marketing_automation_runs  : le journal de ce que chaque règle a fait. La clé `dedupe_key`
--     garantit qu'une règle n'agit qu'une fois pour un même prospect ou un même rendez-vous.
--   • marketing_client_proposals : après une signature, la proposition de créer le client dans
--     Studio. Rien n'est créé dans Studio tant que l'administrateur n'a pas validé.
-- Les règles elles-mêmes (interrupteurs, délais) sont des réglages : rien n'est actif par cette migration.
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.marketing_automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule text not null check (rule in ('new_lead','no_booking','booked','no_result','no_show','signed')),
  dedupe_key text not null,
  prospect_id uuid references public.marketing_prospects(id) on delete set null,
  action text not null,                           -- ce qui a été fait, en clair
  ok boolean not null default true,
  detail text,
  created_at timestamptz not null default now()
);
create unique index if not exists marketing_automation_runs_key on public.marketing_automation_runs (dedupe_key);
create index if not exists marketing_automation_runs_time_idx on public.marketing_automation_runs (created_at desc);

create table if not exists public.marketing_client_proposals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references public.marketing_prospects(id) on delete cascade,
  status text not null default 'en_attente' check (status in ('en_attente','cree','ignoree')),
  client_id uuid,                                  -- le client créé dans Studio, une fois validé
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.marketing_automation_runs enable row level security;
alter table public.marketing_client_proposals enable row level security;
revoke all on table public.marketing_automation_runs, public.marketing_client_proposals from anon;
-- Écrits par le serveur (clé service). Lecture : réglages Marketing. Décision sur une proposition : administrateur.
revoke insert, update, delete, truncate on table public.marketing_automation_runs from authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_automation_runs' and policyname='mkt_automation_runs_read') then
    create policy mkt_automation_runs_read on public.marketing_automation_runs for select to authenticated using (my_has_module('marketing_reglages'));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_client_proposals' and policyname='mkt_client_proposals_admin') then
    create policy mkt_client_proposals_admin on public.marketing_client_proposals for all to authenticated using (my_is_full_access()) with check (my_is_full_access());
  end if;
end $$;

-- L'alerte « nouveau lead » peut être coupée par la règle 1 : la ligne le note au lieu de rester « en attente ».
alter table public.leads_inbox drop constraint if exists leads_inbox_alert_status_check;
alter table public.leads_inbox add constraint leads_inbox_alert_status_check
  check (alert_status is null or alert_status in ('envoyee','simulee','echec','aucun_destinataire','desactivee'));

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 25))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(25, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
