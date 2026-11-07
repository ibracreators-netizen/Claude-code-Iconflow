-- ============================================================================
-- Iconflow — 0014 ARCHIVAGE DES AVATARS (additif, idempotent, réversible)
-- Le client « ne choisit pas » un avatar → il est archivé, puis supprimé
-- automatiquement après 7 jours (restaurable avant). La suppression est faite
-- à la lecture (purge best-effort) ; une fonction security definer l'exécute,
-- bornée au client appelant (ou à l'agence). Code deploy-safe sans cette migration :
-- la colonne manquante est tolérée (l'archivage reste simplement inactif).
--
-- ROLLBACK :
--   drop function if exists public.avatars_purge_expired(uuid, int);
--   drop index if exists public.avatars_archived_idx;
--   alter table public.avatars drop column if exists archived_at;
-- ============================================================================
set client_min_messages = warning;

alter table public.avatars add column if not exists archived_at timestamptz;
create index if not exists avatars_archived_idx on public.avatars (client_id, archived_at) where archived_at is not null;

-- Purge des avatars archivés dépassant le délai. Un client ne purge que SES avatars.
create or replace function public.avatars_purge_expired(p_client uuid, p_days int default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if my_role() = 'client' and p_client is distinct from my_client_id() then raise exception 'wrong_client'; end if;
  delete from public.avatars
   where client_id = p_client and archived_at is not null
     and archived_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.avatars_purge_expired(uuid, int) from public, anon;
grant execute on function public.avatars_purge_expired(uuid, int) to authenticated, service_role;
