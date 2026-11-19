-- ============================================================================
-- Iconflow — 0023 PUBLICITÉ : dépense du compte Meta Ads de l'agence, par campagne et par jour
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0023_marketing_ads.down.sql
--
-- La connexion Meta Ads existante (table integrations, espace Studio) est RÉUTILISÉE telle quelle :
-- on choisit dans Marketing lequel des comptes connectés est celui de l'agence. Rien n'est modifié
-- côté Studio (ni table, ni règle, ni synchronisation des clients).
-- ============================================================================
set client_min_messages = warning;

create table if not exists public.marketing_ad_insights (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  day date not null,
  campaign_id text not null,
  campaign_name text,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  synced_at timestamptz not null default now()
);
create unique index if not exists marketing_ad_insights_key on public.marketing_ad_insights (account_id, day, campaign_id);
create index if not exists marketing_ad_insights_day_idx on public.marketing_ad_insights (day);

alter table public.marketing_ad_insights enable row level security;
revoke all on table public.marketing_ad_insights from anon;
revoke insert, update, delete, truncate on table public.marketing_ad_insights from authenticated;   -- écrit par le serveur uniquement
do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_ad_insights' and policyname='mkt_ad_insights_read') then
    create policy mkt_ad_insights_read on public.marketing_ad_insights for select to authenticated
      using (my_has_module('marketing_publicite') or my_has_module('marketing_dashboard'));
  end if;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 23))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(23, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
