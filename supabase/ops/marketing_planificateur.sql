-- ============================================================================
-- PLANIFICATEUR MARKETING (pg_cron + pg_net) — à exécuter À LA MAIN, une fois.
-- Ce n'est PAS une migration : il contient l'adresse de l'application et lit un
-- secret, deux choses qui n'ont pas leur place dans un fichier versionné.
--
-- Rôle : toutes les minutes, la base appelle l'application, qui
--   1. transforme en prospects les lignes de leads_inbox restées « reçu » ;
--   2. note l'heure de son passage (visible dans Marketing › Réglages).
-- Elle ne fait PAS partir d'emails vers les prospects : la file des relances et
-- rappels n'est pas touchée par ce planificateur.
-- Si l'application ne répond pas, l'appel échoue et sera refait la minute
-- suivante : les leads attendent dans leads_inbox, rien n'est perdu.
--
-- Avant de lancer : remplacer les deux valeurs entre chevrons.
--   <URL_APP>      adresse publique de l'application, sans barre finale
--                  (ex. https://studio.iconflow.fr)
--   <CRON_SECRET>  la MÊME valeur que la variable CRON_SECRET de l'application
-- ============================================================================

-- 1) Extensions : ce script les installe si elles ne le sont pas (sans effet sinon).
--    pg_cron lance la tâche, pg_net lui permet d'appeler une adresse web.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net;
--    Contrôle : les deux lignes doivent revenir.
--    select extname, extversion from pg_extension where extname in ('pg_cron','pg_net');

-- 2) Le secret est rangé dans le coffre de Supabase (Vault), pas en clair dans la tâche.
--    Rejouable : crée le secret, ou remplace sa valeur s'il existe déjà.
do $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'iconflow_cron_secret';
  if sid is null then
    perform vault.create_secret('<CRON_SECRET>', 'iconflow_cron_secret', 'Secret partagé avec l''application (variable CRON_SECRET)');
  else
    perform vault.update_secret(sid, '<CRON_SECRET>');
  end if;
end $$;

-- 3) La tâche, toutes les minutes. Rejouable : on retire l'ancienne avant de recréer.
select cron.unschedule(jobid) from cron.job where jobname = 'iconflow-marketing-tick';
select cron.schedule(
  'iconflow-marketing-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := '<URL_APP>/api/marketing/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'iconflow_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- 4) Vérifier (attendre 2 minutes) :
--    select jobname, schedule, active from cron.job where jobname = 'iconflow-marketing-tick';
--    select status, return_message, start_time from cron.job_run_details
--      where jobid = (select jobid from cron.job where jobname = 'iconflow-marketing-tick')
--      order by start_time desc limit 5;                       -- attendu : status = succeeded
--    select status_code, left(content, 200), created from net._http_response order by created desc limit 5;
--                                                              -- attendu : status_code = 200
--    select value from public.marketing_settings where key = 'scheduler';
--                                                              -- attendu : last_run_at de moins de 2 minutes

-- Arrêter le planificateur (retour arrière) :
--    select cron.unschedule(jobid) from cron.job where jobname = 'iconflow-marketing-tick';

-- ============================================================================
-- FACULTATIF — SENTINELLE : alerte par email si le planificateur s'arrête,
-- MÊME quand l'application est éteinte (c'est la base qui écrit à Resend).
-- Sans cette partie, l'alerte existe quand même, mais c'est l'application qui
-- la donne : bandeau rouge dans l'espace Marketing + email envoyé dès qu'un
-- membre ouvre une page Marketing.
--
-- Avant de lancer : remplacer les trois valeurs entre chevrons.
--   <RESEND_API_KEY>   la même clé que la variable RESEND_API_KEY de l'application
--   <EMAIL_FROM>       la même adresse que la variable EMAIL_FROM
--   <EMAIL_ALERTE>     l'adresse qui doit recevoir l'alerte
-- ============================================================================
-- select vault.create_secret('<RESEND_API_KEY>', 'iconflow_resend_api_key', 'Clé Resend pour la sentinelle du planificateur');
--
-- create or replace function public.marketing_scheduler_watchdog() returns void
-- language plpgsql security definer set search_path = public as $fn$
-- declare beat jsonb; last_run timestamptz; last_alert timestamptz; api_key text;
-- begin
--   select value into beat from public.marketing_settings where key = 'scheduler';
--   last_run := nullif(beat->>'last_run_at', '')::timestamptz;
--   if last_run is not null and last_run > now() - interval '15 minutes' then return; end if;
--   select nullif(value->>'last_sent_at', '')::timestamptz into last_alert from public.marketing_settings where key = 'scheduler_watchdog';
--   if last_alert is not null and last_alert > now() - interval '6 hours' then return; end if;
--   select decrypted_secret into api_key from vault.decrypted_secrets where name = 'iconflow_resend_api_key';
--   if api_key is null then return; end if;
--   perform net.http_post(
--     url := 'https://api.resend.com/emails',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
--     body := jsonb_build_object(
--       'from', '<EMAIL_FROM>', 'to', jsonb_build_array('<EMAIL_ALERTE>'),
--       'subject', 'Iconflow Marketing : le planificateur ne tourne plus',
--       'text', 'Dernier passage : ' || coalesce(last_run::text, 'jamais') || E'.\nLes leads continuent d''arriver dans leads_inbox mais ne sont plus transformés en prospects. Vérifier que l''application répond, puis la tâche iconflow-marketing-tick.'));
--   insert into public.marketing_settings (key, value) values ('scheduler_watchdog', jsonb_build_object('last_sent_at', now()))
--     on conflict (key) do update set value = excluded.value, updated_at = now();
-- end $fn$;
-- revoke all on function public.marketing_scheduler_watchdog() from public, anon, authenticated;
--
-- select cron.unschedule(jobid) from cron.job where jobname = 'iconflow-marketing-sentinelle';
-- select cron.schedule('iconflow-marketing-sentinelle', '*/10 * * * *', $$ select public.marketing_scheduler_watchdog(); $$);
