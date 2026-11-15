-- ============================================================================
-- Iconflow — 0017 RÉCEPTION DES LEADS (additif, rejouable)
-- Retour arrière : supabase/rollbacks/0017_leads_inbox.down.sql
--
-- But : qu'un lead envoyé par un site soit TOUJOURS enregistré, même si
-- l'application (VPS) est arrêtée ou en redéploiement. Le site n'écrit donc plus
-- dans l'application : il appelle la fonction `lead_inbox_receive` de la base,
-- qui ne sait faire qu'une chose — ajouter une ligne dans `leads_inbox`.
--
--   • Insertion seule : le rôle public (anon) n'a AUCUN droit sur la table, ni
--     lecture, ni modification, ni suppression. Il n'a que le droit d'exécuter la
--     fonction.
--   • Rien n'est jeté en silence : une ligne douteuse est enregistrée avec le
--     statut « suspect », une ligne illisible passera « erreur » au traitement.
--   • Aucune suppression : un déclencheur refuse tout DELETE sur la table.
--   • Le traitement (ligne → prospect) est fait par l'application, de façon
--     rejouable, sur appel du planificateur. Voir docs/features/marketing.md.
--
-- Ne modifie aucune donnée existante. Les trois colonnes ajoutées à
-- marketing_prospects sont nullables.
-- ============================================================================
set client_min_messages = warning;

-- ─── Droit « espace Marketing » : on ajoute le module Réception à la liste ────
create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array'
                and p.permissions ?| array['marketing_dashboard','marketing_reception','marketing_prospects','marketing_calendrier','marketing_relances','marketing_reglages']))
    from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.my_has_marketing() from public;
grant execute on function public.my_has_marketing() to authenticated, anon;

-- ─── Prospects : d'où vient la personne (nullable, jamais réécrit) ────────────
alter table public.marketing_prospects add column if not exists site text;
alter table public.marketing_prospects add column if not exists landing_page text;
alter table public.marketing_prospects add column if not exists referrer text;
comment on column public.marketing_prospects.site is 'Site qui a envoyé le lead (ex. iconflow.fr).';
comment on column public.marketing_prospects.landing_page is 'Page d''entrée : première page vue par le visiteur, avec ses paramètres.';
comment on column public.marketing_prospects.referrer is 'Site d''origine du visiteur, quand il est connu.';

-- ─── Clés de site (facultatives) ─────────────────────────────────────────────
-- Tant qu'aucune clé active n'existe, tout envoi est accepté en « reçu ».
-- Dès qu'une clé active existe, un envoi sans clé valide est gardé en « suspect ».
-- Seule l'empreinte SHA-256 de la clé est stockée, jamais la clé.
create table if not exists public.marketing_lead_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  key_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.marketing_lead_sites enable row level security;
revoke all on table public.marketing_lead_sites from anon;

-- ─── Boîte de réception ──────────────────────────────────────────────────────
create table if not exists public.leads_inbox (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,                       -- identifiant unique de requête (anti-doublon des renvois)
  site text,
  landing_page text,                              -- page d'entrée
  page text,                                      -- page où le formulaire a été envoyé
  referrer text,
  utm jsonb not null default '{}'::jsonb,         -- paramètres de campagne
  payload jsonb not null,                         -- charge utile brute, telle que reçue
  received_at timestamptz not null default now(),
  status text not null default 'recu' check (status in ('recu','traite','erreur','suspect')),
  error text,                                     -- message d'erreur ou raison du statut « suspect »
  attempts integer not null default 0,
  processed_at timestamptz,
  prospect_id uuid references public.marketing_prospects(id) on delete set null,
  is_test boolean not null default false,         -- lead de test envoyé depuis l'application
  alert_status text check (alert_status in ('envoyee','simulee','echec','aucun_destinataire')),
  alert_error text,
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_inbox_request_id_key on public.leads_inbox (request_id);
create index if not exists leads_inbox_status_idx on public.leads_inbox (status, received_at);
create index if not exists leads_inbox_received_idx on public.leads_inbox (received_at desc);
comment on table public.leads_inbox is
  'Boîte de réception des leads. Les sites y écrivent par la fonction lead_inbox_receive (insertion seule). L''application transforme ensuite chaque ligne en prospect, de façon rejouable.';

-- Aucun lead supprimé : tout DELETE est refusé, quel que soit le rôle.
create or replace function public.leads_inbox_no_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'leads_inbox : suppression interdite (aucun lead n''est supprimé)';
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'leads_inbox_no_delete') then
    create trigger leads_inbox_no_delete before delete on public.leads_inbox
      for each row execute function public.leads_inbox_no_delete();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'leads_inbox_touch') then
    create trigger leads_inbox_touch before update on public.leads_inbox
      for each row execute function public.marketing_touch();
  end if;
end $$;

-- ─── Droits : rien pour le public, lecture et retraitement pour le module ─────
alter table public.leads_inbox enable row level security;
revoke all on table public.leads_inbox from anon;
revoke insert, delete, truncate on table public.leads_inbox from authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='leads_inbox' and policyname='leads_inbox_read') then
    create policy leads_inbox_read on public.leads_inbox for select to authenticated
      using (my_has_module('marketing_reception'));
  end if;
  if not exists (select 1 from pg_policies where tablename='leads_inbox' and policyname='leads_inbox_update') then
    create policy leads_inbox_update on public.leads_inbox for update to authenticated
      using (my_has_module('marketing_reception')) with check (my_has_module('marketing_reception'));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_lead_sites' and policyname='mkt_lead_sites_read') then
    create policy mkt_lead_sites_read on public.marketing_lead_sites for select to authenticated
      using (my_has_module('marketing_reception'));
  end if;
end $$;

-- ─── Fonction d'insertion : le SEUL accès des sites ──────────────────────────
-- Appel : POST {SUPABASE_URL}/rest/v1/rpc/lead_inbox_receive, corps JSON libre.
-- Paramètre unique sans nom : PostgREST lui passe le corps de la requête tel quel,
-- donc le site n'a pas à changer la forme de son envoi.
-- Réponse : { ok, stored, id, duplicate }. Aucune donnée de la table n'est renvoyée.
create or replace function public.lead_inbox_receive(jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p alias for $1;
  hdr jsonb;
  site_key text;
  key_site text;
  has_keys boolean;
  v_site text;
  v_status text := 'recu';
  v_reason text;
  v_req text;
  v_id uuid;
  recent integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if octet_length(p::text) > 16000 then
    raise exception 'payload_too_large' using errcode = '22023';
  end if;

  -- Garde-fou contre une inondation : au-delà, l'appelant reçoit une erreur
  -- « réessayable » (503) et garde le lead de son côté. Rien n'est jeté en silence.
  select count(*) into recent from public.leads_inbox where received_at > now() - interval '10 minutes';
  if recent >= 300 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  -- Clé de site, portée par l'en-tête x-lead-site-key (facultative, voir marketing_lead_sites).
  begin
    hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then hdr := null;
  end;
  site_key := nullif(trim(coalesce(hdr->>'x-lead-site-key', '')), '');

  v_site := left(nullif(trim(coalesce(p->>'site', '')), ''), 120);
  select exists (select 1 from public.marketing_lead_sites where active) into has_keys;
  if has_keys then
    if site_key is not null then
      select s.name into key_site from public.marketing_lead_sites s
       where s.active and s.key_hash = encode(sha256(convert_to(site_key, 'utf8')), 'hex');
    end if;
    if key_site is null then
      v_status := 'suspect';
      v_reason := 'Clé de site absente ou inconnue';
    else
      v_site := key_site;
    end if;
  end if;

  -- Champ piège rempli côté site : on garde le lead, marqué « suspect ».
  if lower(coalesce(p->>'suspect', '')) in ('true', '1', 'yes') then
    v_status := 'suspect';
    v_reason := concat_ws(' · ', v_reason, 'Champ piège rempli par le visiteur');
  end if;

  -- Identifiant de requête : celui du site s'il en envoie un, sinon une empreinte
  -- stable (site + email + heure d'envoi côté site) : un renvoi ne crée pas de doublon.
  v_req := left(nullif(trim(coalesce(p->>'request_id', '')), ''), 200);
  if v_req is null then
    v_req := encode(sha256(convert_to(
      coalesce(v_site, '') || '|' || lower(coalesce(p->>'email', '')) || '|' || coalesce(nullif(p->>'recu_le', ''), p::text), 'utf8')), 'hex');
  end if;

  insert into public.leads_inbox (request_id, site, landing_page, page, referrer, utm, payload, status, error)
  values (
    v_req,
    v_site,
    left(nullif(trim(coalesce(p->>'landing_page', '')), ''), 500),
    left(nullif(trim(coalesce(p->>'page', '')), ''), 500),
    left(nullif(trim(coalesce(p->>'referrer', '')), ''), 500),
    case when jsonb_typeof(p->'utm') = 'object' then p->'utm' else '{}'::jsonb end,
    p,
    v_status,
    v_reason)
  on conflict (request_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.leads_inbox where request_id = v_req;
    return jsonb_build_object('ok', true, 'stored', true, 'id', v_id, 'duplicate', true);
  end if;
  return jsonb_build_object('ok', true, 'stored', true, 'id', v_id, 'duplicate', false);
end $$;
revoke all on function public.lead_inbox_receive(jsonb) from public;
grant execute on function public.lead_inbox_receive(jsonb) to anon, authenticated, service_role;
