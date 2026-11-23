import { ALWAYS_ALLOWED, MARKETING_MODULE_KEYS, SALES_ASSIGNABLE_MODULES, SALES_ROLE_MODULES, canAccessSpace, type SalesRole } from "@/lib/permissions";

/*
 * Invitation d'un membre de l'équipe Marketing : rôles proposés, pages accordées à chaque rôle, et traduction des
 * erreurs en français simple, avec quoi faire. Aucun accès au réseau ni à la base : utilisable côté serveur, dans le
 * navigateur et dans scripts/team-selfcheck.ts. Jamais de « client » ici : l'équipe Marketing, c'est toi et tes membres.
 */

/** Rôles proposés à l'invitation. Setter, Closer et Media buyer : compte commercial (« marketing »). Responsable : compte agence. */
export type InviteRole = SalesRole | "responsable";
export const INVITE_ROLES: InviteRole[] = ["setter", "closer", "media_buyer", "responsable"];
export const INVITE_ROLE_LABEL: Record<InviteRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer", responsable: "Responsable" };
export const INVITE_ROLE_HINT: Record<InviteRole, string> = {
  setter: "Appelle les leads et prend les rendez-vous. Ne voit que les leads qui lui sont attribués.",
  closer: "Mène les appels de vente et note le résultat. Ne voit que les leads qui lui sont attribués.",
  media_buyer: "Suit la publicité et l'entonnoir en chiffres. Ne voit aucun nom, e-mail ni téléphone.",
  responsable: "Voit tout l'espace Marketing : tous les leads, toute l'équipe, les KPI. N'invite personne.",
};
export const isInviteRole = (v: unknown): v is InviteRole => typeof v === "string" && (INVITE_ROLES as string[]).includes(v);

/** Pages d'un Responsable : tous les modules Marketing, aucun module de Studio. */
export const RESPONSABLE_PAGES: string[] = [...MARKETING_MODULE_KEYS];

/**
 * Pages accordées à l'invitation. Responsable : tout le Marketing, rien d'autre. Setter, Closer, Media buyer : seulement les
 * pages qu'un compte commercial peut recevoir ; liste vide ou absente → les pages habituelles du rôle.
 */
export function pagesForRole(role: InviteRole, wanted?: string[] | null): string[] {
  if (role === "responsable") return [...RESPONSABLE_PAGES];
  const kept = SALES_ASSIGNABLE_MODULES.filter((m) => (wanted ?? []).includes(m));
  return kept.length ? kept : [...SALES_ROLE_MODULES[role]];
}

/**
 * Compte agence « Responsable » : des pages Marketing, et aucune page de Studio en dehors de celles que l'app accorde
 * d'office (tableau de bord, paramètres). Un administrateur (accès complet, permissions null) n'en est pas un.
 */
export function isMarketingOnly(permissions: unknown): boolean {
  if (!Array.isArray(permissions)) return false;
  const keys = permissions.map(String).filter((k) => !(ALWAYS_ALLOWED as string[]).includes(k));
  return keys.length > 0 && keys.every((k) => k.startsWith("marketing_"));
}

/**
 * Vrai tant que l'app ouvre l'accueil de Studio à tout compte agence, même sans page de Studio (src/lib/permissions.ts).
 * L'interface le dit alors honnêtement sous le rôle Responsable ; la phrase disparaît d'elle-même quand ce n'est plus le cas.
 */
export const responsableOpensStudio = (): boolean => canAccessSpace({ role: "agency", permissions: RESPONSABLE_PAGES }, "studio");

/** Libellé du rôle d'un membre de la liste. */
export function memberRoleLabel(m: { kind: "admin" | "agence" | "commercial"; role: SalesRole | null; manager?: boolean }): string {
  if (m.kind === "admin") return "Administrateur";
  if (m.manager) return "Responsable";
  if (m.role) return INVITE_ROLE_LABEL[m.role];
  return m.kind === "commercial" ? "Rôle à choisir" : "Membre de l'agence";
}

/* ─── Résultat d'une invitation ─────────────────────────────────────────── */

/** Ce que l'administrateur peut faire tout de suite depuis le message d'erreur. */
export type InviteFix = "renvoyer" | "retablir" | "reprendre" | "fiche";
export type InviteErrorCode =
  | "nom" | "email_invalide" | "role"
  | "deja_invite" | "deja_retire" | "deja_membre" | "email_autre_compte" | "compte_inactif" | "email_connexion"
  | "limite" | "redirection" | "base" | "reseau" | "base_pas_a_jour" | "creation" | "droit" | "inscriptions" | "inconnu";
export interface InviteProblem { code: InviteErrorCode; title: string; help: string; technical?: string | null; memberId?: string; fix?: InviteFix }
export type InviteOutcome =
  /** L'app a envoyé l'e-mail d'invitation. */
  | { status: "envoye"; memberId: string; name: string; email: string }
  /** Compte prêt, e-mail non envoyé (envoi non configuré, ou échec) : le lien est remis à l'administrateur. */
  | { status: "lien"; memberId: string; name: string; email: string; link: string; reason: "pas_d_envoi" | "envoi_echoue"; detail?: string | null }
  /** Mode démo : rien n'est créé, aucun lien n'est généré. */
  | { status: "demo"; name: string; email: string }
  | { status: "erreur"; problem: InviteProblem };

export const firstName = (name: string, email = ""): string => name.trim().split(/\s+/)[0] || email.split("@")[0] || "cette personne";

/** Compte déjà présent avec cet e-mail : quoi dire, et quoi proposer. `signedIn` : null si inconnu. */
export function existingAccountProblem(a: { id: string; role: string; client_id: string | null; permissions: unknown; disabled: boolean; signedIn: boolean | null }): InviteProblem {
  const team = a.role === "marketing" || (a.role === "agency" && isMarketingOnly(a.permissions));
  if (team && a.disabled) return { code: "deja_retire", memberId: a.id, fix: "retablir", title: "Cette personne fait déjà partie de l'équipe, mais son accès est retiré.", help: "Rétablis son accès : elle retrouvera ses pages. Si elle ne s'est jamais connectée, renvoie-lui ensuite une invitation depuis la liste." };
  if (team && a.signedIn === false) return { code: "deja_invite", memberId: a.id, fix: "renvoyer", title: "Cette personne est déjà invitée.", help: "Elle ne s'est pas encore connectée. Renvoie-lui une invitation : un nouveau lien est créé, l'ancien ne sert plus." };
  if (team) return { code: "deja_membre", memberId: a.id, fix: "fiche", title: "Cette personne fait déjà partie de l'équipe.", help: "Son compte est actif : elle se connecte avec son e-mail. Pour changer son rôle ou ses pages, ouvre Réglages › Équipe et accès." };
  // Compte sans aucun espace (souvent une invitation précédente restée à moitié) : on peut le reprendre, s'il n'a jamais servi.
  if (a.role === "client" && !a.client_id && !a.disabled && a.signedIn === false) return { code: "compte_inactif", memberId: a.id, fix: "reprendre", title: "Un compte inactif existe déjà avec cet e-mail.", help: "C'est souvent une invitation précédente qui n'a pas abouti. Reprends-le : il devient membre de l'équipe avec le rôle choisi, et un nouveau lien est créé." };
  return { code: "email_autre_compte", title: "Cet e-mail est déjà utilisé par un autre compte de l'application.", help: "Utilise une autre adresse e-mail pour ce membre (par exemple son adresse professionnelle)." };
}

const message = (err: unknown): string => {
  if (typeof err === "string") return err;
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : String(err ?? "");
};
const field = (err: unknown, k: "code" | "status"): string => String((err as Record<string, unknown> | null)?.[k] ?? "");

/**
 * Erreur levée pendant une invitation (Supabase Auth, base, réseau, contrôle d'accès) → message simple et quoi faire.
 * `redirect` : l'adresse de retour de l'app (…/auth/callback), citée quand Supabase la refuse. Aucune valeur secrète.
 */
export function explainInviteError(err: unknown, ctx: { redirect: string }): InviteProblem {
  const msg = message(err).trim(), code = field(err, "code"), status = field(err, "status");
  const technical = msg || code || null;
  const is = (re: RegExp) => re.test(msg) || re.test(code);
  if (is(/réservée? à l'administrateur|forbidden_module|admin_only|accès refusé/i)) return { code: "droit", title: "Réservé à l'administrateur.", help: "Seul l'administrateur (accès complet) invite des membres et gère leurs accès. Demande-lui de le faire." };
  if (is(/SUPABASE_SERVICE_ROLE_KEY|service_key_missing|invalid api key|invalid jwt|no api key|bad_jwt|not_admin|user not allowed|requires a valid bearer token/i)) return { code: "base", technical, title: "La base n'est pas reliée pour inviter.", help: "L'app a besoin de la clé de service Supabase sur l'hébergeur (variable SUPABASE_SERVICE_ROLE_KEY). Vérifie qu'elle est bien renseignée, redéploie, puis réessaie." };
  if (is(/fetch failed|failed to fetch|econnrefused|enotfound|etimedout|network|socket hang up|timed? ?out/i) || status === "502" || status === "503" || status === "504") return { code: "reseau", technical, title: "Supabase ne répond pas.", help: "Réessaie dans un instant. Si ça continue, vérifie que le projet Supabase est bien actif (pas en pause)." };
  if (is(/redirect|redirect_to|url.*not allowed|not allowed.*url/i)) return { code: "redirection", technical, title: "Supabase refuse l'adresse de retour de l'app.", help: `Dans Supabase, ouvre Authentication › URL Configuration et ajoute ${ctx.redirect} dans « Redirect URLs ». Enregistre, puis réessaie.` };
  if (status === "429" || is(/rate.?limit|too many requests|over_email_send_rate_limit|over_request_rate_limit|you can only request this/i)) return { code: "limite", technical, title: "Trop de demandes en peu de temps.", help: "Supabase limite le nombre d'invitations à la suite. Attends quelques minutes, puis réessaie." };
  if (is(/email_exists|user_already_exists|already (been )?registered|already exists/i)) return { code: "email_connexion", technical, title: "Cet e-mail a déjà un compte de connexion, sans fiche dans l'app.", help: "Utilise une autre adresse, ou supprime ce compte dans Supabase (Authentication › Users), puis réessaie." };
  if (is(/email_address_invalid|email address .* is invalid|invalid.*e-?mail|unable to validate email|n'est pas valide/i)) return { code: "email_invalide", technical, title: "Cette adresse e-mail n'est pas acceptée.", help: "Vérifie l'orthographe. Supabase refuse aussi certaines adresses (domaines d'exemple, adresses jetables)." };
  if (is(/signups? (are )?not allowed|signup_disabled|email_provider_disabled|email signups are disabled/i)) return { code: "inscriptions", technical, title: "La création de comptes par e-mail est coupée dans Supabase.", help: "Dans Supabase, ouvre Authentication › Sign In / Providers et active « Email », puis réessaie." };
  if (is(/42703|42P01|PGRST20[0-9]|does not exist|schema cache|could not find the .* column/i)) return { code: "base_pas_a_jour", technical, title: "La base n'est pas à jour.", help: "Une migration Marketing n'est pas appliquée (0022 au minimum, 0026 pour l'historique). Applique les migrations du dossier supabase/migrations, puis réessaie." };
  if (is(/database error (saving|creating) new user|unexpected_failure|database error/i)) return { code: "creation", technical, title: "Supabase n'a pas pu créer le compte.", help: "La base a refusé la fiche du nouveau compte. Vérifie que toutes les migrations sont appliquées, puis réessaie. Si l'erreur revient, transmets le détail ci-dessous." };
  return { code: "inconnu", technical, title: "L'invitation n'a pas abouti.", help: "Réessaie dans un instant. Si l'erreur revient, transmets le détail ci-dessous." };
}

/** Saisie du formulaire : problème lisible, ou null si tout va bien. */
export function checkInviteInput(input: { name: string; email: string; role: unknown }): InviteProblem | null {
  if (!input.name.trim()) return { code: "nom", title: "Indique le nom du membre.", help: "Son prénom et son nom, tels qu'ils apparaîtront dans l'équipe." };
  if (input.name.trim().length > 120) return { code: "nom", title: "Ce nom est trop long.", help: "120 caractères au maximum." };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input.email.trim())) return { code: "email_invalide", title: "Cette adresse e-mail n'est pas valide.", help: "Vérifie l'orthographe, par exemple prenom@entreprise.fr." };
  if (!isInviteRole(input.role)) return { code: "role", title: "Choisis un rôle.", help: "Setter, Closer, Media buyer ou Responsable." };
  return null;
}

/**
 * Adresse de retour réellement retenue par Supabase pour le lien (champ redirect_to de generateLink) : si elle diffère
 * de celle demandée, Supabase ne l'autorise pas et le lien mènerait à une mauvaise page. Inconnue → on ne bloque pas.
 */
export function redirectRefused(asked: string, used: string | null | undefined): boolean {
  if (!used) return false;
  const norm = (u: string) => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/+$/, "")}`; } catch { return u.replace(/\/+$/, ""); } };
  return norm(asked) !== norm(used);
}
