-- Retour arrière de 0029 : remet la règle d'origine (agence ou client seulement).
-- Attention : impossible tant qu'un profil « marketing » existe ; la règle est alors posée « not valid »
-- (elle s'applique aux nouveaux profils), et les comptes marketing existants restent intacts.
set client_min_messages = warning;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('agency', 'client')) not valid;
