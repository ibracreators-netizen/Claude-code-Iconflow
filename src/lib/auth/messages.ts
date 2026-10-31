/**
 * Messages du formulaire de connexion : code, statut et message d'erreur Supabase Auth → phrase française.
 * Module sans dépendance (testable hors Next) ; les server actions l'importent.
 */

export const NO_ACCOUNT_MESSAGE = "Aucun compte avec cet email. Demande une invitation à l'équipe icon-flow.";

export type AuthFlow = "password" | "magic";

/** Codes GoTrue quand aucun compte n'existe : lien demandé sans création de compte, inscriptions fermées, utilisateur inconnu. */
const NO_ACCOUNT_CODES = new Set(["otp_disabled", "signup_disabled", "user_not_found"]);
/** Textes GoTrue : « Signups not allowed for otp », « Signups not allowed for this instance », « User not found ». */
const NO_ACCOUNT_TEXT = /signups? (?:are )?not allowed|user not found|unable to find user/i;

/** L'erreur signifie qu'aucun compte n'existe pour cet email. */
export function isNoAccountError(code?: string | null, message?: string | null): boolean {
  if (code && NO_ACCOUNT_CODES.has(code)) return true;
  return !!message && NO_ACCOUNT_TEXT.test(message);
}

/** Phrase à afficher sous le formulaire. `flow` distingue mot de passe et lien magique (un 400 n'a pas le même sens). */
export function authMessage(code?: string | null, status?: number | null, message?: string | null, flow: AuthFlow = "password"): string {
  const magic = flow === "magic";
  if (isNoAccountError(code, message)) return NO_ACCOUNT_MESSAGE;
  if (code === "email_not_confirmed") return "Confirme ton adresse email avant de te connecter.";
  if (code === "user_banned" || status === 403) return "L'accès de ce compte a été retiré. Contacte l'équipe icon-flow.";
  if (code === "email_provider_disabled") return "La connexion par email est désactivée dans le projet Supabase (Authentication → Providers → Email).";
  if (status === 429 || (code ?? "").includes("rate_limit")) return magic ? "Trop de liens demandés en peu de temps. Patiente quelques minutes avant de réessayer." : "Trop de tentatives. Patiente quelques instants.";
  if (!magic && (code === "invalid_credentials" || status === 400)) return "Email ou mot de passe incorrect.";
  if (magic && (code === "validation_failed" || status === 400)) return "Adresse email invalide.";
  return magic ? "Impossible d'envoyer le lien pour le moment. Réessaie dans un instant." : "Connexion impossible pour le moment. Réessaie dans un instant.";
}
