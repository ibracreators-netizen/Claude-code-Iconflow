-- ============================================================================
-- Iconflow — 0018 CONTACTS, PIPELINE « IconFlow — Ventes », TÂCHES MARKETING
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0018_marketing_contacts_pipeline.down.sql
--
--   • marketing_contacts        : une fiche par personne (email unique, téléphone normalisé).
--   • marketing_pipeline_stages : les étapes du pipeline, modifiables dans Réglages.
--   • marketing_prospects       : devient « l'affaire », reliée à un contact et à une étape.
--   • marketing_tasks           : tâches de l'espace Marketing (« À appeler »…), sans lien
--                                 avec les tâches de Studio.
--
-- L'ancienne colonne `status` des prospects est CONSERVÉE et tenue à jour par un
-- déclencheur : rien de ce qui la lit aujourd'hui ne casse, et le retour arrière
-- ne perd aucun statut.
--
-- ┌─ CORRESPONDANCE ANCIENS STATUTS → ÉTAPES (à valider avant d'appliquer) ─────┐
-- │  Nouveau  → Nouveau lead                                                    │
-- │  Relancé  → Nouveau lead   (+ étiquette « relancé » sur le contact)         │
-- │  Réservé  → Audit réservé                                                   │
-- │  Converti → Gagné                                                           │
-- │  Perdu    → Perdu                                                           │
-- │  Pour changer : modifier la fonction marketing_stage_key_for_status ci-dessous. │
-- └─────────────────────────────────────────────────────────────────────────────┘
-- ============================================================================
set client_min_messages = warning;

-- ─── Droit « espace Marketing » : modules Contacts et Tâches ajoutés ──────────
create or replace function public.my_has_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or (jsonb_typeof(p.permissions) = 'array'
                and p.permissions ?| array['marketing_dashboard','marketing_reception','marketing_contacts','marketing_prospects','marketing_taches','marketing_calendrier','marketing_relances','marketing_reglages']))
    from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.my_has_marketing() from public;
grant execute on function public.my_has_marketing() to authenticated, anon;

-- ─── Téléphone normalisé (sert au dédoublonnage) ─────────────────────────────
-- 06 12 34 56 78 → +33612345678 ; 0033 6… → +336… ; +33 (0)6… → +336…
create or replace function public.marketing_phone_norm(p text) returns text
language plpgsql immutable as $$
declare d text; plus boolean;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\(0\)', '', 'g');
  plus := btrim(d) like '+%';
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if plus then return '+' || d; end if;
  if d like '00%' then return '+' || substr(d, 3); end if;
  if d ~ '^0[1-9][0-9]{8}$' then return '+33' || substr(d, 2); end if;
  if length(d) between 11 and 15 then return '+' || d; end if;
  return d;
end $$;

-- ─── Contacts ────────────────────────────────────────────────────────────────
create table if not exists public.marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  phone_norm text,
  company text,
  tags text[] not null default '{}',
  source text,
  last_activity_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_contacts_email_key on public.marketing_contacts (lower(email)) where email is not null;
create index if not exists marketing_contacts_phone_idx on public.marketing_contacts (phone_norm) where phone_norm is not null;
create index if not exists marketing_contacts_activity_idx on public.marketing_contacts (last_activity_at desc nulls last);
create index if not exists marketing_contacts_tags_idx on public.marketing_contacts using gin (tags);

-- ─── Étapes du pipeline ──────────────────────────────────────────────────────
create table if not exists public.marketing_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                       -- repère stable, utilisé par les automatisations
  name text not null,                             -- libellé affiché, modifiable
  position integer not null default 0,
  kind text not null default 'ouvert' check (kind in ('ouvert','gagne','perdu')),
  legacy_status text not null default 'nouveau' check (legacy_status in ('nouveau','relance','reserve','converti','perdu')),
  is_system boolean not null default false,       -- étape d'origine : renommable, non supprimable
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.marketing_pipeline_stages (key, name, position, kind, legacy_status, is_system) values
  ('nouveau_lead',   'Nouveau lead',        10, 'ouvert', 'nouveau',  true),
  ('audit_reserve',  'Audit réservé',       20, 'ouvert', 'reserve',  true),
  ('audit_effectue', 'Audit effectué',      30, 'ouvert', 'reserve',  true),
  ('followup',       'Follow-up planifié',  40, 'ouvert', 'relance',  true),
  ('proposition',    'Proposition envoyée', 50, 'ouvert', 'relance',  true),
  ('gagne',          'Gagné',               60, 'gagne',  'converti', true),
  ('perdu',          'Perdu',               70, 'perdu',  'perdu',    true)
on conflict (key) do nothing;

-- ─── Prospects : l'affaire ───────────────────────────────────────────────────
alter table public.marketing_prospects add column if not exists contact_id uuid references public.marketing_contacts(id) on delete set null;
alter table public.marketing_prospects add column if not exists stage_id uuid references public.marketing_pipeline_stages(id) on delete restrict;
alter table public.marketing_prospects add column if not exists stage_changed_at timestamptz;
alter table public.marketing_prospects add column if not exists title text;
alter table public.marketing_prospects add column if not exists value numeric(12,2);
alter table public.marketing_prospects add column if not exists setter_id uuid references public.profiles(id) on delete set null;
alter table public.marketing_prospects add column if not exists closer_id uuid references public.profiles(id) on delete set null;
alter table public.marketing_prospects add column if not exists call_result text;
alter table public.marketing_prospects add column if not exists outcome text;
alter table public.marketing_prospects add column if not exists signed_amount numeric(12,2);
alter table public.marketing_prospects add column if not exists call_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_prospects_call_result_check') then
    alter table public.marketing_prospects add constraint marketing_prospects_call_result_check
      check (call_result is null or call_result in ('a_venir','present','absent','annule','reporte'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_prospects_outcome_check') then
    alter table public.marketing_prospects add constraint marketing_prospects_outcome_check
      check (outcome is null or outcome in ('signe','non_signe','en_reflexion'));
  end if;
end $$;
create index if not exists marketing_prospects_contact_idx on public.marketing_prospects (contact_id);
create index if not exists marketing_prospects_stage_idx on public.marketing_prospects (stage_id);
create index if not exists marketing_prospects_setter_idx on public.marketing_prospects (setter_id);
create index if not exists marketing_prospects_closer_idx on public.marketing_prospects (closer_id);

-- Correspondance ancien statut → étape (voir l'encadré en tête de fichier).
create or replace function public.marketing_stage_key_for_status(p_status text) returns text
language sql immutable as $$
  select case p_status
    when 'nouveau'  then 'nouveau_lead'
    when 'relance'  then 'nouveau_lead'
    when 'reserve'  then 'audit_reserve'
    when 'converti' then 'gagne'
    when 'perdu'    then 'perdu'
    else 'nouveau_lead' end
$$;

-- L'étape et l'ancien statut restent cohérents, quel que soit le code qui écrit.
create or replace function public.marketing_prospects_stage_sync() returns trigger
language plpgsql set search_path = public as $$
declare v_legacy text;
begin
  if tg_op = 'INSERT' then
    if new.stage_id is null then
      select id into new.stage_id from marketing_pipeline_stages where key = marketing_stage_key_for_status(new.status);
    else
      select legacy_status into v_legacy from marketing_pipeline_stages where id = new.stage_id;
      new.status := coalesce(v_legacy, new.status);
    end if;
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
  elsif new.stage_id is distinct from old.stage_id and new.stage_id is not null then
    select legacy_status into v_legacy from marketing_pipeline_stages where id = new.stage_id;
    new.status := coalesce(v_legacy, new.status);
    new.stage_changed_at := now();
  elsif new.status is distinct from old.status then
    -- Ancien code (réservation interne, ancienne route d'opt-in) : il ne connaît que le statut.
    select legacy_status into v_legacy from marketing_pipeline_stages where id = old.stage_id;
    if v_legacy is distinct from new.status then
      select id into new.stage_id from marketing_pipeline_stages where key = marketing_stage_key_for_status(new.status);
      new.stage_changed_at := now();
    end if;
  end if;
  return new;
end $$;

-- ─── Reprise de l'existant : un contact par personne, une étape par prospect ──
-- Rejouable : ne touche que les prospects sans contact ou sans étape. Aucune ligne supprimée.
do $$
declare r record; v_contact uuid; v_stage uuid;
begin
  for r in select * from public.marketing_prospects where contact_id is null order by created_at loop
    v_contact := null;
    if r.email is not null then
      select id into v_contact from public.marketing_contacts where lower(email) = lower(r.email);
    end if;
    if v_contact is null and public.marketing_phone_norm(r.phone) is not null and length(public.marketing_phone_norm(r.phone)) >= 8 then
      select id into v_contact from public.marketing_contacts where phone_norm = public.marketing_phone_norm(r.phone) order by created_at limit 1;
    end if;
    if v_contact is null then
      insert into public.marketing_contacts (name, email, phone, phone_norm, company, source, tags, last_activity_at, created_by, created_at)
      values (r.name, lower(btrim(r.email)), r.phone, public.marketing_phone_norm(r.phone), r.marque, r.source,
              case when r.status = 'relance' then array['relancé'] else '{}'::text[] end,
              coalesce(r.updated_at, r.created_at), r.created_by, r.created_at)
      returning id into v_contact;
    elsif r.status = 'relance' then
      update public.marketing_contacts set tags = array_append(tags, 'relancé') where id = v_contact and not ('relancé' = any(tags));
    end if;
    update public.marketing_prospects set contact_id = v_contact where id = r.id;
  end loop;

  for r in select id, status from public.marketing_prospects where stage_id is null loop
    select id into v_stage from public.marketing_pipeline_stages where key = public.marketing_stage_key_for_status(r.status);
    -- On garde la trace de l'ancien statut dans la chronologie (sert aussi au retour arrière).
    insert into public.marketing_prospect_events (prospect_id, kind, data)
      values (r.id, 'migration_etape', jsonb_build_object('ancien_statut', r.status, 'etape', public.marketing_stage_key_for_status(r.status)));
    update public.marketing_prospects set stage_id = v_stage, stage_changed_at = coalesce(updated_at, created_at) where id = r.id;
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_prospects_stage_sync') then
    create trigger marketing_prospects_stage_sync before insert or update on public.marketing_prospects
      for each row execute function public.marketing_prospects_stage_sync();
  end if;
end $$;

-- ─── Tâches de l'espace Marketing ────────────────────────────────────────────
create table if not exists public.marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.marketing_prospects(id) on delete cascade,
  contact_id uuid references public.marketing_contacts(id) on delete set null,
  kind text not null default 'a_appeler' check (kind in ('a_appeler','relance','resultat','autre')),
  title text not null,
  note text,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  status text not null default 'ouverte' check (status in ('ouverte','faite','annulee')),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  origin text not null default 'manuel' check (origin in ('manuel','source','automatisation','import')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_tasks_open_idx on public.marketing_tasks (assignee_id, due_at) where status = 'ouverte';
create index if not exists marketing_tasks_prospect_idx on public.marketing_tasks (prospect_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_contacts_touch') then
    create trigger marketing_contacts_touch before update on public.marketing_contacts for each row execute function public.marketing_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marketing_stages_touch') then
    create trigger marketing_stages_touch before update on public.marketing_pipeline_stages for each row execute function public.marketing_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'marketing_tasks_touch') then
    create trigger marketing_tasks_touch before update on public.marketing_tasks for each row execute function public.marketing_touch();
  end if;
end $$;

-- « Dernière activité » du contact : mise à jour à chaque événement de la chronologie.
create or replace function public.marketing_contact_touch_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update marketing_contacts c set last_activity_at = new.created_at
    from marketing_prospects p
   where p.id = new.prospect_id and c.id = p.contact_id
     and (c.last_activity_at is null or c.last_activity_at < new.created_at);
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_events_contact_activity') then
    create trigger marketing_events_contact_activity after insert on public.marketing_prospect_events
      for each row execute function public.marketing_contact_touch_activity();
  end if;
end $$;

-- ─── Droits (par module ; l'accès « seulement ce qui m'est attribué » arrive en 0022) ──
alter table public.marketing_contacts enable row level security;
alter table public.marketing_pipeline_stages enable row level security;
alter table public.marketing_tasks enable row level security;
revoke all on table public.marketing_contacts, public.marketing_pipeline_stages, public.marketing_tasks from anon;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_contacts' and policyname='mkt_contacts_rw') then
    create policy mkt_contacts_rw on public.marketing_contacts for all to authenticated
      using (my_has_module('marketing_contacts') or my_has_module('marketing_prospects'))
      with check (my_has_module('marketing_contacts') or my_has_module('marketing_prospects'));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_pipeline_stages' and policyname='mkt_stages_read') then
    create policy mkt_stages_read on public.marketing_pipeline_stages for select to authenticated using (my_has_marketing());
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_pipeline_stages' and policyname='mkt_stages_write') then
    create policy mkt_stages_write on public.marketing_pipeline_stages for all to authenticated
      using (my_has_module('marketing_reglages')) with check (my_has_module('marketing_reglages'));
  end if;
  if not exists (select 1 from pg_policies where tablename='marketing_tasks' and policyname='mkt_tasks_rw') then
    create policy mkt_tasks_rw on public.marketing_tasks for all to authenticated
      using (my_has_module('marketing_taches') or my_has_module('marketing_prospects'))
      with check (my_has_module('marketing_taches') or my_has_module('marketing_prospects'));
  end if;
end $$;

-- Repère de version : l'application affiche ce qui manque si une migration n'est pas appliquée.
insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 18))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(18, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
