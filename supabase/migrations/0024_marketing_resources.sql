-- ============================================================================
-- Iconflow — 0024 RESSOURCES, SOPs ET ONBOARDING DE L'ESPACE MARKETING
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0024_marketing_resources.down.sql
--
-- Le module Documents existant est RÉUTILISÉ : mêmes tables (documents, document_folders), mêmes
-- types (SOP, Template…), même format de contenu. On y ajoute seulement une colonne « espace »,
-- qui vaut « studio » pour tout ce qui existe. Aucun document de Studio n'est modifié.
--
--   • Un dossier par rôle (Setter, Closer, Media buyer), chacun avec Onboarding, SOPs, Ressources.
--     La structure est créée VIDE : aucun contenu n'est rédigé.
--   • Onboarding : une liste d'étapes par rôle, et la progression de chaque membre.
-- ============================================================================
set client_min_messages = warning;

alter table public.documents add column if not exists space text not null default 'studio';
alter table public.document_folders add column if not exists space text not null default 'studio';
alter table public.document_folders add column if not exists marketing_role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_space_check') then
    alter table public.documents add constraint documents_space_check check (space in ('studio','marketing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_folders_space_check') then
    alter table public.document_folders add constraint document_folders_space_check check (space in ('studio','marketing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_folders_marketing_role_check') then
    alter table public.document_folders add constraint document_folders_marketing_role_check
      check (marketing_role is null or marketing_role in ('setter','closer','media_buyer'));
  end if;
  -- Un document de l'espace Marketing n'est jamais rattaché à un client ni partagé avec lui.
  if not exists (select 1 from pg_constraint where conname = 'documents_marketing_internal') then
    alter table public.documents add constraint documents_marketing_internal check (space <> 'marketing' or (client_id is null and shared_with_client = false));
  end if;
end $$;
create index if not exists documents_space_idx on public.documents (space) where space <> 'studio';
create index if not exists document_folders_space_idx on public.document_folders (space) where space <> 'studio';

-- Rôle commercial du compte connecté (null pour un membre agence ou un client).
create or replace function public.my_marketing_role() returns text
language sql stable security definer set search_path = public as $$
  select p.marketing_role from public.profiles p where p.id = auth.uid() and p.role = 'marketing' and p.disabled_at is null
$$;
revoke all on function public.my_marketing_role() from public;
grant execute on function public.my_marketing_role() to authenticated, anon;

-- ─── Droits de l'espace Marketing sur les documents (les règles de Studio ne sont pas touchées) ──
-- Lecture : le module « Ressources », et le dossier de son rôle (ou un dossier commun).
-- Écriture : un membre agence qui a le module « Ressources ». Les commerciaux lisent, ils n'écrivent pas.
drop policy if exists folders_marketing_read on public.document_folders;
create policy folders_marketing_read on public.document_folders for select to authenticated
  using (space = 'marketing' and my_has_module('marketing_ressources')
         and (mkt_sees_all() or marketing_role is null or marketing_role = my_marketing_role()));
drop policy if exists folders_marketing_write on public.document_folders;
create policy folders_marketing_write on public.document_folders for all to authenticated
  using (space = 'marketing' and mkt_sees_all() and my_has_module('marketing_ressources'))
  with check (space = 'marketing' and mkt_sees_all() and my_has_module('marketing_ressources'));

drop policy if exists documents_marketing_read on public.documents;
create policy documents_marketing_read on public.documents for select to authenticated
  using (space = 'marketing' and archived_at is null and my_has_module('marketing_ressources')
         and (mkt_sees_all() or folder_id is null
              or exists (select 1 from public.document_folders f where f.id = documents.folder_id)));
drop policy if exists documents_marketing_write on public.documents;
create policy documents_marketing_write on public.documents for all to authenticated
  using (space = 'marketing' and mkt_sees_all() and my_has_module('marketing_ressources'))
  with check (space = 'marketing' and mkt_sees_all() and my_has_module('marketing_ressources'));

-- ─── Onboarding ──────────────────────────────────────────────────────────────
create table if not exists public.marketing_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('setter','closer','media_buyer')),
  title text not null,
  description text,
  document_id uuid references public.documents(id) on delete set null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_onboarding_steps_idx on public.marketing_onboarding_steps (role, position);
create table if not exists public.marketing_onboarding_progress (
  step_id uuid not null references public.marketing_onboarding_steps(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (step_id, profile_id)
);
alter table public.marketing_onboarding_steps enable row level security;
alter table public.marketing_onboarding_progress enable row level security;
revoke all on table public.marketing_onboarding_steps, public.marketing_onboarding_progress from anon;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'marketing_onboarding_steps_touch') then
    create trigger marketing_onboarding_steps_touch before update on public.marketing_onboarding_steps for each row execute function public.marketing_touch();
  end if;
end $$;
drop policy if exists mkt_onboarding_steps_read on public.marketing_onboarding_steps;
create policy mkt_onboarding_steps_read on public.marketing_onboarding_steps for select to authenticated
  using (my_has_module('marketing_ressources') and (mkt_sees_all() or role = my_marketing_role()));
drop policy if exists mkt_onboarding_steps_write on public.marketing_onboarding_steps;
create policy mkt_onboarding_steps_write on public.marketing_onboarding_steps for all to authenticated
  using (mkt_sees_all() and my_has_module('marketing_ressources')) with check (mkt_sees_all() and my_has_module('marketing_ressources'));
-- Progression : chacun coche ses propres étapes ; un membre agence lit celle de toute l'équipe.
drop policy if exists mkt_onboarding_progress_read on public.marketing_onboarding_progress;
create policy mkt_onboarding_progress_read on public.marketing_onboarding_progress for select to authenticated
  using (my_has_module('marketing_ressources') and (mkt_sees_all() or profile_id = auth.uid()));
drop policy if exists mkt_onboarding_progress_own on public.marketing_onboarding_progress;
create policy mkt_onboarding_progress_own on public.marketing_onboarding_progress for all to authenticated
  using (my_has_module('marketing_ressources') and profile_id = auth.uid())
  with check (my_has_module('marketing_ressources') and profile_id = auth.uid()
              and exists (select 1 from public.marketing_onboarding_steps s where s.id = step_id));

-- ─── Structure vide : un dossier par rôle, avec Onboarding, SOPs, Ressources ──
do $$
declare r record; v_root uuid; sub text; i int;
begin
  for r in select * from (values ('setter','Setter',10), ('closer','Closer',20), ('media_buyer','Media buyer',30)) as t(role, label, pos) loop
    select id into v_root from public.document_folders where space = 'marketing' and parent_id is null and marketing_role = r.role limit 1;
    if v_root is null then
      insert into public.document_folders (name, space, marketing_role, position) values (r.label, 'marketing', r.role, r.pos) returning id into v_root;
    end if;
    i := 0;
    foreach sub in array array['Onboarding','SOPs','Ressources'] loop
      i := i + 10;
      if not exists (select 1 from public.document_folders where parent_id = v_root and name = sub) then
        insert into public.document_folders (name, space, marketing_role, parent_id, position) values (sub, 'marketing', r.role, v_root, i);
      end if;
    end loop;
  end loop;
end $$;

insert into public.marketing_settings (key, value) values ('schema', jsonb_build_object('version', 24))
  on conflict (key) do update set value = jsonb_build_object('version', greatest(24, coalesce((public.marketing_settings.value->>'version')::int, 0))), updated_at = now();
