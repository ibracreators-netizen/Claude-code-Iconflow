# Serveur MCP — créer des briefs depuis Claude

Ce serveur expose l'app comme **connecteur MCP** : Claude (claude.ai web/mobile, Claude Desktop…)
peut lister les clients et **créer des briefs dans les espaces clients**. Claude ne pilote pas
l'interface ; il appelle des outils, le serveur écrit dans Supabase, et le brief apparaît dans le
studio comme n'importe quel brief — en **rédaction** (brouillon agence, invisible du client tant
qu'il n'est pas proposé).

> ⚠️ Écrit dans la vraie base en production. À brancher seulement quand tu es prêt. Le serveur crée
> toujours les briefs en « rédaction » : rien n'est envoyé au client automatiquement.

## Outils exposés
- `lister_clients` — id, nom, secteur des espaces clients.
- `lister_briefs` — filtrable par `client_id` et `mois` (YYYY-MM). Utile pour éviter les doublons.
- `creer_brief` — `{ client_id | client, titre, type ("video"|"statique"), mois, concepts[] }`.
  Chaque concept devient une page du brief (vidéo : `concept`, `hooks[]`, `corps`, `ctas[]`, `acting` ;
  statique : `reference`, `angle`, `overlay` ; `texte` alimente le champ principal par défaut).

## Point d'entrée
- MCP (JSON-RPC, POST) : `/api/mcp`
- Découverte OAuth : `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`
- OAuth : `/api/mcp/authorize`, `/api/mcp/token`, `/api/mcp/register`

## Variables d'environnement (Vercel → Settings → Environment Variables)
| Variable | Rôle |
|---|---|
| `MCP_TOKEN_SECRET` | **Requis.** Secret HMAC qui signe les codes et jetons d'accès. Chaîne aléatoire longue. |
| `MCP_AGENCY_USER_ID` | Compte agence « incarné » par le serveur (attribution des actions). Par défaut : premier agence en accès complet. |
| `MCP_STATIC_TOKEN` | Optionnel. Jeton Bearer statique pour tester / Claude Desktop, **sans** OAuth. À ne pas définir en prod si tu veux forcer OAuth. |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app (déjà utilisée ailleurs) : sert d'`issuer` OAuth. |
| `SUPABASE_SERVICE_ROLE_KEY` | Déjà requis pour l'admin : le serveur MCP écrit avec cette clé, côté serveur uniquement. |

## Tester en local (sans OAuth)
```bash
MCP_STATIC_TOKEN=dev-token-123 pnpm start   # après pnpm build
# puis, dans un autre terminal :
curl -s localhost:3000/api/mcp -H 'authorization: Bearer dev-token-123' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lister_clients"}}'
```
En mode démo (Supabase non configuré), les écritures vont dans la base démo en mémoire.

## Ajouter le connecteur dans claude.ai (production)
1. Déploie l'app (une **preview Vercel** suffit pour tester, pas besoin du domaine de prod).
2. Dans claude.ai : **Réglages → Connecteurs → Ajouter un connecteur personnalisé**.
3. URL du connecteur : `https://<ton-déploiement>/api/mcp`.
4. Claude lance l'authentification **OAuth** : tu te connectes avec **ton compte agence** du studio,
   et tu autorises l'accès. (claude.ai n'accepte pas de simple token collé : c'est OAuth.)
5. Les outils `lister_clients` / `lister_briefs` / `creer_brief` deviennent disponibles dans Claude.

## Sécurité
- La clé de service Supabase et `MCP_TOKEN_SECRET` restent **côté serveur** ; jamais exposés au navigateur
  ni au contexte de Claude.
- `/api/mcp/authorize` exige une **session agence** du studio : personne ne peut obtenir de jeton sans se
  connecter en agence, et PKCE lie le code à l'échange.
- Les briefs sont créés en **rédaction** (brouillon). La proposition au client reste une action manuelle
  dans le studio.
- Scope unique : `briefs`. (Édition, livrables, etc. : hors v1.)

## Limites v1 / à finaliser
- OAuth est **validé une fois déployé** (claude.ai doit joindre l'URL et faire l'aller-retour) : la découverte
  et le flux se peaufinent sur la preview.
- Enregistrement de client dynamique **sans état** (client public PKCE) ; pas de rafraîchissement de jeton
  (jeton d'accès longue durée, révocable en changeant `MCP_TOKEN_SECRET`).
