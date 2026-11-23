-- ============================================================================
-- Test migration 0028 (liens de saisie des KPI). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
--   • anon ne lit rien ; un setter ou un closer ne voit ni les personnes ni les jetons ;
--   • un membre de l'agence avec le droit KPI lit les saisies et les noms (sans jeton), pas les jetons ;
--   • l'administrateur lit et gère ; personne n'écrit une saisie par une session (clé service seulement) ;
--   • contraintes : rôle, jeton, date, taille, une saisie par personne et par jour.
-- ============================================================================
begin;
set local search_path = public;
insert into auth.users (id, email) values
  ('eeee0000-0000-4000-8000-000000000001','admin@icon-flow.test'), ('eeee0000-0000-4000-8000-000000000002','setter@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000003','closer@icon-flow.test'), ('eeee0000-0000-4000-8000-000000000004','client@icon-flow.test'),
  ('eeee0000-0000-4000-8000-000000000005','membre@icon-flow.test');
update profiles set role='agency', permissions=null where id='eeee0000-0000-4000-8000-000000000001';
update profiles set role='marketing', marketing_role='setter', client_id=null, permissions='["marketing_espace","marketing_prospects","marketing_classement"]'::jsonb where id='eeee0000-0000-4000-8000-000000000002';
-- Un commercial à qui l'on aurait coché « Réglages marketing » (l'app ne le permet pas) : toujours rien.
update profiles set role='marketing', marketing_role='closer', client_id=null, permissions='["marketing_espace","marketing_classement","marketing_reglages"]'::jsonb where id='eeee0000-0000-4000-8000-000000000003';
update profiles set role='agency', permissions='["marketing_classement","marketing_dashboard"]'::jsonb where id='eeee0000-0000-4000-8000-000000000005';

-- ── 1. Contraintes (écriture par la clé service, simulée ici par le propriétaire des tables) ──
do $$ declare cl uuid; s uuid; c uuid; begin
  insert into clients (name, slug) values ('Client test kpi', 'client-test-kpi') returning id into cl;
  update profiles set role='client', client_id=cl where id='eeee0000-0000-4000-8000-000000000004';
  if (select (value->>'version')::int from marketing_settings where key='schema') < 28 then raise exception 'FAIL version de schéma'; end if;

  insert into marketing_kpi_people (name, role, token, created_by) values ('Sam (lien)', 'setter', 'tok_setter_0123456789abcdefghijklmnopqrstuv', 'eeee0000-0000-4000-8000-000000000001') returning id into s;
  insert into marketing_kpi_people (name, email, role, token) values ('Cléo (lien)', 'cleo@exemple.test', 'closer', 'tok_closer_0123456789abcdefghijklmnopqrstuv') returning id into c;
  if not (select active from marketing_kpi_people where id = s) then raise exception 'FAIL une personne ajoutée n''est pas active par défaut'; end if;
  begin insert into marketing_kpi_people (name, role, token) values ('X', 'media_buyer', 'tok_mb_0123456789abcdefghijklmnopqrstuvwxyz'); raise exception 'FAIL rôle inconnu accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_people (name, role, token) values ('X', 'setter', 'court'); raise exception 'FAIL jeton trop court accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_people (name, role, token) values ('X', 'setter', 'avec des espaces 0123456789abcdefghijklmnop'); raise exception 'FAIL jeton avec des caractères interdits accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_people (name, role, token) values ('   ', 'setter', 'tok_vide_0123456789abcdefghijklmnopqrstuvwx'); raise exception 'FAIL nom vide accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_people (name, role, token) values (repeat('a', 121), 'setter', 'tok_long_0123456789abcdefghijklmnopqrstuvwx'); raise exception 'FAIL nom de plus de 120 caractères accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_people (name, role, token) values ('Doublon', 'setter', 'tok_setter_0123456789abcdefghijklmnopqrstuv'); raise exception 'FAIL deux personnes avec le même jeton';
  exception when unique_violation then null; end;

  insert into marketing_kpi_person_entries (person_id, day, metrics, note) values (s, current_date, '{"appels": 30, "decroches": 9}', 'Bonne journée');
  insert into marketing_kpi_person_entries (person_id, day, metrics) values (c, current_date - 1, '{"relances": 4}');
  begin insert into marketing_kpi_person_entries (person_id, day, metrics) values (s, current_date, '{"appels": 1}'); raise exception 'FAIL deux saisies pour la même personne et le même jour';
  exception when unique_violation then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day, metrics) values (s, current_date + 10, '{}'); raise exception 'FAIL saisie datée dans le futur';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day, metrics) values (s, current_date - 2, '[1,2]'); raise exception 'FAIL suivi qui n''est pas un objet';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day, metrics) values (s, current_date - 3, jsonb_build_object('x', repeat('y', 3000))); raise exception 'FAIL suivi trop gros accepté';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day, note) values (s, current_date - 4, repeat('n', 1001)); raise exception 'FAIL remarque de plus de 1000 caractères';
  exception when check_violation then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day) values (gen_random_uuid(), current_date); raise exception 'FAIL saisie sans personne';
  exception when foreign_key_violation then null; end;
  raise notice 'PASS contraintes : rôle setter ou closer, jeton long et sans caractère interdit, unique ; une saisie par personne et par jour, jamais dans le futur, taille bornée';
end $$;

-- ── 2. Le public (anon) : rien ──
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
do $$ begin
  begin perform count(*) from marketing_kpi_people; raise exception 'FAIL anon lit les personnes';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from marketing_kpi_person_entries; raise exception 'FAIL anon lit les saisies';
  exception when insufficient_privilege then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day) values ((select gen_random_uuid()), current_date); raise exception 'FAIL anon écrit une saisie';
  exception when insufficient_privilege then null; end;
  begin perform * from marketing_kpi_link_people(); raise exception 'FAIL anon appelle la liste des noms';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS anon : ni personnes, ni jetons, ni saisies, ni noms';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
-- ── 3. Setter : rien de ces tables, pas même par la fonction des noms ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from marketing_kpi_people) <> 0 then raise exception 'FAIL setter lit les personnes (et leurs jetons)'; end if;
  if (select count(*) from marketing_kpi_person_entries) <> 0 then raise exception 'FAIL setter lit les saisies par lien'; end if;
  if (select count(*) from marketing_kpi_link_people()) <> 0 then raise exception 'FAIL setter lit les noms des personnes'; end if;
  begin insert into marketing_kpi_people (name, role, token) values ('Moi', 'setter', 'tok_setter_x_0123456789abcdefghijklmnopqrstu'); raise exception 'FAIL setter ajoute une personne';
  exception when insufficient_privilege then null; end;
  begin insert into marketing_kpi_person_entries (person_id, day) values ((select gen_random_uuid()), current_date); raise exception 'FAIL setter écrit une saisie par lien';
  exception when insufficient_privilege then null; end;
  update marketing_kpi_people set token = 'tok_vole_0123456789abcdefghijklmnopqrstuvwx'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL setter change un jeton'; end if;
  raise notice 'PASS setter : ni personnes, ni jetons, ni saisies par lien';
end $$;
-- Closer avec « Réglages marketing » coché par erreur : la base refuse toujours (il n'est pas de l'agence).
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from marketing_kpi_people) <> 0 or (select count(*) from marketing_kpi_person_entries) <> 0 then raise exception 'FAIL closer lit les personnes ou les saisies par lien'; end if;
  begin insert into marketing_kpi_people (name, role, token) values ('Moi', 'closer', 'tok_closer_x_0123456789abcdefghijklmnopqrstu'); raise exception 'FAIL closer ajoute une personne';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS closer (même avec Réglages coché) : rien';
end $$;
-- ── 4. Membre de l'agence avec le droit KPI, sans Réglages : saisies et noms, jamais les jetons ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000005',true);
do $$ declare n int; begin
  if (select count(*) from marketing_kpi_person_entries) <> 2 then raise exception 'FAIL membre KPI : ne lit pas les saisies par lien'; end if;
  if (select count(*) from marketing_kpi_people) <> 0 then raise exception 'FAIL membre sans Réglages lit les jetons'; end if;
  if (select count(*) from marketing_kpi_link_people()) <> 2 then raise exception 'FAIL membre KPI : ne lit pas les noms'; end if;
  if (select string_agg(name, ',' order by name) from marketing_kpi_link_people()) <> 'Cléo (lien),Sam (lien)' then raise exception 'FAIL noms inattendus'; end if;
  delete from marketing_kpi_person_entries; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL membre sans Réglages efface une saisie'; end if;
  begin update marketing_kpi_person_entries set metrics = '{"appels": 999}'; raise exception 'FAIL membre modifie une saisie';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS membre agence (KPI) : saisies et noms lisibles, jetons et coordonnées non, aucune écriture';
end $$;
-- ── 5. Administrateur : lit et gère ; n'écrit pas de saisie lui-même ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000001',true);
do $$ declare n int; s uuid; nouveau uuid; begin
  if (select count(*) from marketing_kpi_people where char_length(token) >= 32) <> 2 then raise exception 'FAIL administrateur : ne lit pas les personnes et leurs jetons'; end if;
  insert into marketing_kpi_people (name, role, token, created_by) values ('Nina (lien)', 'setter', 'tok_nina_0123456789abcdefghijklmnopqrstuvwx', auth.uid()) returning id into nouveau;
  select id into s from marketing_kpi_people where name = 'Sam (lien)';
  update marketing_kpi_people set token = 'tok_nouveau_0123456789abcdefghijklmnopqrstu', updated_at = now() where id = s; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas donner un nouveau lien'; end if;
  if exists (select 1 from marketing_kpi_people where token = 'tok_setter_0123456789abcdefghijklmnopqrstuv') then raise exception 'FAIL l''ancien jeton existe encore'; end if;
  update marketing_kpi_people set active = false where id = s; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas désactiver'; end if;
  if (select count(*) from marketing_kpi_person_entries) <> 2 then raise exception 'FAIL administrateur ne lit pas les saisies'; end if;
  begin insert into marketing_kpi_person_entries (person_id, day) values (nouveau, current_date); raise exception 'FAIL une session écrit une saisie (réservé au lien)';
  exception when insufficient_privilege then null; end;
  delete from marketing_kpi_person_entries where person_id = s; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas effacer une saisie'; end if;
  -- Supprimer une personne efface ses saisies (cascade).
  delete from marketing_kpi_people where name = 'Cléo (lien)'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL administrateur ne peut pas supprimer une personne'; end if;
  if (select count(*) from marketing_kpi_person_entries) <> 0 then raise exception 'FAIL saisies orphelines après suppression'; end if;
  raise notice 'PASS administrateur : ajoute, renouvelle le lien, désactive, efface, supprime ; aucune saisie écrite par une session';
end $$;
-- ── 6. Compte client du portail : rien ──
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from marketing_kpi_people) <> 0 or (select count(*) from marketing_kpi_person_entries) <> 0 or (select count(*) from marketing_kpi_link_people()) <> 0 then raise exception 'FAIL un compte client voit des liens de saisie'; end if;
  raise notice 'PASS compte client du portail : rien';
end $$;
rollback;
