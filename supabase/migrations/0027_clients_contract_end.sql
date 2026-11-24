-- ============================================================================
-- Iconflow — 0027 FIN DE CONTRAT D'UN CLIENT (Studio › Facturation › Revenus récurrents)
-- Additif et rejouable. Retour arrière : supabase/rollbacks/0027_clients_contract_end.down.sql
-- Une seule colonne, vide par défaut : aucune donnée existante n'est modifiée, aucun droit ne change.
-- ============================================================================
alter table public.clients add column if not exists contract_end date;
comment on column public.clients.contract_end is 'Fin de l''engagement en cours (saisie à la main). Vide : sans date de fin.';
