-- ============================================================================
-- Iconflow Studio — 0001 BASELINE (idempotent)
-- Recrée le schéma legacy de studio.iconflow.fr sur un projet VIDE.
-- Sur le projet de production (xqacgjtlktzrmfcolbst) ce fichier est sans effet :
-- toutes les instructions sont protégées par IF NOT EXISTS / DO $$ … $$.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── Tables legacy ──────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'onboarding',
  current_step integer not null default 1,
  created_at timestamptz not null default now(),
  sector text,
  contact_email text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  client_id uuid references public.clients(id),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_client_management (
  client_id uuid primary key references public.clients(id),
  stage text not null default 'onboarding',
  notes text not null default '',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid()
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  month date not null,
  kind text not null,
  title text not null,
  status text not null default 'redaction',
  content jsonb not null default '{}'::jsonb,
  source text not null default 'agence',
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  script_version integer not null default 1,
  submitted_content jsonb,
  position integer
);

create table if not exists public.livrables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  month date not null,
  kind text not null,
  title text not null,
  file_url text,
  duration_sec integer,
  status text not null default 'en_controle',
  created_at timestamptz not null default now()
);

create table if not exists public.livrable_comments (
  id uuid primary key default gen_random_uuid(),
  livrable_id uuid not null references public.livrables(id),
  author uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.validations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  item_kind text not null,
  brief_id uuid references public.briefs(id),
  item_ref text not null,
  decision text not null,
  comment text,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  preview_url text,
  chosen boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_dossiers (
  client_id uuid primary key references public.clients(id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.brain_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  section text not null,
  kind text not null,
  title text,
  content text not null,
  source_url text,
  origin text not null default 'manuel',
  import_id uuid,
  position integer,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.brain_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  url text not null,
  status text not null,
  pages_lues integer,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric,
  worst_case_usd numeric,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.angles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  month date not null,
  persona text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'attente_ibra',
  created_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  kind text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  source text not null default 'agence',
  created_at timestamptz not null default now()
);

create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  label text not null,
  token_hash text not null unique,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ─── Helpers de rôle (présents en prod, recréés à l'identique si absents) ──
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.my_role() from public;
revoke all on function public.my_client_id() from public;
grant execute on function public.my_role() to authenticated, anon;
grant execute on function public.my_client_id() to authenticated, anon;

-- ─── RLS legacy (créées uniquement si absentes) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clients','profiles','agency_client_management','briefs','livrables','livrable_comments',
    'validations','avatars','brand_dossiers','brain_entries','brain_imports','angles','deposits','api_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='clients_agency_all') then
    create policy clients_agency_all on public.clients for all to public using (my_role()='agency') with check (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='clients_client_read') then
    create policy clients_client_read on public.clients for select to public using (id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to public using (id = auth.uid() or my_role()='agency');
  end if;
  -- Tables scoped client : agence tout, client lecture (+ règles spécifiques)
  if not exists (select 1 from pg_policies where tablename='briefs' and policyname='briefs_agency_all') then
    create policy briefs_agency_all on public.briefs for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy briefs_client_read on public.briefs for select to public using (client_id = my_client_id() and status is distinct from 'redaction');
  end if;
  if not exists (select 1 from pg_policies where tablename='livrables' and policyname='livrables_agency_all') then
    create policy livrables_agency_all on public.livrables for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy livrables_client_read on public.livrables for select to public using (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='livrable_comments' and policyname='comments_agency_all') then
    create policy comments_agency_all on public.livrable_comments for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy comments_client_read on public.livrable_comments for select to public using (exists (select 1 from livrables l where l.id = livrable_id and l.client_id = my_client_id()));
    create policy comments_client_insert on public.livrable_comments for insert to public with check (author = auth.uid() and exists (select 1 from livrables l where l.id = livrable_id and l.client_id = my_client_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='validations' and policyname='validations_agency_all') then
    create policy validations_agency_all on public.validations for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy validations_client_read on public.validations for select to public using (client_id = my_client_id());
    create policy validations_client_insert on public.validations for insert to public with check (
      client_id = my_client_id() and decided_by = auth.uid()
      and (item_kind <> 'script' or exists (select 1 from briefs b where b.id = brief_id and b.client_id = my_client_id() and b.kind='video' and b.status='attente_client')));
  end if;
  if not exists (select 1 from pg_policies where tablename='avatars' and policyname='avatars_agency_all') then
    create policy avatars_agency_all on public.avatars for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy avatars_client_read on public.avatars for select to public using (client_id = my_client_id());
    create policy avatars_client_choose on public.avatars for update to public using (client_id = my_client_id()) with check (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='brand_dossiers' and policyname='dossiers_agency_all') then
    create policy dossiers_agency_all on public.brand_dossiers for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy dossiers_client_read on public.brand_dossiers for select to public using (client_id = my_client_id());
    create policy dossiers_client_write on public.brand_dossiers for insert to public with check (client_id = my_client_id());
    create policy dossiers_client_update on public.brand_dossiers for update to public using (client_id = my_client_id()) with check (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='brain_entries' and policyname='brain_entries_agency_all') then
    create policy brain_entries_agency_all on public.brain_entries for all to public using (my_role()='agency') with check (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where tablename='brain_imports' and policyname='brain_imports_agency_read') then
    create policy brain_imports_agency_read on public.brain_imports for select to public using (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where tablename='angles' and policyname='angles_agency_all') then
    create policy angles_agency_all on public.angles for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy angles_client_read on public.angles for select to public using (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='deposits' and policyname='deposits_agency_all') then
    create policy deposits_agency_all on public.deposits for all to public using (my_role()='agency') with check (my_role()='agency');
    create policy deposits_client_read on public.deposits for select to public using (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='api_tokens' and policyname='api_tokens_agency_all') then
    create policy api_tokens_agency_all on public.api_tokens for all to public using (my_role()='agency') with check (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where tablename='agency_client_management' and policyname='agency_management_read') then
    create policy agency_management_read on public.agency_client_management for select to authenticated using ((select my_role())='agency');
    create policy agency_management_insert on public.agency_client_management for insert to authenticated with check ((select my_role())='agency' and updated_by=(select auth.uid()));
    create policy agency_management_update on public.agency_client_management for update to authenticated using ((select my_role())='agency') with check ((select my_role())='agency' and updated_by=(select auth.uid()));
  end if;
end $$;

-- ─── RPC legacy : décision client sur un script (contrat documenté) ─────────
-- Créée seulement si absente : la version de production reste l'autorité.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='client_decide_script') then
    execute $fn$
    create function public.client_decide_script(p_brief_id uuid, p_decision text, p_comment text default null)
    returns jsonb language plpgsql security definer set search_path = public as $body$
    declare b public.briefs; v public.validations; ref text; next_status text;
    begin
      if auth.uid() is null then raise exception 'not_authenticated'; end if;
      if my_role() is distinct from 'client' then raise exception 'not_a_client'; end if;
      select * into b from public.briefs where id = p_brief_id for update;
      if not found then raise exception 'brief_not_found'; end if;
      if b.client_id is distinct from my_client_id() then raise exception 'wrong_client'; end if;
      if b.kind = 'statique' then raise exception 'static_brief_ibra_only'; end if;
      if b.status <> 'attente_client' then raise exception 'wrong_state:%', b.status; end if;
      if p_decision not in ('valide','correction') then raise exception 'bad_decision'; end if;
      ref := 'script-v' || b.script_version;
      if exists (select 1 from public.validations where brief_id = b.id and item_ref = ref and decided_by = auth.uid()) then
        raise exception 'already_decided';
      end if;
      insert into public.validations(client_id,item_kind,brief_id,item_ref,decision,comment,decided_by)
        values (b.client_id,'script',b.id,ref,p_decision,p_comment,auth.uid()) returning * into v;
      next_status := case when p_decision = 'valide' then 'valide' else 'redaction' end;
      update public.briefs set status = next_status,
        validated_by = case when p_decision='valide' then auth.uid() else null end,
        validated_at = case when p_decision='valide' then now() else null end,
        script_version = case when p_decision='correction' then script_version + 1 else script_version end
        where id = b.id;
      return jsonb_build_object('id', v.id, 'item_ref', v.item_ref, 'decision', v.decision);
    end $body$;
    $fn$;
    execute 'revoke all on function public.client_decide_script(uuid,text,text) from public, anon';
    execute 'grant execute on function public.client_decide_script(uuid,text,text) to authenticated';
  end if;
end $$;

-- ─── RPC legacy : classement + notes agence (compare-and-swap) ─────────────
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='agency_save_client_management') then
    execute $fn$
    create function public.agency_save_client_management(p_client_id uuid, p_stage text, p_notes text, p_expected_revision bigint)
    returns public.agency_client_management language plpgsql security invoker set search_path = '' as $body$
    declare saved public.agency_client_management;
    begin
      if auth.uid() is null then raise exception 'not_authenticated'; end if;
      if public.my_role() is distinct from 'agency' then raise exception 'not_an_agency'; end if;
      if p_stage is null or p_stage not in ('onboarding','in_progress','completed') then raise exception 'bad_stage'; end if;
      if p_notes is null or char_length(p_notes) > 20000 then raise exception 'bad_notes'; end if;
      if p_expected_revision is null or p_expected_revision < 0 then raise exception 'stale_revision'; end if;
      perform 1 from public.clients c where c.id = p_client_id and c.status is distinct from 'archived' for update;
      if not found then raise exception 'client_not_available'; end if;
      insert into public.agency_client_management(client_id, updated_by) values (p_client_id, auth.uid()) on conflict (client_id) do nothing;
      select * into saved from public.agency_client_management m where m.client_id = p_client_id for update;
      if saved.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
      update public.agency_client_management m set stage = p_stage, notes = p_notes, revision = m.revision + 1, updated_at = now(), updated_by = auth.uid()
        where m.client_id = p_client_id returning * into saved;
      return saved;
    end $body$;
    $fn$;
    execute 'revoke all on function public.agency_save_client_management(uuid,text,text,bigint) from public, anon';
    execute 'grant execute on function public.agency_save_client_management(uuid,text,text,bigint) to authenticated';
  end if;
end $$;
