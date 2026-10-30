-- ============================================================================
-- Iconflow Studio — 0005 DROITS PAR MODULE AU NIVEAU BASE (additif, idempotent)
-- Jusqu'ici, les droits par module (profiles.permissions) et le retrait d'accès
-- (profiles.disabled_at) n'étaient appliqués que par l'interface. Ils le sont
-- désormais par la RLS elle-même : un membre limité à « Livrables » ne lit ni
-- n'écrit les factures même en interrogeant l'API Supabase directement, un
-- compte retiré perd tout accès immédiatement, et seul un administrateur à
-- accès complet peut toucher un autre administrateur.
-- ============================================================================

set client_min_messages = warning; -- pas de bruit « policy does not exist » lors des relances

-- ─── Helpers de droits ─────────────────────────────────────────────────────
-- Un compte dont l'accès est retiré n'a plus de rôle : toutes les politiques le refusent.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and disabled_at is null
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and disabled_at is null
$$;

-- Droits du membre connecté (null = accès complet ou pas un membre agence : voir my_is_full_access).
create or replace function public.my_permissions() returns jsonb
language sql stable security definer set search_path = public as $$
  select permissions from public.profiles where id = auth.uid() and role = 'agency' and disabled_at is null
$$;

create or replace function public.my_is_full_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'agency' and p.disabled_at is null and p.permissions is null
                   from public.profiles p where p.id = auth.uid()), false)
$$;

-- Vrai si le membre agence connecté a accès au module (tableau de bord et paramètres : toujours).
create or replace function public.my_has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'agency' and p.disabled_at is null
       and (p.permissions is null
            or p_module in ('dashboard','parametres')
            or (jsonb_typeof(p.permissions) = 'array' and p.permissions ? p_module))
    from public.profiles p where p.id = auth.uid()), false)
$$;

revoke all on function public.my_permissions() from public;
revoke all on function public.my_is_full_access() from public;
revoke all on function public.my_has_module(text) from public;
grant execute on function public.my_permissions() to authenticated, anon;
grant execute on function public.my_is_full_access() to authenticated, anon;
grant execute on function public.my_has_module(text) to authenticated, anon;

-- ─── Politiques agence par module ──────────────────────────────────────────
-- Lecture agence : données de référence lisibles par tout membre (noms de clients,
-- briefs et livrables cités partout). Écriture : module requis.
-- Tables privées (factures, tâches, documents, fichiers, messagerie, planning,
-- performance, Brain) : lecture ET écriture soumises au module.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('clients',           'clients_agency_all',        true,  $c$my_has_module('clients') or my_has_module('pipeline')$c$),
      ('contacts',          'contacts_agency_all',       false, $c$my_has_module('clients')$c$),
      ('briefs',            'briefs_agency_all',         true,  $c$my_has_module('briefs')$c$),
      ('livrables',         'livrables_agency_all',      true,  $c$my_has_module('livrables')$c$),
      ('livrable_comments', 'comments_agency_all',       true,  $c$my_has_module('livrables')$c$),
      ('validations',       'validations_agency_all',    true,  $c$my_has_module('livrables') or my_has_module('briefs')$c$),
      ('avatars',           'avatars_agency_all',        true,  $c$my_has_module('brain')$c$),
      ('angles',            'angles_agency_all',         true,  $c$my_has_module('brain')$c$),
      ('brand_dossiers',    'dossiers_agency_all',       false, $c$my_has_module('brain')$c$),
      ('brain_entries',     'brain_entries_agency_all',  false, $c$my_has_module('brain')$c$),
      ('knowledge',         'knowledge_agency_all',      false, $c$my_has_module('brain')$c$),
      ('deposits',          'deposits_agency_all',       false, $c$my_has_module('fichiers')$c$),
      ('api_tokens',        'api_tokens_agency_all',     false, $c$my_is_full_access()$c$),
      ('tasks',             'tasks_agency_all',          false, $c$my_has_module('taches')$c$),
      ('documents',         'documents_agency_all',      false, $c$my_has_module('documents')$c$),
      ('files',             'files_agency_all',          false, $c$my_has_module('fichiers')$c$),
      ('invoices',          'invoices_agency_all',       false, $c$my_has_module('factures')$c$),
      ('calendar_events',   'events_agency_all',         false, $c$my_has_module('planning')$c$),
      ('metrics',           'metrics_agency_all',        false, $c$my_has_module('performance')$c$)
    ) as v(tbl, old_policy, read_all, write_cond)
  loop
    execute format('drop policy if exists %I on public.%I', spec.old_policy, spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_agency_read', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_agency_write', spec.tbl);
    if spec.read_all then
      execute format('create policy %I on public.%I for select to authenticated using (my_role() = ''agency'')', spec.tbl || '_agency_read', spec.tbl);
    end if;
    execute format('create policy %I on public.%I for all to authenticated using (%s) with check (%s)', spec.tbl || '_agency_write', spec.tbl, spec.write_cond, spec.write_cond);
  end loop;
end $$;

-- Messagerie : module requis, et un membre n'écrit qu'en son nom.
drop policy if exists messages_agency_all on public.messages;
drop policy if exists messages_agency_write on public.messages;
create policy messages_agency_write on public.messages for all to authenticated
  using (my_has_module('messages')) with check (my_has_module('messages') and author_id = auth.uid());

-- Imports Brain (lecture seule, legacy).
drop policy if exists brain_imports_agency_read on public.brain_imports;
create policy brain_imports_agency_read on public.brain_imports for select to authenticated using (my_has_module('brain'));

-- Suivi agence (étape pipeline + notes privées) : module Clients ou Pipeline.
drop policy if exists agency_management_read on public.agency_client_management;
drop policy if exists agency_management_insert on public.agency_client_management;
drop policy if exists agency_management_update on public.agency_client_management;
drop policy if exists management_agency_write on public.agency_client_management;
create policy management_agency_write on public.agency_client_management for all to authenticated
  using (my_has_module('clients') or my_has_module('pipeline'))
  with check ((my_has_module('clients') or my_has_module('pipeline')) and updated_by = auth.uid());

-- Journal d'activité : lisible par l'agence, chaque ligne signée par son auteur, jamais modifiable ni effaçable.
drop policy if exists activity_agency_all on public.activity_log;
drop policy if exists activity_agency_read on public.activity_log;
drop policy if exists activity_agency_insert on public.activity_log;
create policy activity_agency_read on public.activity_log for select to authenticated using (my_role() = 'agency');
create policy activity_agency_insert on public.activity_log for insert to authenticated with check (my_role() = 'agency' and actor_id = auth.uid());

-- Storage « studio » : fichiers et livrables.
drop policy if exists studio_agency_all on storage.objects;
create policy studio_agency_all on storage.objects for all to authenticated
  using (bucket_id = 'studio' and (my_has_module('fichiers') or my_has_module('livrables')))
  with check (bucket_id = 'studio' and (my_has_module('fichiers') or my_has_module('livrables')));

-- ─── Gestion des comptes ───────────────────────────────────────────────────
-- Le module « Équipe & accès » permet de gérer les comptes clients et les membres
-- à droits limités. Un membre à droits limités n'ajoute jamais un module qu'il
-- n'a pas lui-même, n'accorde jamais l'accès complet et ne touche pas aux
-- administrateurs à accès complet. Un rôle ne change jamais par cette voie.
drop policy if exists profiles_agency_manage on public.profiles;
create policy profiles_agency_manage on public.profiles for update to authenticated
  using (
    my_has_module('equipe') and id <> auth.uid()
    and (my_is_full_access() or role = 'client' or permissions is not null)
  )
  with check (
    my_has_module('equipe') and id <> auth.uid()
    and role = (select p.role from public.profiles p where p.id = profiles.id)
    and (
      my_is_full_access()
      or role = 'client'
      or (
        permissions is not null and jsonb_typeof(permissions) = 'array'
        -- on peut retirer n'importe quel module, mais n'ajouter que ceux que l'on possède soi-même
        and not exists (
          select 1 from jsonb_array_elements_text(permissions) e
          where not (coalesce(my_permissions(), '[]'::jsonb) ? e.value)
            and not (coalesce((select p.permissions from public.profiles p where p.id = profiles.id), '[]'::jsonb) ? e.value)
        )
      )
    )
  );

-- Il reste toujours au moins un administrateur à accès complet actif.
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'agency' and old.permissions is null and old.disabled_at is null
     and (new.disabled_at is not null or new.permissions is not null or new.role is distinct from 'agency') then
    if not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'agency' and p.permissions is null and p.disabled_at is null) then
      raise exception 'last_admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update on public.profiles
  for each row execute function public.protect_last_admin();

-- ─── Profil automatique : aucune confiance aux métadonnées d'inscription ───
-- Les métadonnées (raw_user_meta_data) sont fournies par l'utilisateur lui-même :
-- on n'en tire jamais un rôle, un rattachement client ni un invitant. Un compte
-- auto-inscrit est un client sans espace (donc sans accès) ; les invitations
-- faites depuis le studio complètent le profil juste après, avec la clé service.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select coalesce((select value from app_settings where key = 'admin_emails') ? lower(new.email), false) into is_admin;
  insert into public.profiles (id, role, client_id, display_name, email)
    values (new.id, case when is_admin then 'agency' else 'client' end, null,
            coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)), new.email)
    on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- ─── RPC : module requis et libellés lisibles dans le journal ──────────────
create or replace function public.agency_save_client_management(p_client_id uuid, p_stage text, p_notes text, p_expected_revision bigint)
returns public.agency_client_management language plpgsql security invoker set search_path = '' as $body$
declare saved public.agency_client_management; previous_stage text; client_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'agency' then raise exception 'not_an_agency'; end if;
  if not (public.my_has_module('clients') or public.my_has_module('pipeline')) then raise exception 'forbidden_module'; end if;
  if p_stage is null or p_stage not in ('onboarding','in_progress','completed') then raise exception 'bad_stage'; end if;
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
    insert into public.activity_log(kind, actor_id, client_id, summary)
      values ('client.stage', auth.uid(), p_client_id,
              client_name || ' → ' || case p_stage when 'onboarding' then 'Onboarding' when 'in_progress' then 'En cours' else 'Terminé' end);
  end if;
  return saved;
end $body$;
revoke all on function public.agency_save_client_management(uuid,text,text,bigint) from public, anon;
grant execute on function public.agency_save_client_management(uuid,text,text,bigint) to authenticated;

create or replace function public.transition_livrable(p_livrable_id uuid, p_next text, p_comment text default null)
returns public.livrables language plpgsql security definer set search_path = public as $$
declare l public.livrables; r text := my_role(); allowed boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if r = 'agency' and not my_has_module('livrables') then raise exception 'forbidden_module'; end if;
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
    values (case when r = 'client' then 'validation' else 'livrable.status' end, auth.uid(), l.client_id, l.id,
            l.title || ' → ' || case p_next when 'en_controle' then 'Contrôle agence' when 'attente_client' then 'Attente client'
                                             when 'valide' then 'Validé' when 'correction' then 'Correction demandée' else p_next end);
  return l;
end $$;
revoke all on function public.transition_livrable(uuid,text,text) from public, anon;
grant execute on function public.transition_livrable(uuid,text,text) to authenticated;

create or replace function public.agency_transition_brief(p_brief_id uuid, p_next text)
returns public.briefs language plpgsql security definer set search_path = public as $$
declare b public.briefs; expected text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() is distinct from 'agency' then raise exception 'not_an_agency'; end if;
  if not my_has_module('briefs') then raise exception 'forbidden_module'; end if;
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
    values ('brief.status', auth.uid(), b.client_id, b.id,
            b.title || ' → ' || case b.status when 'redaction' then 'En rédaction' when 'attente_ibra' then 'Contrôle Ibra'
                                              when 'attente_client' then 'Attente client' when 'valide' then 'Validé' else b.status end);
  return b;
end $$;
revoke all on function public.agency_transition_brief(uuid,text) from public, anon;
grant execute on function public.agency_transition_brief(uuid,text) to authenticated;

-- Décision client sur un script : désormais journalisée (comme en démo), pour l'historique de chaque compte.
create or replace function public.client_decide_script(p_brief_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
    values ('validation', auth.uid(), b.client_id, b.id, b.title || ' : ' || case when p_decision = 'valide' then 'validé par le client' else 'correction demandée' end);
  return jsonb_build_object('id', v.id, 'item_ref', v.item_ref, 'decision', v.decision);
end $$;
revoke all on function public.client_decide_script(uuid,text,text) from public, anon;
grant execute on function public.client_decide_script(uuid,text,text) to authenticated;

-- ─── Rattrapage : le statut d'accès du client suit l'étape du pipeline ─────
-- (plus d'étiquette « Onboarding » sur une carte classée « En cours »).
update public.clients c set status = 'active'
  from public.agency_client_management m
  where m.client_id = c.id and c.status = 'onboarding' and m.stage <> 'onboarding';
update public.clients c set status = 'onboarding'
  from public.agency_client_management m
  where m.client_id = c.id and c.status = 'active' and m.stage = 'onboarding';
