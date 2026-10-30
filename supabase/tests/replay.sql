-- ============================================================================
-- Rejouer 0001 et 0002 sur une base déjà en 0005 ne doit rien rétrograder. ROLLBACK à la fin.
-- (à lancer depuis la racine du dépôt, après les cinq migrations)
-- ============================================================================
begin;
set local client_min_messages = warning;
\i supabase/migrations/0001_baseline.sql
\i supabase/migrations/0002_studio_v2.sql
set local client_min_messages = notice;
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and policyname in ('clients_agency_all','tasks_agency_all','brain_entries_agency_all','knowledge_agency_all','api_tokens_agency_all','agency_management_read','agency_management_insert','agency_management_update','activity_agency_all','invoices_agency_all','documents_agency_all','files_agency_all','messages_agency_all')) then
    raise exception 'FAIL une politique historique permissive a été recréée';
  end if;
  if pg_get_functiondef('public.my_role()'::regprocedure) not like '%disabled_at%' then raise exception 'FAIL my_role rétrogradé'; end if;
  if pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%invited_at%' then raise exception 'FAIL handle_new_user rétrogradé'; end if;
  if pg_get_functiondef('public.transition_livrable(uuid,text,text)'::regprocedure) not like '%forbidden_module%' then raise exception 'FAIL transition_livrable rétrogradé'; end if;
  if pg_get_functiondef('public.agency_transition_brief(uuid,text)'::regprocedure) not like '%forbidden_module%' then raise exception 'FAIL agency_transition_brief rétrogradé'; end if;
  if not exists (select 1 from pg_policies where tablename='clients' and policyname='clients_agency_write') then raise exception 'FAIL politiques 0005 absentes'; end if;
  raise notice 'PASS rejouer 0001 et 0002 après 0005 : aucune régression (politiques et fonctions conservées)';
end $$;
rollback;
