-- Requêtes de revue seulement. NON EXÉCUTÉES par Codex.
-- À lancer par l'administrateur du projet de test, sans divulguer les données.
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('clients','profiles','agency_client_management') order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('clients','profiles','agency_client_management');
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('clients','profiles','agency_client_management');
select t.tgname, pg_get_triggerdef(t.oid), p.proname
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and n.nspname='public' and c.relname in ('clients','profiles');
select n.nspname,p.proname,p.prosecdef,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('client_decide_script','agency_save_client_management');
select c.conname,pg_get_constraintdef(c.oid) from pg_constraint c
join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname in ('clients','profiles','agency_client_management');
