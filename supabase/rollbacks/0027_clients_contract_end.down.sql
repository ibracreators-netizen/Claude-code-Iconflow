-- Retour arrière de 0027_clients_contract_end.sql : supprime les dates de fin de contrat saisies.
alter table public.clients drop column if exists contract_end;
