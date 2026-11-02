# Deploiement Hostinger VPS (prepare, NON active)

Etat: preparation seulement. Aucun workflow dans `.github/workflows`, aucun secret, aucune cle API. Rien ne se declenche.

Fichiers: `docker-compose.template.yml` (modele sans valeurs) et `deploy-hostinger.workflow.yml.example` (exemple manuel, extension .example).

## Methode officielle
Action `hostinger/deploy-action@v1` (doc: https://www.hostinger.com/support/deploy-to-hostinger-vps-using-github-actions/, depot: https://github.com/hostinger/deploy-on-vps). Elle utilise l'API Hostinger (secret `HOSTINGER_API_KEY`, variable `HOSTINGER_VM_ID` = 2119389), envoie le compose du depot au projet Docker Manager, et lui passe les variables d'environnement. Elle remplace le compose du projet: le projet existant doit s'appeler `studio-test`.

## Variables
- Publiques `NEXT_PUBLIC_*` (Supabase URL, anon key, APP_URL): lues par Next.js AU BUILD. Elles sont passees en build args et en environment.
- Privee `SUPABASE_SERVICE_ROLE_KEY`: runtime uniquement, jamais en build arg ni dans le depot.
- Sur le serveur actuel les valeurs sont dans le fichier env root-only. Avec l'action, elles viendraient des secrets GitHub (a creer, decision du proprietaire).

## Reseau et HTTPS
Traefik Hostinger en mode host: ne pas declarer de reseau `traefik-proxy`. Garder les labels (Host studio.iconflow.fr, entrypoint websecure, certresolver letsencrypt, port 3000). Le certificat Let's Encrypt est conserve tant que ces labels et le domaine ne changent pas. DNS: ne rien toucher.

## Rollback
1. Relancer le deploiement avec `STUDIO_REF` = ancien commit (version actuelle en prod: 7cb9cf9 + correctifs, soit 05d8bc2 equivalent).
2. Sinon restaurer les sauvegardes de compose serveur (/root/compose.bak, /root/compose.bak2) puis `docker compose up -d --build`.
3. Snapshot VPS du 2 nov 2026 (expire le 3 nov) en dernier recours. Ne jamais toucher a la base Supabase de prod.

## Limites connues
Le build se fait sur le VPS depuis le depot public (contexte git). Le compose du depot doit rester sans valeurs. Premier deploiement a faire avec accord, sur un batch de test pour valider la suppression reelle en base.

## Activation (etapes requises, non faites)
1. Creer la cle API Hostinger. 2. Creer le secret et la variable dans GitHub (reglages du depot). 3. Copier le workflow vers `.github/workflows/`. 4. Lancer manuellement avec le commit voulu.
