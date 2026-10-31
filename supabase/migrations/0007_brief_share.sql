-- ============================================================================
-- Iconflow Studio — 0007 PARTAGE DE BRIEF (additif, idempotent, rejouable)
-- Lien public d'un brief : un jeton non devinable rend le brief lisible par
-- quiconque a le lien, sans compte (comme un document ClickUp publié). La page
-- publique est servie côté serveur avec la clé service, filtrée sur le jeton :
-- aucune politique anonyme n'est ouverte sur la table briefs.
-- ============================================================================
set client_min_messages = warning;

alter table public.briefs add column if not exists public_token text;
alter table public.briefs add column if not exists published_at timestamptz;

-- Un jeton au plus par brief ; deux briefs ne partagent jamais le même jeton.
create unique index if not exists briefs_public_token_key on public.briefs (public_token) where public_token is not null;
