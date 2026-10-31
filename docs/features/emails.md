# Emails fiables : invitations et liens de connexion

Le studio envoie trois familles d'emails : l'**invitation d'un membre** de l'agence, l'**ouverture d'un espace client** et le **lien de connexion** (lien magique demandé sur `/login`, ou renvoyé depuis la fiche d'un compte dans *Équipe & accès*). Tous reposent sur Supabase Auth, qui crée les comptes et génère les liens.

## Le problème

Par défaut, Supabase envoie lui-même ces emails avec **son service intégré**, prévu pour le développement :

- environ **2 emails par heure** pour tout le projet ;
- uniquement vers les **adresses des membres du projet Supabase** (les comptes qui ont accès au dashboard).

Résultat : une invitation envoyée à un client ou à un nouveau membre n'arrive jamais, et le lien magique « bugue » dès le troisième envoi de l'heure. Deux voies corrigent cela ; la première est recommandée.

## Voie A (recommandée) : le studio envoie ses emails avec Resend

Quand `RESEND_API_KEY` et `EMAIL_FROM` sont définies, l'application n'utilise plus l'envoi de Supabase :

1. Supabase **génère** le lien (`generateLink`, type `invite` ou `magiclink`) et crée le compte si besoin, sans envoyer d'email ;
2. le studio envoie **son propre email** (gabarits français aux couleurs d'Iconflow, version texte incluse) via l'API HTTP de Resend, sans SDK (`src/lib/email/mailer.ts`, `src/lib/email/templates.ts`).

Le lien ouvre `/auth/callback`, qui passe la main à `/auth/finish` : la session s'ouvre dans le navigateur, puis un invité arrive sur `/bienvenue` pour choisir son mot de passe. Le lien magique mène directement à la page demandée.

### Mise en place (15 min)

1. Créer un compte sur [resend.com](https://resend.com) et **vérifier le domaine** d'envoi (ex. `icon-flow.fr`) : Resend indique les enregistrements DNS à ajouter (SPF, DKIM, éventuellement DMARC). Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte Resend lui-même.
2. Créer une **clé API** (API Keys → Create, permission *Sending access*).
3. Renseigner les variables sur l'hébergeur (Vercel → Settings → Environment Variables, Production **et** Preview), puis **redéployer** :

| Variable | Valeur | Portée |
|---|---|---|
| `RESEND_API_KEY` | la clé Resend (`re_…`) | **serveur uniquement, jamais dans Git** |
| `EMAIL_FROM` | `Iconflow Studio <studio@icon-flow.fr>` ou simplement `studio@icon-flow.fr` (le nom « Iconflow Studio » est ajouté) ; le domaine doit être celui vérifié dans Resend | serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | déjà requise pour inviter : elle sert aussi à générer les liens | serveur |
| `NEXT_PUBLIC_APP_URL` | URL publique du studio : les liens des emails d'invitation y renvoient | publique |

4. Vérifier dans **Paramètres → Emails** : le badge affiche *Resend configuré* ; **« M'envoyer un email de test »** envoie notre gabarit de test à ta propre adresse. La ligne *Envoi d'emails* de *Connexion aux données* passe au vert.

Si une seule des deux variables manque (ou si `EMAIL_FROM` n'est pas une adresse valide), rien ne change : Supabase continue d'envoyer, et Paramètres nomme la variable manquante.

### Comportement détaillé

| Action | Avec Resend | Sans Resend |
|---|---|---|
| Inviter un membre ou un client | `generateLink(invite)` + email du studio (tutoiement pour l'équipe, vouvoiement pour le client, nom de la marque dans l'objet) | `inviteUserByEmail` : email d'invitation Supabase |
| Renvoyer un lien (fiche du compte) | invitation si le compte n'a jamais été confirmé, sinon lien magique ; email du studio ; trace dans le journal | invitation Supabase ou lien magique Supabase |
| Lien magique sur `/login` | le compte est d'abord cherché dans `profiles` (clé service). Connu : `generateLink(magiclink)` + email du studio, au plus un lien par minute et par adresse (la règle de Supabase, que son API admin n'applique pas) ; compte banni refusé. Inconnu : Supabase tranche (voir ci-dessous) | `signInWithOtp` sans création de compte : email Supabase |
| Email de test (Paramètres) | gabarit de test | lien de connexion Supabase vers ta propre adresse |

Pourquoi chercher le compte avant de générer un lien magique ? `generateLink(magiclink)` **crée un compte** pour un email inconnu lorsque les inscriptions sont ouvertes dans Supabase. Le studio ne génère donc un lien que pour un compte connu ; pour un email sans profil, il retombe sur `signInWithOtp({ shouldCreateUser: false })`, qui ne crée jamais rien et répond « aucun compte » le cas échéant.

Si la recherche du compte échoue (base pas à jour, clé service refusée…), le lien repart par Supabase comme avant et l'erreur est inscrite dans les journaux du serveur : aucun message technique à l'écran.

Si le compte est créé mais que Resend refuse l'envoi (clé invalide, domaine non vérifié…), le message le dit explicitement : le compte existe, il suffit de **renvoyer un lien de connexion** depuis sa fiche une fois la configuration corrigée.

## Voie B : SMTP personnalisé dans Supabase

Sans toucher à l'application, on peut remplacer le service d'envoi de Supabase par un SMTP (Resend propose aussi un accès SMTP, comme Brevo, Postmark, Mailgun, Gmail Workspace…) :

1. Supabase → **Authentication → SMTP Settings** → *Enable Custom SMTP* : hôte, port (465 ou 587), identifiant, mot de passe, adresse et nom d'expéditeur (domaine vérifié chez le fournisseur).
2. Supabase → **Authentication → Rate Limits** : relever *Rate limit for sending emails* (par défaut très bas) selon le fournisseur.
3. Facultatif : Supabase → **Authentication → Email Templates** pour traduire en français les gabarits *Invite user* et *Magic Link* (variables `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`).

L'application ne peut pas détecter cette configuration : la ligne *Envoi d'emails* de Paramètres reste orange, mais les emails partent bien. Les deux voies peuvent coexister ; quand Resend est configuré côté application, c'est lui qui envoie.

## Réglages Supabase indispensables (quelle que soit la voie)

- **Redirect URLs** : Supabase → **Authentication → URL Configuration**. *Site URL* = l'URL de production (`https://studio.iconflow.fr`). *Redirect URLs* : chaque URL de déploiement suivie de `/auth/callback` (`https://studio.iconflow.fr/auth/callback`, `https://<projet>.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`). Un lien dont la destination n'est pas autorisée retombe sur la Site URL ou affiche « Ce lien n'est plus valide ».
- **`NEXT_PUBLIC_APP_URL`** doit pointer vers l'URL où les invités doivent atterrir (les emails d'invitation l'utilisent ; le lien magique de `/login` utilise l'hôte de la requête).
- **Inscriptions fermées** : Authentication → Providers → Email → *Allow new users to sign up* décoché. Les comptes sont créés uniquement par l'agence.
- **Durée de validité des liens** : Authentication → Providers → Email → *Email OTP expiration* (3 600 s par défaut, soit l'« une heure » annoncée dans l'interface ; 24 h maximum). Chaque lien ne sert qu'une fois.

## Messages du formulaire de connexion

| Situation | Message affiché |
|---|---|
| Email sans compte (codes Supabase `otp_disabled`, `signup_disabled`, `user_not_found`, « Signups not allowed… ») | « Aucun compte avec cet email. Demande une invitation à l'équipe icon-flow. » |
| Accès retiré (`user_banned`, 403) | « L'accès de ce compte a été retiré. Contacte l'équipe icon-flow. » |
| Trop de demandes (429) | « Trop de liens demandés en peu de temps. Patiente quelques minutes avant de réessayer. » |
| Deuxième lien en moins d'une minute (avec Resend) | « Un lien vient d'être envoyé à cette adresse. Patiente une minute avant d'en demander un autre. » |
| Envoi réussi | « Lien envoyé à nom@domaine.fr. Vérifie ta boîte mail (et les spams) : il est valable une heure. » |

Les correspondances sont dans `src/lib/auth/messages.ts`, sans dépendance, donc testables hors Next.

## Vérifier

1. **Paramètres → Emails** (administrateur) : état du service, bouton *M'envoyer un email de test*, toast de résultat.
2. **Paramètres → Connexion aux données** : ligne *Envoi d'emails* (verte avec Resend ; sinon le détail rappelle la limite du service par défaut).
3. **Équipe & accès** : inviter un compte de test (une adresse à toi, hors membres du projet Supabase), cliquer le lien reçu, vérifier l'arrivée sur `/bienvenue`, puis *Renvoyer un lien de connexion* depuis sa fiche.
4. `/login` → *Lien magique* : un email inconnu affiche « Aucun compte avec cet email… » ; un compte connu reçoit le lien et arrive connecté.
5. Côté fournisseur : Resend → *Emails* (statut *Delivered*, *Bounced*…) ; Supabase → *Logs → Auth* pour les erreurs de génération ou de redirection.

## Dépannage

- **« Ce lien n'est plus valide »** : URL de destination absente des Redirect URLs, lien déjà utilisé ou expiré → renvoyer un lien depuis la fiche du compte.
- **« Expéditeur refusé par Resend »** : `EMAIL_FROM` n'utilise pas un domaine vérifié dans Resend (ou le domaine est encore en attente de vérification DNS).
- **« Resend n'autorise cet envoi qu'à ta propre adresse »** : compte Resend sans domaine vérifié (mode test) : vérifier le domaine.
- **« Clé Resend refusée »** : `RESEND_API_KEY` erronée, révoquée, ou ajoutée après le build sans redéploiement.
- **Email dans les spams** : enregistrements SPF/DKIM du domaine incomplets (Resend → Domains indique leur état) ; ajouter un enregistrement DMARC.
- **Le compte est créé mais l'email n'est pas parti** : corriger la configuration, puis *Renvoyer un lien de connexion* depuis la fiche du compte.
- **Sans Resend, « Trop de liens demandés »** : limite du service par défaut de Supabase atteinte, attendre une heure ou passer à l'une des deux voies.
