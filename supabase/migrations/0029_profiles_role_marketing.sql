-- ============================================================================
-- 0029 — Rôle « marketing » accepté sur les profils (invitations Marketing).
-- La base en ligne porte une règle ancienne, profiles_role_check, qui n'accepte que 'agency' et 'client'.
-- Les migrations ne l'avaient jamais élargie : inviter un setter, un closer ou un media buyer échouait avec
-- « new row for relation "profiles" violates check constraint "profiles_role_check" ».
-- Additive et rejouable : la règle est remplacée par la même liste plus 'marketing'.
-- Retour arrière : supabase/rollbacks/0029_profiles_role_marketing.down.sql
-- ============================================================================
set client_min_messages = warning;

alter table public.profiles drop constraint if exists profiles_role_check;
-- « not valid » : la règle s'applique tout de suite aux nouvelles lignes ; les lignes existantes sont vérifiées
-- juste après, sans faire échouer la migration si une valeur ancienne inattendue existait.
alter table public.profiles add constraint profiles_role_check check (role in ('agency', 'client', 'marketing')) not valid;
do $$
begin
  alter table public.profiles validate constraint profiles_role_check;
exception when check_violation then
  raise notice 'profiles_role_check : des profils existants ont un rôle hors liste ; la règle vaut pour les nouveaux profils.';
end $$;
