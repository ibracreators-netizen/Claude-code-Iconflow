# Studio — menu regroupé et revenus récurrents

Le menu de Studio passe de 18 à 12 entrées. Aucune page n'a été supprimée ni réécrite : les pages proches
sont regroupées sous une même entrée, avec des onglets en haut de page. Toutes les anciennes adresses marchent.

| Entrée du menu | Onglets | Adresses |
|---|---|---|
| Tableau de bord | Vue d'ensemble · À traiter | `/studio`, `/studio/inbox` |
| Clients | Liste · Pipeline | `/studio/clients`, `/studio/pipeline` |
| Tâches & planning | Tâches · Planning | `/studio/taches`, `/studio/planning` |
| Outils IA | Avatars · IA Process | `/studio/avatars`, `/studio/ia` |
| Documents & fichiers | Documents · Fichiers | `/studio/documents`, `/studio/fichiers` |
| Facturation | Factures · Revenus récurrents | `/studio/factures`, `/studio/factures/revenus` |
| Équipe | Agence et clients · Commerciaux | `/studio/equipe`, `/marketing/equipe` |

Inchangées : Messagerie, Briefs & scripts, Livrables, Performance, Brain, Paramètres.

## Barre latérale

La même que dans Marketing : **noire, accent vert** (`src/components/layout/sidebar.tsx`, jetons `--side-*` de
`src/app/globals.css`). Dépliée : l'icône devant le libellé ; repliée : les icônes seules. Pour déplier, survoler le
logo ; pour replier, le bouton à droite du nom ; Ctrl/Cmd + \\ au clavier. Le commutateur d'espace montre les logos
de Studio et de Marketing.

## Comment c'est fait

- `src/components/layout/nav.ts` : une entrée peut porter `also` (les autres pages du groupe). `SECTION_TABS`
  décrit les onglets de chaque groupe.
- `src/components/layout/app-shell.tsx` : l'entrée s'affiche dès qu'une des pages du groupe est permise, pointe
  sur la première permise, et reste allumée sur toutes les pages du groupe. La cloche mène toujours à « À traiter ».
- `src/components/layout/section-tabs.tsx` : les onglets. Un onglet n'apparaît que si le compte a droit à sa
  page ; avec un seul onglet permis, la barre ne s'affiche pas. **Les droits par page ne changent pas** : un
  membre qui avait « Pipeline » sans « Clients » garde exactement le même accès.

## Revenus récurrents (migration 0027)

`/studio/factures/revenus`, droit « Facturation ». Calculé à partir des fiches clients, aucune saisie en double.

- **Récurrent mensuel** : somme des honoraires (`retainer`) des clients **actifs**, et sa projection sur 12 mois.
  Les clients en onboarding ou en pause sont listés, pas comptés.
- **Honoraire moyen** par client actif.
- **Récurrent à risque** : honoraires des clients actifs dont la santé est « Attention » ou « À risque ».
- **Fins de contrat** : engagements qui se terminent dans les 90 jours, et ceux déjà échus. La date se saisit
  dans le tableau (colonne `clients.contract_end`, migration `0027_clients_contract_end.sql`, vide par défaut).
  Sans la migration, la page s'affiche mais l'enregistrement d'une date dit clairement qu'elle manque.

## Client créé depuis le CRM

Quand l'administrateur valide « Créer le client » après une signature (Marketing, règle 6), Studio reçoit :
la fiche client (nom, email), quatre tâches d'onboarding étiquetées « Onboarding » (appel de lancement, accès,
Brain, invitation au portail), et un premier brief vidéo vide. Si une de ces créations échoue, le client reste
créé et le message dit ce qui a été fait.
