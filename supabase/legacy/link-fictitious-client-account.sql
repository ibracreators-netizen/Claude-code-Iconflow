-- PROPOSITION NON EXÉCUTÉE. Rattache un utilisateur Auth EXISTANT et FICTIF.
-- Ne crée pas auth.users. Ne configure pas de mot de passe, n'envoie aucun email.
-- À revoir puis exécuter dans la session SQL administrateur autorisée.
begin;
set local review.new_auth_user_id = 'REPLACE_EXISTING_FICTITIOUS_AUTH_UUID';
set local review.target_client_id = 'REPLACE_TEST_CLIENT_UUID';
do $$
declare u uuid:=current_setting('review.new_auth_user_id')::uuid;
        c uuid:=current_setting('review.target_client_id')::uuid;
        old public.profiles;
begin
  if not exists(select 1 from auth.users where id=u and (email like '%.test' or email like '%.invalid')) then raise exception 'Fictitious Auth fixture required (.test/.invalid)'; end if;
  if not exists(select 1 from public.clients where id=c and status is distinct from 'archived') then raise exception 'Active test client missing'; end if;
  select * into old from public.profiles where id=u for update;
  if found then
    if old.role<>'client' or old.client_id is distinct from c then
      raise exception 'Existing profile or assignment differs: no role/assignment overwritten';
    end if;
  else
    insert into public.profiles(id,role,client_id) values(u,'client',c);
  end if;
end;
$$;
-- Revoir les résultats avant tout COMMIT. Ce brouillon est volontairement rollback.
select id,role,client_id from public.profiles where id=current_setting('review.new_auth_user_id')::uuid;
rollback;
-- Après validation explicite uniquement : remplacer le dernier ROLLBACK par COMMIT.
