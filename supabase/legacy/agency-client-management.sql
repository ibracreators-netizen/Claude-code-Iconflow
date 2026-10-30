-- PROPOSITION UNIQUEMENT. NON APPLIQUÉE. Revoir le catalogue réel avant exécution.
-- Ne modifie ni clients/profiles, ni leurs RLS, ni client_decide_script.
-- Exécuter en environnement de test seulement après autorisation explicite.
begin;
create table public.agency_client_management (
  client_id uuid primary key references public.clients(id) on delete restrict,
  stage text not null default 'onboarding' check (stage in ('onboarding','in_progress','completed')),
  notes text not null default '' check (char_length(notes) <= 20000),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid()
);
alter table public.agency_client_management enable row level security;
alter table public.agency_client_management force row level security;
revoke all on public.agency_client_management from public, anon, authenticated;
grant select, insert, update on public.agency_client_management to authenticated;

-- Reuses the existing verified my_role() helper. No client can
-- read notes merely because the row belongs to that client's workspace.
create policy agency_management_read on public.agency_client_management
for select to authenticated using (
  (select public.my_role()) = 'agency'
  and exists (select 1 from public.clients c where c.id = client_id)
);
create policy agency_management_insert on public.agency_client_management
for insert to authenticated with check (
  (select public.my_role()) = 'agency'
  and exists (select 1 from public.clients c where c.id = client_id and c.status is distinct from 'archived')
  and updated_by = (select auth.uid())
);
create policy agency_management_update on public.agency_client_management
for update to authenticated using (
  (select public.my_role()) = 'agency'
  and exists (select 1 from public.clients c where c.id = client_id and c.status is distinct from 'archived')
) with check (
  (select public.my_role()) = 'agency'
  and exists (select 1 from public.clients c where c.id = client_id and c.status is distinct from 'archived')
  and updated_by = (select auth.uid())
);

-- Atomic compare-and-swap for stage + note. Invoker keeps RLS in force.
create function public.agency_save_client_management(
  p_client_id uuid, p_stage text, p_notes text, p_expected_revision bigint
) returns public.agency_client_management
language plpgsql security invoker set search_path = '' as $$
declare saved public.agency_client_management;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'agency'
    then raise exception 'not_an_agency'; end if;
  if p_stage is null or p_stage not in ('onboarding','in_progress','completed') then raise exception 'bad_stage'; end if;
  if p_notes is null or char_length(p_notes)>20000 then raise exception 'bad_notes'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'stale_revision'; end if;
  -- Lock the accessible client row against a concurrent archive. No values change.
  perform 1 from public.clients c where c.id=p_client_id and c.status is distinct from 'archived' for update;
  if not found then raise exception 'client_not_available'; end if;
  insert into public.agency_client_management(client_id,updated_by)
    values(p_client_id,auth.uid()) on conflict (client_id) do nothing;
  select * into saved from public.agency_client_management m where m.client_id=p_client_id for update;
  if not found then raise exception 'client_not_available'; end if;
  if saved.revision<>p_expected_revision then raise exception 'stale_revision'; end if;
  update public.agency_client_management m set
    stage=p_stage,notes=p_notes,revision=m.revision+1,updated_at=now(),updated_by=auth.uid()
    where m.client_id=p_client_id returning * into saved;
  return saved;
end;
$$;
revoke all on function public.agency_save_client_management(uuid,text,text,bigint) from public, anon;
grant execute on function public.agency_save_client_management(uuid,text,text,bigint) to authenticated;
commit;
-- Pas de backfill, pas de suppression, pas d'email, aucun appel externe.
