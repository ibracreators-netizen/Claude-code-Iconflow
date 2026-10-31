-- ============================================================================
-- Iconflow Studio — 0006 PRODUIT (additif, idempotent, rejouable)
-- Étapes de pipeline personnalisables, suppression définitive d'un client,
-- briefs à plusieurs concepts, livrables en batch, liens dans le planning,
-- bibliothèque de documents (dossiers), intégrations (Meta Ads), imports Brain.
-- ============================================================================
set client_min_messages = warning;

-- ─── Étapes du pipeline ─────────────────────────────────────────────────────
create table if not exists public.pipeline_stages (
  key text primary key,
  label text not null,
  color text not null default 'neutral',     -- neutral | info | accent | success | warning | danger | violet
  position integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.pipeline_stages (key, label, color, position) values
  ('onboarding', 'Onboarding', 'info', 0), ('in_progress', 'En cours', 'accent', 1), ('completed', 'Terminé', 'success', 2)
  on conflict (key) do nothing;
alter table public.pipeline_stages enable row level security;
drop policy if exists stages_agency_read on public.pipeline_stages;
drop policy if exists stages_agency_write on public.pipeline_stages;
create policy stages_agency_read on public.pipeline_stages for select to authenticated using (my_role() = 'agency');
create policy stages_agency_write on public.pipeline_stages for all to authenticated using (my_has_module('pipeline')) with check (my_has_module('pipeline'));

-- L'étape d'un client n'est plus bornée par une contrainte figée : la table pipeline_stages fait foi.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.agency_client_management'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%stage%' loop
    execute format('alter table public.agency_client_management drop constraint %I', c.conname);
  end loop;
end $$;

create or replace function public.agency_save_client_management(p_client_id uuid, p_stage text, p_notes text, p_expected_revision bigint)
returns public.agency_client_management language plpgsql security invoker set search_path = '' as $body$
declare saved public.agency_client_management; previous_stage text; client_name text; stage_label text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'agency' then raise exception 'not_an_agency'; end if;
  if not (public.my_has_module('clients') or public.my_has_module('pipeline')) then raise exception 'forbidden_module'; end if;
  select s.label into stage_label from public.pipeline_stages s where s.key = p_stage;
  if p_stage is null or stage_label is null then raise exception 'bad_stage'; end if;
  if p_notes is null or char_length(p_notes) > 20000 then raise exception 'bad_notes'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'stale_revision'; end if;
  select c.name into client_name from public.clients c where c.id = p_client_id and c.status is distinct from 'archived' for update;
  if not found then raise exception 'client_not_available'; end if;
  insert into public.agency_client_management(client_id, updated_by) values (p_client_id, auth.uid()) on conflict (client_id) do nothing;
  select * into saved from public.agency_client_management m where m.client_id = p_client_id for update;
  if saved.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  previous_stage := saved.stage;
  update public.agency_client_management m set stage = p_stage, notes = p_notes, revision = m.revision + 1, updated_at = now(), updated_by = auth.uid()
    where m.client_id = p_client_id returning * into saved;
  if previous_stage is distinct from p_stage then
    insert into public.activity_log(kind, actor_id, client_id, summary) values ('client.stage', auth.uid(), p_client_id, client_name || ' → ' || stage_label);
  end if;
  return saved;
end $body$;
revoke all on function public.agency_save_client_management(uuid,text,text,bigint) from public, anon;
grant execute on function public.agency_save_client_management(uuid,text,text,bigint) to authenticated;

-- Supprimer une étape : ses clients passent sur une étape de remplacement.
create or replace function public.agency_delete_stage(p_key text, p_replacement text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.my_has_module('pipeline') then raise exception 'forbidden_module'; end if;
  if p_key = p_replacement or not exists (select 1 from public.pipeline_stages where key = p_replacement) then raise exception 'bad_stage'; end if;
  if (select count(*) from public.pipeline_stages) <= 1 then raise exception 'last_stage'; end if;
  update public.agency_client_management set stage = p_replacement, updated_at = now(), updated_by = auth.uid(), revision = revision + 1 where stage = p_key;
  delete from public.pipeline_stages where key = p_key;
end $$;
revoke all on function public.agency_delete_stage(text,text) from public, anon;
grant execute on function public.agency_delete_stage(text,text) to authenticated;

-- ─── Briefs : plusieurs concepts par brief ─────────────────────────────────
create table if not exists public.brief_concepts (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  title text not null default 'Concept',
  position integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brief_concepts_brief_idx on public.brief_concepts (brief_id, position);
alter table public.brief_concepts enable row level security;
drop policy if exists concepts_agency_read on public.brief_concepts;
drop policy if exists concepts_agency_write on public.brief_concepts;
drop policy if exists concepts_client_read on public.brief_concepts;
create policy concepts_agency_read on public.brief_concepts for select to authenticated using (my_role() = 'agency');
create policy concepts_agency_write on public.brief_concepts for all to authenticated using (my_has_module('briefs')) with check (my_has_module('briefs'));
create policy concepts_client_read on public.brief_concepts for select to authenticated
  using (exists (select 1 from public.briefs b where b.id = brief_id and b.client_id = my_client_id() and b.status is distinct from 'redaction'));
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'brief_concepts_touch_updated_at') then
    create trigger brief_concepts_touch_updated_at before update on public.brief_concepts for each row execute function public.touch_updated_at();
  end if;
end $$;
-- Reprise : chaque brief existant reçoit son premier concept à partir de son contenu.
insert into public.brief_concepts (brief_id, title, position, content)
  select b.id, 'Concept 1', 0, coalesce(b.content, '{}'::jsonb) from public.briefs b
  where not exists (select 1 from public.brief_concepts c where c.brief_id = b.id);

-- ─── Livrables : un bloc = un batch (plusieurs vidéos ou visuels, un seul lien) ──
alter table public.livrables add column if not exists items jsonb not null default '[]'::jsonb;

-- ─── Planning : un événement peut mener à une page ─────────────────────────
alter table public.calendar_events add column if not exists link text;

-- ─── Documents : bibliothèque en dossiers ──────────────────────────────────
create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.document_folders(id) on delete cascade,
  client_id uuid references public.clients(id),
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.documents add column if not exists folder_id uuid references public.document_folders(id) on delete set null;
create index if not exists documents_folder_idx on public.documents (folder_id);
alter table public.document_folders enable row level security;
drop policy if exists folders_agency_read on public.document_folders;
drop policy if exists folders_agency_write on public.document_folders;
create policy folders_agency_read on public.document_folders for select to authenticated using (my_role() = 'agency');
create policy folders_agency_write on public.document_folders for all to authenticated using (my_has_module('documents')) with check (my_has_module('documents'));

-- ─── Clients : tableau de bord externe (Looker Studio, Meta…) ─────────────
alter table public.clients add column if not exists dashboard_url text;

-- ─── Intégrations (Meta Ads…) : jetons réservés aux administrateurs ────────
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  provider text not null,
  account_id text not null,
  account_name text,
  access_token text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  unique (client_id, provider)
);
alter table public.integrations enable row level security;
drop policy if exists integrations_admin_all on public.integrations;
create policy integrations_admin_all on public.integrations for all to authenticated using (my_is_full_access()) with check (my_is_full_access());
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'integrations_touch_updated_at') then
    create trigger integrations_touch_updated_at before update on public.integrations for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ─── Imports Brain (table legacy) : l'agence crée et suit ses imports ──────
drop policy if exists brain_imports_agency_write on public.brain_imports;
create policy brain_imports_agency_write on public.brain_imports for all to authenticated using (my_has_module('brain')) with check (my_has_module('brain'));

-- ─── Suppression définitive d'un client (administrateur à accès complet) ───
-- Renvoie les chemins Storage à supprimer par l'application. Les comptes clients rattachés perdent leur accès.
create or replace function public.agency_delete_client(p_client_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[]; client_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not my_is_full_access() then raise exception 'admin_only'; end if;
  select c.name into client_name from public.clients c where c.id = p_client_id;
  if not found then raise exception 'client_not_available'; end if;
  select coalesce(array_agg(f.path), '{}'::text[]) into paths from public.files f where f.client_id = p_client_id;
  delete from public.livrable_comments where livrable_id in (select id from public.livrables where client_id = p_client_id);
  delete from public.validations where client_id = p_client_id;
  delete from public.metrics where client_id = p_client_id;
  delete from public.files where client_id = p_client_id;
  delete from public.tasks where client_id = p_client_id;
  delete from public.livrables where client_id = p_client_id;
  delete from public.briefs where client_id = p_client_id;           -- brief_concepts : cascade
  delete from public.avatars where client_id = p_client_id;
  delete from public.brand_dossiers where client_id = p_client_id;
  delete from public.brain_entries where client_id = p_client_id;
  delete from public.brain_imports where client_id = p_client_id;
  delete from public.angles where client_id = p_client_id;
  delete from public.deposits where client_id = p_client_id;
  delete from public.api_tokens where client_id = p_client_id;
  delete from public.agency_client_management where client_id = p_client_id;
  delete from public.contacts where client_id = p_client_id;
  delete from public.documents where client_id = p_client_id;
  delete from public.document_folders where client_id = p_client_id;
  delete from public.invoices where client_id = p_client_id;
  delete from public.messages where client_id = p_client_id;
  delete from public.calendar_events where client_id = p_client_id;
  delete from public.integrations where client_id = p_client_id;
  update public.activity_log set client_id = null where client_id = p_client_id;
  update public.profiles set client_id = null, disabled_at = coalesce(disabled_at, now()) where client_id = p_client_id;
  delete from public.clients where id = p_client_id;
  insert into public.activity_log (kind, actor_id, summary) values ('note', auth.uid(), client_name || ' supprimé définitivement');
  return paths;
end $$;
revoke all on function public.agency_delete_client(uuid) from public, anon;
grant execute on function public.agency_delete_client(uuid) to authenticated;

-- ─── Journal d'activité : les événements internes à l'agence restent invisibles côté client ───
-- (changements d'étape du pipeline, tâches, notes internes). Rejouable.
drop policy if exists activity_client_read on public.activity_log;
create policy activity_client_read on public.activity_log for select to authenticated
  using (client_id = my_client_id() and kind not in ('client.stage', 'task.done', 'note'));
