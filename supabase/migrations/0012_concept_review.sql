-- ============================================================================
-- Iconflow Studio — 0012 REVUE PAR CONCEPT (additif, idempotent)
-- Le client relit, valide et peut modifier chaque script (concept) séparément,
-- au lieu d'une seule décision pour tout le brief.
--  - brief_concepts : statut par concept, qui/quand a décidé, commentaire de
--    correction, et historique des versions (pour revenir en arrière).
--  - un trigger remet un concept « à valider » dès que son contenu change
--    (édition agence ou client) — aucune modification applicative nécessaire.
--  - validations.concept_id : trace la décision au niveau du concept.
--  - RPC (security definer) : le client décide / modifie un de SES concepts.
-- ============================================================================
set client_min_messages = warning;

alter table public.brief_concepts add column if not exists status text not null default 'a_valider';
alter table public.brief_concepts add column if not exists decided_by uuid references public.profiles(id);
alter table public.brief_concepts add column if not exists decided_at timestamptz;
alter table public.brief_concepts add column if not exists review_comment text;
alter table public.brief_concepts add column if not exists history jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brief_concepts_status_chk') then
    alter table public.brief_concepts add constraint brief_concepts_status_chk check (status in ('a_valider','valide','correction'));
  end if;
end $$;

alter table public.validations add column if not exists concept_id uuid references public.brief_concepts(id) on delete set null;

-- Tout changement de contenu d'un concept le remet « à valider » (le client devra re-statuer).
create or replace function public.brief_concept_reset_review() returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content then
    new.status := 'a_valider';
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end $$;
drop trigger if exists brief_concepts_reset_review on public.brief_concepts;
create trigger brief_concepts_reset_review before update on public.brief_concepts
  for each row execute function public.brief_concept_reset_review();

-- Le client décide (valide / correction) UN de ses concepts. Le brief passe « validé » quand tous le sont.
create or replace function public.client_decide_concept(p_concept_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cpt public.brief_concepts; b public.briefs; ref text; remaining int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() is distinct from 'client' then raise exception 'not_a_client'; end if;
  select * into cpt from public.brief_concepts where id = p_concept_id for update;
  if not found then raise exception 'concept_not_found'; end if;
  select * into b from public.briefs where id = cpt.brief_id for update;
  if not found then raise exception 'brief_not_found'; end if;
  if b.client_id is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  if b.kind = 'statique' then raise exception 'static_brief_ibra_only'; end if;
  if b.status <> 'attente_client' then raise exception 'wrong_state:%', b.status; end if;
  if p_decision not in ('valide','correction') then raise exception 'bad_decision'; end if;

  update public.brief_concepts
     set status = p_decision, decided_by = auth.uid(), decided_at = now(),
         review_comment = case when p_decision = 'correction' then p_comment else null end
   where id = cpt.id;

  ref := 'script-v' || b.script_version || ' · ' || coalesce(nullif(btrim(cpt.title),''), left(cpt.id::text, 8));
  insert into public.validations(client_id, item_kind, brief_id, concept_id, item_ref, decision, comment, decided_by)
    values (b.client_id, 'script', b.id, cpt.id, ref, p_decision, p_comment, auth.uid());

  select count(*) into remaining from public.brief_concepts where brief_id = b.id and status <> 'valide';
  if p_decision = 'valide' and remaining = 0 then
    update public.briefs set status = 'valide', validated_by = auth.uid(), validated_at = now() where id = b.id;
    insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
      values ('validation', auth.uid(), b.client_id, b.id, b.title || ' : tous les scripts validés');
  else
    insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
      values ('validation', auth.uid(), b.client_id, b.id, coalesce(nullif(btrim(cpt.title),''),'Script') || ' : ' || case when p_decision = 'valide' then 'validé par le client' else 'correction demandée' end);
  end if;
  return jsonb_build_object('concept_id', cpt.id, 'status', p_decision);
end $$;
revoke all on function public.client_decide_concept(uuid, text, text) from public, anon;
grant execute on function public.client_decide_concept(uuid, text, text) to authenticated;

-- Le client modifie directement UN de ses concepts (version précédente conservée dans l'historique).
create or replace function public.client_edit_concept(p_concept_id uuid, p_title text, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cpt public.brief_concepts; b public.briefs; snap jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() is distinct from 'client' then raise exception 'not_a_client'; end if;
  select * into cpt from public.brief_concepts where id = p_concept_id for update;
  if not found then raise exception 'concept_not_found'; end if;
  select * into b from public.briefs where id = cpt.brief_id for update;
  if b.client_id is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  if b.kind = 'statique' then raise exception 'static_brief_ibra_only'; end if;
  if b.status <> 'attente_client' then raise exception 'wrong_state:%', b.status; end if;
  if p_content is null then raise exception 'empty_content'; end if;

  snap := jsonb_build_object('at', now(), 'by', auth.uid(), 'by_role', 'client', 'title', cpt.title, 'content', cpt.content);
  update public.brief_concepts
     set content = p_content,
         title = coalesce(nullif(btrim(p_title), ''), title),
         history = (coalesce(history, '[]'::jsonb) || jsonb_build_array(snap))
   where id = cpt.id;  -- le trigger remet status = 'a_valider' (contenu modifié)

  insert into public.activity_log(kind, actor_id, client_id, entity_id, summary)
    values ('note', auth.uid(), b.client_id, b.id, coalesce(nullif(btrim(cpt.title),''),'Script') || ' : modifié par le client');
  return jsonb_build_object('concept_id', cpt.id);
end $$;
revoke all on function public.client_edit_concept(uuid, text, jsonb) from public, anon;
grant execute on function public.client_edit_concept(uuid, text, jsonb) to authenticated;
