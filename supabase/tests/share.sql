-- ============================================================================
-- Test migration 0007 (partage public de brief). ROLLBACK à la fin.
-- La page publique lit par la clé service (hors RLS) ; on vérifie ici qu'aucune
-- politique anonyme n'a été ouverte : même avec le jeton, anon et client ne lisent rien.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000001','ibracreators@gmail.com');
insert into clients (id, name, slug, status) values ('22222222-0000-4000-8000-000000000001','Koya','koya','active');
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000002','client@koya.test');
update profiles set client_id='22222222-0000-4000-8000-000000000001' where id='cccccccc-0000-4000-8000-000000000002';
insert into clients (id, name, slug, status) values ('22222222-0000-4000-8000-000000000002','Autre','autre','active');
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003','client@autre.test');
update profiles set client_id='22222222-0000-4000-8000-000000000002' where id='cccccccc-0000-4000-8000-000000000003';
insert into briefs (id, client_id, month, kind, title, status, content, public_token, published_at) values
  ('e0000000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001', date_trunc('month', now())::date, 'video', 'Brief publié', 'attente_client', '{}'::jsonb, 'tok_public_123456789', now());

do $$ begin
  if (select count(*) from briefs where public_token = 'tok_public_123456789') <> 1 then raise exception 'FAIL colonne public_token absente ou non lisible (postgres)'; end if;
  raise notice 'PASS colonne public_token présente et unique';
end $$;

-- Le jeton est unique : deux briefs ne peuvent pas le partager.
do $$ begin
  begin
    insert into briefs (client_id, month, kind, title, status, content, public_token) values
      ('22222222-0000-4000-8000-000000000002', date_trunc('month', now())::date, 'video', 'Doublon', 'redaction', '{}'::jsonb, 'tok_public_123456789');
    raise exception 'FAIL jeton dupliqué accepté';
  exception when unique_violation then raise notice 'PASS jeton unique imposé par la base';
  end;
end $$;

set local role authenticated;

-- Anonyme/non rattaché : aucune lecture de brief, même avec le jeton.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000ff',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  if (select count(*) from briefs where public_token = 'tok_public_123456789') <> 0 then raise exception 'FAIL un compte sans profil lit un brief via le jeton'; end if;
  raise notice 'PASS compte sans profil : aucun brief par le jeton';
end $$;

-- Client d'un AUTRE compte : ne lit pas le brief publié d'un autre client, jeton ou pas.
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from briefs where public_token = 'tok_public_123456789') <> 0 then raise exception 'FAIL un autre client lit le brief via le jeton'; end if;
  raise notice 'PASS autre client : le jeton ne contourne pas la RLS';
end $$;

reset role;
rollback;
