-- ============================================================================
-- Test migration 0008 (espace Marketing). ROLLBACK à la fin.
-- Vérifie l'INDÉPENDANCE RÉELLE des droits (RLS par module, pas my_role='agency')
-- et l'anti-double-réservation par la base, par requêtes directes sous chaque rôle.
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('aaaa0000-0000-4000-8000-000000000001','ibracreators@gmail.com');           -- accès complet
insert into auth.users (id, email) values ('aaaa0000-0000-4000-8000-000000000002','studio@icon-flow.fr');              -- Studio seulement
insert into auth.users (id, email) values ('aaaa0000-0000-4000-8000-000000000003','prospects@icon-flow.fr');           -- Marketing : prospects seulement
insert into auth.users (id, email) values ('aaaa0000-0000-4000-8000-000000000004','cal@icon-flow.fr');                 -- Marketing : calendrier
update profiles set role='agency', permissions='["livrables","briefs"]'::jsonb where id='aaaa0000-0000-4000-8000-000000000002';
update profiles set role='agency', permissions='["marketing_prospects"]'::jsonb where id='aaaa0000-0000-4000-8000-000000000003';
update profiles set role='agency', permissions='["marketing_calendrier"]'::jsonb where id='aaaa0000-0000-4000-8000-000000000004';

insert into marketing_prospects (id, name, email, status) values ('bbbb0000-0000-4000-8000-000000000001','Lead A','lead@a.co','nouveau');

do $$ begin
  if not exists (select 1 from pg_proc where proname='my_has_marketing') then raise exception 'FAIL my_has_marketing absente'; end if;
  raise notice 'PASS schéma 0008 en place';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- ── Membre Studio seulement : AUCUN accès Marketing, même par requête directe ──
select set_config('request.jwt.claim.sub','aaaa0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from marketing_prospects) <> 0 then raise exception 'FAIL membre Studio lit les prospects Marketing'; end if;
  begin
    insert into marketing_prospects (name, email) values ('X','x@x.co');
    raise exception 'FAIL membre Studio a pu écrire un prospect';
  exception when insufficient_privilege or others then
    get stacked diagnostics n = returned_sqlstate; if n::text = 'P0001' then raise; end if;
  end;
  if (select count(*) from marketing_appointments) <> 0 then raise exception 'FAIL membre Studio lit les rendez-vous'; end if;
  if (select count(*) from marketing_scheduled_emails) <> 0 then raise exception 'FAIL membre Studio lit la file d''emails'; end if;
  raise notice 'PASS membre Studio : aucun accès aux données Marketing (lecture et écriture refusées)';
end $$;

-- ── Membre Marketing « prospects » : prospects OUI, calendrier/relances NON ──
select set_config('request.jwt.claim.sub','aaaa0000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from marketing_prospects) <> 1 then raise exception 'FAIL membre prospects ne lit pas les prospects'; end if;
  insert into marketing_prospects (name, email, status) values ('Lead B','lead@b.co','nouveau');     -- autorisé
  if (select count(*) from marketing_appointments) <> 0 then raise exception 'FAIL membre prospects lit les rendez-vous (module absent)'; end if;
  begin
    insert into marketing_appointments (prospect_id, starts_at, ends_at) values ('bbbb0000-0000-4000-8000-000000000001', now(), now() + interval '30 min');
    raise exception 'FAIL membre prospects a pu créer un rendez-vous';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS membre prospects : prospects accessibles, calendrier refusé';
end $$;

-- ── Membre Marketing « calendrier » : anti-double-réservation par la base ──
select set_config('request.jwt.claim.sub','aaaa0000-0000-4000-8000-000000000004',true);
do $$ begin
  insert into marketing_appointments (prospect_id, starts_at, ends_at, status) values ('bbbb0000-0000-4000-8000-000000000001','2026-11-12 09:00:00+00','2026-11-12 09:30:00+00','confirme');
  begin
    insert into marketing_appointments (prospect_id, starts_at, ends_at, status) values ('bbbb0000-0000-4000-8000-000000000001','2026-11-12 09:15:00+00','2026-11-12 09:45:00+00','confirme');
    raise exception 'FAIL deux rendez-vous confirmés qui se chevauchent ont été acceptés';
  exception when exclusion_violation then raise notice 'PASS anti-double-réservation : le chevauchement est refusé par la base';
  end;
  -- créneau adjacent accepté (pas de chevauchement)
  insert into marketing_appointments (prospect_id, starts_at, ends_at, status) values ('bbbb0000-0000-4000-8000-000000000001','2026-11-12 09:30:00+00','2026-11-12 10:00:00+00','confirme');
  raise notice 'PASS membre calendrier : rendez-vous créés, créneau adjacent accepté';
end $$;

-- ── Accès complet : tout visible ──
select set_config('request.jwt.claim.sub','aaaa0000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from marketing_prospects) < 2 then raise exception 'FAIL accès complet ne lit pas les prospects'; end if;
  if (select count(*) from marketing_appointments) < 2 then raise exception 'FAIL accès complet ne lit pas les rendez-vous'; end if;
  raise notice 'PASS accès complet : prospects et rendez-vous visibles';
end $$;

reset role;
rollback;
