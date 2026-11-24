-- Test de 0029 (base de TEST, finit par rollback) : un profil « marketing » est accepté, un rôle inconnu refusé.
begin;
do $$
declare uid uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users (id, email) values (uid, 'test-0029@exemple.invalid');
  update public.profiles set role = 'marketing', marketing_role = 'setter', client_id = null where id = uid;
  if not found then insert into public.profiles (id, role, marketing_role) values (uid, 'marketing', 'setter'); end if;
  raise notice 'PASS profil marketing accepté';
  begin
    update public.profiles set role = 'inconnu' where id = uid;
    raise notice 'FAIL un rôle inconnu a été accepté';
  exception when check_violation then raise notice 'PASS rôle inconnu refusé';
  end;
end $$;
rollback;
