-- ============================================================
-- 0015 — Marque et attribution UTM sur les prospects
--
-- Strictement additive : deux colonnes nullables ajoutées à
-- marketing_prospects. Aucune colonne existante n'est modifiée,
-- aucune donnée n'est réécrite, aucune contrainte n'est ajoutée
-- sur les lignes déjà présentes.
--
-- `if not exists` rend le script rejouable sans effet de bord.
-- ============================================================

-- Nom de la marque déclaré par le prospect à l'opt-in.
alter table public.marketing_prospects
  add column if not exists marque text;

-- Paramètres de campagne de l'URL d'arrivée (utm_*, fbclid, gclid, ttclid).
-- jsonb : les clés varient selon la régie, un schéma fixe serait trop rigide.
alter table public.marketing_prospects
  add column if not exists utm jsonb;

comment on column public.marketing_prospects.marque is
  'Nom de la marque saisi au formulaire d''opt-in.';
comment on column public.marketing_prospects.utm is
  'Paramètres d''attribution publicitaire relevés dans l''URL d''arrivée.';
