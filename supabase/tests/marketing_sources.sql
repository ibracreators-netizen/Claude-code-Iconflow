-- ============================================================================
-- Test migration 0020 (rendez-vous venus d'un outil externe). ROLLBACK à la fin.
-- À lancer sur une base de TEST, jamais sur la production.
-- ============================================================================
begin;
set local search_path = public;
do $$ declare p1 uuid; p2 uuid; begin
  insert into marketing_prospects (name, email) values ('A', 'a-src@exemple.fr') returning id into p1;
  insert into marketing_prospects (name, email) values ('B', 'b-src@exemple.fr') returning id into p2;
  -- Deux closers, deux appels à la même heure dans l'outil externe : accepté.
  insert into marketing_appointments (prospect_id, starts_at, ends_at, source, external_id) values (p1, '2027-01-10 09:00+00', '2027-01-10 09:30+00', 'iclosed', '1');
  insert into marketing_appointments (prospect_id, starts_at, ends_at, source, external_id) values (p2, '2027-01-10 09:00+00', '2027-01-10 09:30+00', 'iclosed', '2');
  -- Le même rendez-vous externe ne peut pas exister deux fois.
  begin insert into marketing_appointments (prospect_id, starts_at, ends_at, source, external_id) values (p1, '2027-01-11 09:00+00', '2027-01-11 09:30+00', 'iclosed', '1'); raise exception 'FAIL doublon de rendez-vous externe accepté';
  exception when unique_violation then null; end;
  -- Dans l'app, l'anti-double-réservation reste en place.
  insert into marketing_appointments (prospect_id, starts_at, ends_at) values (p1, '2027-01-12 09:00+00', '2027-01-12 09:30+00');
  begin insert into marketing_appointments (prospect_id, starts_at, ends_at) values (p2, '2027-01-12 09:15+00', '2027-01-12 09:45+00'); raise exception 'FAIL chevauchement interne accepté';
  exception when exclusion_violation then null; end;
  -- Un rendez-vous externe à l'heure d'un rendez-vous interne : accepté.
  insert into marketing_appointments (prospect_id, starts_at, ends_at, source, external_id) values (p2, '2027-01-12 09:00+00', '2027-01-12 09:30+00', 'iclosed', '3');
  begin update marketing_appointments set result = 'inconnu' where external_id = '3'; raise exception 'FAIL résultat inconnu accepté';
  exception when check_violation then null; end;
  if (select result from marketing_appointments where external_id = '3') <> 'a_venir' then raise exception 'FAIL résultat par défaut'; end if;
  raise notice 'PASS rendez-vous externes : simultanés acceptés, doublon refusé, anti-double-réservation interne conservée';
end $$;
set local role anon;
do $$ begin
  begin perform count(*) from marketing_source_runs; raise exception 'FAIL anon lit le journal des synchronisations';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS public : aucun accès au journal des synchronisations';
end $$;
reset role;
rollback;
