-- ============================================================================
-- Test migration 0017 (réception des leads). ROLLBACK à la fin : rien n'est gardé.
-- À lancer sur une base de TEST, jamais sur la production.
-- Prouve : insertion seule pour le public, anti-doublon, rien d'ignoré en silence,
-- aucune suppression, et lecture réservée au module « Réception ».
-- ============================================================================
begin;
set local search_path = public;

insert into auth.users (id, email) values ('cccc0000-0000-4000-8000-000000000001','admin@icon-flow.test');      -- accès complet
insert into auth.users (id, email) values ('cccc0000-0000-4000-8000-000000000002','studio@icon-flow.test');     -- Studio seulement
insert into auth.users (id, email) values ('cccc0000-0000-4000-8000-000000000003','reception@icon-flow.test');  -- Marketing : réception
update profiles set role='agency', permissions=null where id='cccc0000-0000-4000-8000-000000000001';
update profiles set role='agency', permissions='["livrables","briefs"]'::jsonb where id='cccc0000-0000-4000-8000-000000000002';
update profiles set role='agency', permissions='["marketing_reception"]'::jsonb where id='cccc0000-0000-4000-8000-000000000003';

-- ── 1. Le public (rôle anon) : insertion seule, par la fonction uniquement ──
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
do $$ declare r jsonb; r2 jsonb; begin
  begin perform count(*) from leads_inbox; raise exception 'FAIL anon lit leads_inbox';
  exception when insufficient_privilege then null; end;
  begin insert into leads_inbox (request_id, payload) values ('x','{}'::jsonb); raise exception 'FAIL anon insère directement dans leads_inbox';
  exception when insufficient_privilege then null; end;
  begin update leads_inbox set status='traite'; raise exception 'FAIL anon modifie leads_inbox';
  exception when insufficient_privilege then null; end;

  r := lead_inbox_receive('{"email":"Jean@Exemple.fr","prenom":"Jean","marque":"Maison J","site":"iconflow.fr","page":"/optin","landing_page":"/optin?utm_source=meta","referrer":"https://instagram.com/","utm":{"utm_source":"meta","utm_campaign":"sprint"},"suspect":false,"recu_le":"2026-11-15T08:00:00.000Z"}'::jsonb);
  if (r->>'ok') <> 'true' or (r->>'stored') <> 'true' or r->>'id' is null or (r->>'duplicate') <> 'false' then raise exception 'FAIL réponse inattendue : %', r; end if;
  -- Le même envoi rejoué (le site réessaie) : pas de doublon, même identifiant.
  r2 := lead_inbox_receive('{"email":"Jean@Exemple.fr","prenom":"Jean","marque":"Maison J","site":"iconflow.fr","page":"/optin","landing_page":"/optin?utm_source=meta","referrer":"https://instagram.com/","utm":{"utm_source":"meta","utm_campaign":"sprint"},"suspect":false,"recu_le":"2026-11-15T08:00:00.000Z"}'::jsonb);
  if (r2->>'duplicate') <> 'true' or r2->>'id' <> r->>'id' then raise exception 'FAIL le renvoi a créé un doublon : %', r2; end if;
  -- Champ piège rempli : gardé, marqué suspect (jamais jeté).
  r := lead_inbox_receive('{"email":"robot@exemple.fr","site":"iconflow.fr","suspect":true,"recu_le":"2026-11-15T08:01:00.000Z"}'::jsonb);
  if (r->>'ok') <> 'true' then raise exception 'FAIL lead suspect refusé au lieu d''être gardé'; end if;
  -- Charge illisible : refus net, l'appelant le sait.
  begin perform lead_inbox_receive('"texte"'::jsonb); raise exception 'FAIL charge non-objet acceptée';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS public : insertion seule par la fonction, anti-doublon, suspect gardé, charge illisible refusée';
end $$;
reset role;

do $$ declare n int; row leads_inbox; begin
  select count(*) into n from leads_inbox; if n <> 2 then raise exception 'FAIL % lignes au lieu de 2', n; end if;
  select * into row from leads_inbox where payload->>'email' = 'Jean@Exemple.fr';
  if row.status <> 'recu' or row.site <> 'iconflow.fr' or row.landing_page <> '/optin?utm_source=meta' or row.page <> '/optin' or row.utm->>'utm_campaign' <> 'sprint' or row.referrer <> 'https://instagram.com/' then raise exception 'FAIL origine du lead mal enregistrée : %', row; end if;
  if row.payload->>'marque' <> 'Maison J' then raise exception 'FAIL charge brute non conservée'; end if;
  select * into row from leads_inbox where payload->>'email' = 'robot@exemple.fr';
  if row.status <> 'suspect' or row.error is null then raise exception 'FAIL lead au champ piège non marqué suspect'; end if;
  raise notice 'PASS enregistrement : page d''entrée, campagne, site d''origine et charge brute conservés';
end $$;

-- ── 2. Clés de site : dès qu'une clé existe, un envoi sans clé valide est « suspect » ──
insert into marketing_lead_sites (name, key_hash) values ('iconflow.fr', encode(sha256(convert_to('cle-de-test','utf8')),'hex'));
set local role anon;
do $$ declare r jsonb; begin
  perform set_config('request.headers','{"x-lead-site-key":"mauvaise"}',true);
  r := lead_inbox_receive('{"email":"a@exemple.fr","site":"faux-site.fr","recu_le":"2026-11-15T09:00:00.000Z"}'::jsonb);
  perform set_config('request.headers','{"x-lead-site-key":"cle-de-test"}',true);
  r := lead_inbox_receive('{"email":"b@exemple.fr","site":"nom-declare-par-le-site","recu_le":"2026-11-15T09:01:00.000Z"}'::jsonb);
  perform set_config('request.headers','',true);
  r := lead_inbox_receive('{"email":"c@exemple.fr","site":"iconflow.fr","recu_le":"2026-11-15T09:02:00.000Z"}'::jsonb);
end $$;
reset role;
do $$ begin
  if (select status from leads_inbox where payload->>'email'='a@exemple.fr') <> 'suspect' then raise exception 'FAIL mauvaise clé non marquée suspect'; end if;
  if (select status from leads_inbox where payload->>'email'='b@exemple.fr') <> 'recu' then raise exception 'FAIL bonne clé non acceptée'; end if;
  if (select site from leads_inbox where payload->>'email'='b@exemple.fr') <> 'iconflow.fr' then raise exception 'FAIL le nom du site doit venir de la clé, pas de la charge'; end if;
  if (select status from leads_inbox where payload->>'email'='c@exemple.fr') <> 'suspect' then raise exception 'FAIL envoi sans clé non marqué suspect'; end if;
  raise notice 'PASS clés de site : bonne clé acceptée, clé absente ou fausse gardée en suspect';
end $$;

-- ── 3. Aucune suppression, quel que soit le rôle ──
do $$ begin
  begin delete from leads_inbox; raise exception 'FAIL suppression acceptée';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  if (select count(*) from leads_inbox) <> 5 then raise exception 'FAIL des lignes ont disparu'; end if;
  raise notice 'PASS aucune suppression possible dans leads_inbox';
end $$;

-- ── 4. Membres : lecture et retraitement réservés au module Réception ──
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','cccc0000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
  if (select count(*) from leads_inbox) <> 0 then raise exception 'FAIL membre Studio lit la boîte de réception'; end if;
  update leads_inbox set status='traite'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL membre Studio modifie la boîte de réception'; end if;
  if (select count(*) from marketing_lead_sites) <> 0 then raise exception 'FAIL membre Studio lit les clés de site'; end if;
  raise notice 'PASS membre Studio : boîte de réception invisible et non modifiable';
end $$;
select set_config('request.jwt.claim.sub','cccc0000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
  if (select count(*) from leads_inbox) <> 5 then raise exception 'FAIL membre Réception ne lit pas la boîte'; end if;
  update leads_inbox set attempts = attempts + 1 where payload->>'email'='a@exemple.fr'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL membre Réception ne peut pas retraiter'; end if;
  begin insert into leads_inbox (request_id, payload) values ('y','{}'::jsonb); raise exception 'FAIL membre Réception insère directement';
  exception when insufficient_privilege then null; end;
  begin delete from leads_inbox where payload->>'email'='a@exemple.fr'; raise exception 'FAIL membre Réception supprime';
  exception when insufficient_privilege then null; when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS membre Réception : lecture et retraitement, ni insertion directe ni suppression';
end $$;

-- ── 5. Abus : taille, email, afflux, plafond (envois anonymes, sans clé de site) ──
reset role;
update marketing_lead_sites set active = false;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.headers','',true);
do $$ declare r jsonb; k int; ok_recu int := 0; ok_suspect int := 0; begin
  -- Envoi trop gros : refusé, rien n'est écrit.
  begin perform lead_inbox_receive(jsonb_build_object('email','gros@exemple.fr','bourrage',repeat('x', 9000))); raise exception 'FAIL envoi de plus de 8 000 octets accepté';
  exception when invalid_parameter_value then null; end;
  -- Email invalide : gardé, mais jamais transformé en prospect tout seul.
  r := lead_inbox_receive('{"email":"pas-un-email","site":"iconflow.fr","recu_le":"2026-11-15T10:00:00.000Z"}'::jsonb);
  if (r->>'ok') <> 'true' then raise exception 'FAIL email invalide refusé au lieu d''être gardé'; end if;
  -- Afflux : 5 lignes anonymes existent déjà dans la minute. Les suivantes passent, puis deviennent
  -- « suspect » à partir de 10 dans la minute, puis sont refusées à partir de 20.
  for k in 1..15 loop
    r := lead_inbox_receive(jsonb_build_object('email', 'afflux' || k || '@exemple.fr', 'site', 'iconflow.fr', 'recu_le', '2026-11-15T11:00:' || lpad(k::text, 2, '0') || '.000Z'));
    if (r->>'ok') <> 'true' then raise exception 'FAIL envoi % refusé trop tôt', k; end if;
  end loop;
  begin perform lead_inbox_receive('{"email":"detrop@exemple.fr","site":"iconflow.fr","recu_le":"2026-11-15T11:30:00.000Z"}'::jsonb); raise exception 'FAIL plafond par minute non appliqué';
  exception when sqlstate '53400' then null; end;
  -- Plafond atteint : le renvoi d'un lead DÉJÀ enregistré reste confirmé (le site ne le croit pas perdu).
  r := lead_inbox_receive('{"email":"afflux1@exemple.fr","site":"iconflow.fr","recu_le":"2026-11-15T11:00:01.000Z"}'::jsonb);
  if (r->>'duplicate') <> 'true' then raise exception 'FAIL renvoi non reconnu pendant le plafond : %', r; end if;
  raise notice 'PASS abus : envoi trop gros refusé, plafond par minute appliqué, renvoi toujours confirmé';
end $$;
reset role;
do $$ begin
  if (select status || '|' || error from leads_inbox where payload->>'email'='pas-un-email') <> 'suspect|Email absent ou invalide' then raise exception 'FAIL email invalide non marqué suspect'; end if;
  if (select count(*) from leads_inbox where payload->>'email' like 'afflux%' and status = 'recu') <> 5 then raise exception 'FAIL afflux : % lignes « reçu » au lieu de 5', (select count(*) from leads_inbox where payload->>'email' like 'afflux%' and status = 'recu'); end if;
  if (select count(*) from leads_inbox where payload->>'email' like 'afflux%' and status = 'suspect' and error = 'Afflux inhabituel de leads') <> 10 then raise exception 'FAIL afflux : lignes en trop non marquées suspect'; end if;
  if exists (select 1 from leads_inbox where payload->>'email' in ('gros@exemple.fr','detrop@exemple.fr')) then raise exception 'FAIL un envoi refusé a été écrit'; end if;
  raise notice 'PASS abus : email invalide et afflux gardés en « suspect », jamais transformés en prospects tout seuls';
end $$;

-- Un afflux anonyme ne bloque pas un site qui signe ses envois avec sa clé.
update marketing_lead_sites set active = true;
set local role anon;
do $$ declare r jsonb; begin
  perform set_config('request.headers','{"x-lead-site-key":"cle-de-test"}',true);
  r := lead_inbox_receive('{"email":"vrai-lead@exemple.fr","recu_le":"2026-11-15T11:40:00.000Z"}'::jsonb);
  if (r->>'ok') <> 'true' then raise exception 'FAIL envoi signé bloqué par l''afflux anonyme'; end if;
end $$;
reset role;
do $$ begin
  if (select status || '|' || site_verified from leads_inbox where payload->>'email'='vrai-lead@exemple.fr') <> 'recu|true' then raise exception 'FAIL envoi signé non accepté en « reçu »'; end if;
  raise notice 'PASS clé de site : un afflux anonyme ne bloque pas un envoi signé';
end $$;

reset role;
rollback;
