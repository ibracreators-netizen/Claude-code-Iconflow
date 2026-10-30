-- ============================================================================
-- Iconflow Studio — 0002 STUDIO V2 (additif, idempotent)
-- Étend le schéma legacy sans supprimer ni renommer quoi que ce soit.
-- Ajoute : colonnes clients/profiles/briefs/livrables, contacts, tâches,
-- documents, fichiers, factures, messages, activité, planning, métriques,
-- brain agence, bucket Storage "studio", triggers et RPC de transition.
-- ============================================================================

-- ─── Colonnes additionnelles ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists title text;

alter table public.clients
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists segment text not null default 'ecommerce',
  add column if not exists monthly_budget numeric not null default 0,
  add column if not exists retainer numeric not null default 0,
  add column if not exists performance_fee_pct numeric not null default 0,
  add column if not exists health text not null default 'bon',
  add column if not exists tags text[] not null default '{}',
  add column if not exists city text,
  add column if not exists owner_id uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.briefs
  add column if not exists assignee_id uuid references public.profiles(id),
  add column if not exists due_date date,
  add column if not exists updated_at timestamptz not null default now();

alter table public.livrables
  add column if not exists brief_id uuid references public.briefs(id),
  add column if not exists thumbnail_url text,
  add column if not exists storage_path text,
  add column if not exists updated_at timestamptz not null default now();

-- ─── Nouvelles tables ───────────────────────────────────────────────────────
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 300),
  description text,
  status text not null default 'a_faire' check (status in ('a_faire','en_cours','revue','termine')),
  priority text not null default 'normale' check (priority in ('basse','normale','haute','urgente')),
  assignee_id uuid references public.profiles(id),
  client_id uuid references public.clients(id) on delete set null,
  brief_id uuid references public.briefs(id) on delete set null,
  livrable_id uuid references public.livrables(id) on delete set null,
  due_date date,
  position integer not null default 0,
  labels text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Sans titre',
  icon text not null default '📄',
  kind text not null default 'doc' check (kind in ('doc','brief','strategie','compte_rendu','sop','template')),
  content text not null default '',
  client_id uuid references public.clients(id) on delete cascade,
  shared_with_client boolean not null default false,
  author_id uuid references public.profiles(id),
  parent_id uuid references public.documents(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  path text not null unique,
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  client_id uuid references public.clients(id) on delete cascade,
  livrable_id uuid references public.livrables(id) on delete set null,
  folder text not null default 'Général',
  shared_with_client boolean not null default false,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  type text not null default 'facture' check (type in ('facture','devis','avoir')),
  client_id uuid not null references public.clients(id),
  status text not null default 'brouillon' check (status in ('brouillon','envoyee','payee','en_retard','annulee')),
  issue_date date not null default current_date,
  due_date date not null default current_date + 30,
  lines jsonb not null default '[]'::jsonb,
  notes text,
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) <= 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  actor_id uuid references public.profiles(id),
  client_id uuid references public.clients(id) on delete cascade,
  entity_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'interne' check (kind in ('tournage','livraison','appel','deadline','interne')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  client_id uuid references public.clients(id) on delete cascade,
  notes text,
  created_by uuid references public.profiles(id)
);

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  livrable_id uuid references public.livrables(id) on delete set null,
  period_start date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  thruplays_3s bigint not null default 0,
  purchases bigint not null default 0,
  revenue numeric not null default 0,
  unique (client_id, livrable_id, period_start)
);

create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('angle','hook','framework','sop','swipe','insight','objection','prompt')),
  body text not null default '',
  tags text[] not null default '{}',
  segment text not null default 'tous',
  score integer check (score between 0 and 100),
  uses integer not null default 0,
  pinned boolean not null default false,
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Index ──────────────────────────────────────────────────────────────────
create index if not exists briefs_client_month_idx on public.briefs (client_id, month);
create index if not exists livrables_client_month_idx on public.livrables (client_id, month);
create index if not exists validations_brief_idx on public.validations (brief_id);
create index if not exists tasks_status_pos_idx on public.tasks (status, position);
create index if not exists tasks_client_idx on public.tasks (client_id);
create index if not exists documents_client_idx on public.documents (client_id) where archived_at is null;
create index if not exists files_client_folder_idx on public.files (client_id, folder);
create index if not exists invoices_client_idx on public.invoices (client_id, status);
create index if not exists messages_client_time_idx on public.messages (client_id, created_at desc);
create index if not exists activity_client_time_idx on public.activity_log (client_id, created_at desc);
create index if not exists events_time_idx on public.calendar_events (starts_at);
create index if not exists metrics_client_period_idx on public.metrics (client_id, period_start);
create index if not exists knowledge_category_idx on public.knowledge (category, pinned);
create index if not exists brain_entries_client_idx on public.brain_entries (client_id, section);

-- ─── updated_at automatique ─────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','briefs','livrables','tasks','documents','invoices','knowledge'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_touch_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch_updated_at', t);
    end if;
  end loop;
end $$;

-- ─── Profil auto à l'inscription (email agence = rôle agency) ──────────────
-- Les emails listés dans app_settings.admin_emails deviennent "agency".
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value)
  values ('admin_emails', '["ibracreators@gmail.com","ibra@iconflow.fr"]'::jsonb)
  on conflict (key) do nothing;

-- Créée seulement si absente : une version plus récente (migration suivante) ne doit jamais être écrasée en rejouant ce script.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'handle_new_user') then
    execute $fn$
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean; invited_client uuid;
begin
  select coalesce((select value from app_settings where key='admin_emails') ? lower(new.email), false) into is_admin;
  invited_client := nullif(new.raw_user_meta_data->>'client_id','')::uuid;
  insert into public.profiles (id, role, client_id, display_name, email)
    values (new.id,
            case when is_admin then 'agency' else 'client' end,
            case when is_admin then null else invited_client end,
            coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
            new.email)
    on conflict (id) do update set email = excluded.email;
  return new;
end $$;
    $fn$;
  end if;
end $do$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- ─── RLS nouvelles tables ───────────────────────────────────────────────────
alter table public.contacts enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.files enable row level security;
alter table public.invoices enable row level security;
alter table public.messages enable row level security;
alter table public.activity_log enable row level security;
alter table public.calendar_events enable row level security;
alter table public.metrics enable row level security;
alter table public.knowledge enable row level security;
alter table public.app_settings enable row level security;

do $$
begin
  -- Agence : tout. Client : lecture limitée à son espace (+ écriture messages).
  if not exists (select 1 from pg_policies where tablename='contacts' and policyname='contacts_agency_all') then
    create policy contacts_agency_all on public.contacts for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy contacts_client_read on public.contacts for select to authenticated using (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='tasks' and policyname='tasks_agency_all') then
    create policy tasks_agency_all on public.tasks for all to authenticated using (my_role()='agency') with check (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where tablename='documents' and policyname='documents_agency_all') then
    create policy documents_agency_all on public.documents for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy documents_client_read on public.documents for select to authenticated using (client_id = my_client_id() and shared_with_client and archived_at is null);
  end if;
  if not exists (select 1 from pg_policies where tablename='files' and policyname='files_agency_all') then
    create policy files_agency_all on public.files for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy files_client_read on public.files for select to authenticated using (client_id = my_client_id() and shared_with_client);
    create policy files_client_insert on public.files for insert to authenticated with check (client_id = my_client_id() and uploaded_by = auth.uid() and folder = 'Dépôt client');
  end if;
  if not exists (select 1 from pg_policies where tablename='invoices' and policyname='invoices_agency_all') then
    create policy invoices_agency_all on public.invoices for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy invoices_client_read on public.invoices for select to authenticated using (client_id = my_client_id() and status <> 'brouillon');
  end if;
  if not exists (select 1 from pg_policies where tablename='messages' and policyname='messages_agency_all') then
    create policy messages_agency_all on public.messages for all to authenticated using (my_role()='agency') with check (my_role()='agency' and author_id = auth.uid());
    create policy messages_client_read on public.messages for select to authenticated using (client_id = my_client_id());
    create policy messages_client_insert on public.messages for insert to authenticated with check (client_id = my_client_id() and author_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='activity_log' and policyname='activity_agency_all') then
    create policy activity_agency_all on public.activity_log for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy activity_client_read on public.activity_log for select to authenticated using (client_id = my_client_id());
    create policy activity_client_insert on public.activity_log for insert to authenticated with check (client_id = my_client_id() and actor_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='calendar_events' and policyname='events_agency_all') then
    create policy events_agency_all on public.calendar_events for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy events_client_read on public.calendar_events for select to authenticated using (client_id = my_client_id() and kind <> 'interne');
  end if;
  if not exists (select 1 from pg_policies where tablename='metrics' and policyname='metrics_agency_all') then
    create policy metrics_agency_all on public.metrics for all to authenticated using (my_role()='agency') with check (my_role()='agency');
    create policy metrics_client_read on public.metrics for select to authenticated using (client_id = my_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='knowledge' and policyname='knowledge_agency_all') then
    create policy knowledge_agency_all on public.knowledge for all to authenticated using (my_role()='agency') with check (my_role()='agency');
  end if;
  if not exists (select 1 from pg_policies where tablename='app_settings' and policyname='settings_agency_read') then
    create policy settings_agency_read on public.app_settings for select to authenticated using (my_role()='agency');
  end if;
  -- Profils : l'agence peut mettre à jour son propre profil et les profils clients.
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles p where p.id = auth.uid()));
  end if;
end $$;

-- ─── Storage : bucket privé "studio" ────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
  values ('studio', 'studio', false, 524288000)
  on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='studio_agency_all') then
    create policy studio_agency_all on storage.objects for all to authenticated
      using (bucket_id = 'studio' and my_role() = 'agency') with check (bucket_id = 'studio' and my_role() = 'agency');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='studio_client_read') then
    -- Chemin : clients/<client_id>/... — le client lit son dossier si le fichier est partagé.
    create policy studio_client_read on storage.objects for select to authenticated
      using (bucket_id = 'studio' and (storage.foldername(name))[1] = 'clients'
             and (storage.foldername(name))[2] = my_client_id()::text
             and exists (select 1 from public.files f where f.path = name and f.shared_with_client));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='studio_client_upload') then
    create policy studio_client_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'studio' and (storage.foldername(name))[1] = 'clients'
                  and (storage.foldername(name))[2] = my_client_id()::text
                  and (storage.foldername(name))[3] = 'depot');
  end if;
end $$;

-- ─── RPC : transition de livrable (atomique : validation + statut) ──────────
-- Créée seulement si absente : une version plus récente (migration suivante) ne doit jamais être écrasée en rejouant ce script.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'transition_livrable') then
    execute $fn$
create function public.transition_livrable(p_livrable_id uuid, p_next text, p_comment text default null)
returns public.livrables language plpgsql security definer set search_path = public as $$
declare l public.livrables; r text := my_role(); allowed boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from public.livrables where id = p_livrable_id for update;
  if not found then raise exception 'livrable_not_found'; end if;
  if r = 'client' and l.client_id is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  allowed := (r = 'agency' and l.status in ('en_controle','correction') and p_next = 'attente_client')
          or (r = 'client' and l.status = 'attente_client' and p_next in ('valide','correction'));
  if not allowed then raise exception 'wrong_state:%', l.status; end if;
  if r = 'client' then
    insert into public.validations(client_id, item_kind, item_ref, decision, comment, decided_by)
      values (l.client_id, case when l.kind = 'rush' then 'rushs' else 'crea' end, l.id::text, p_next, p_comment, auth.uid());
  end if;
  update public.livrables set status = p_next where id = l.id returning * into l;
  insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
    values ('livrable.status', auth.uid(), l.client_id, l.id, l.title || ' → ' || p_next);
  return l;
end $$;
    $fn$;
  end if;
end $do$;
revoke all on function public.transition_livrable(uuid,text,text) from public, anon;
grant execute on function public.transition_livrable(uuid,text,text) to authenticated;

-- ─── RPC : transition de brief côté agence (contrôle Ibra) ──────────────────
-- Créée seulement si absente : une version plus récente (migration suivante) ne doit jamais être écrasée en rejouant ce script.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'agency_transition_brief') then
    execute $fn$
create function public.agency_transition_brief(p_brief_id uuid, p_next text)
returns public.briefs language plpgsql security definer set search_path = public as $$
declare b public.briefs; expected text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() is distinct from 'agency' then raise exception 'not_an_agency'; end if;
  select * into b from public.briefs where id = p_brief_id for update;
  if not found then raise exception 'brief_not_found'; end if;
  expected := case
    when b.status = 'redaction' then 'attente_ibra'
    when b.status = 'attente_ibra' and b.kind = 'video' then 'attente_client'
    when b.status = 'attente_ibra' then 'valide'
    else null end;
  if p_next = 'redaction' and b.status in ('attente_ibra','attente_client') then
    update public.briefs set status='redaction', validated_by=null, validated_at=null where id=b.id returning * into b;
  elsif expected is null or p_next <> expected then
    raise exception 'wrong_state:%', b.status;
  else
    if p_next <> 'attente_ibra' then
      insert into public.validations(client_id,item_kind,brief_id,item_ref,decision,decided_by)
        values (b.client_id,'script',b.id,'script-v'||b.script_version,'valide',auth.uid());
    end if;
    update public.briefs set status = p_next,
      validated_by = case when p_next in ('attente_client','valide') then auth.uid() else validated_by end,
      validated_at = case when p_next in ('attente_client','valide') then now() else validated_at end
      where id = b.id returning * into b;
  end if;
  insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
    values ('brief.status', auth.uid(), b.client_id, b.id, b.title || ' → ' || b.status);
  return b;
end $$;
    $fn$;
  end if;
end $do$;
revoke all on function public.agency_transition_brief(uuid,text) from public, anon;
grant execute on function public.agency_transition_brief(uuid,text) to authenticated;

-- ─── Numérotation des factures ──────────────────────────────────────────────
create sequence if not exists public.invoice_seq;
-- Créée seulement si absente : une version plus récente (migration suivante) ne doit jamais être écrasée en rejouant ce script.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'next_invoice_number') then
    execute $fn$
create function public.next_invoice_number(p_type text) returns text
language sql volatile as $$
  select case p_type when 'devis' then 'D' when 'avoir' then 'A' else 'F' end
    || '-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$;
    $fn$;
  end if;
end $do$;
