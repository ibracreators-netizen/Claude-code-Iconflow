/**
 * Liens e-mail « à confirmer d'un clic » : /auth/confirm?token_hash=…&type=…&next=…
 *
 * Le lien brut de Supabase (…/auth/v1/verify?token=…) consomme le jeton dès qu'on l'ouvre. Or les messageries
 * (Gmail, Outlook « liens fiables », antivirus) ouvrent souvent les liens d'un e-mail pour les contrôler : l'invitation
 * était alors grillée avant que la personne clique, et elle tombait sur « Ce lien n'est plus valide ». Ce lien-ci
 * ouvre une page de l'app qui ne fait rien toute seule : le jeton n'est vérifié (verifyOtp) qu'au clic sur le bouton.
 * Il ne dépend pas non plus de la liste des adresses de retour autorisées dans Supabase.
 *
 * Module pur (aucun import serveur) : utilisé par les envois d'invitation et par la page /auth/confirm.
 */
import { safeNext } from "./redirects";

export type ConfirmType = "invite" | "magiclink" | "recovery";
export const CONFIRM_TYPES: readonly ConfirmType[] = ["invite", "magiclink", "recovery"];
export const isConfirmType = (v: unknown): v is ConfirmType => typeof v === "string" && (CONFIRM_TYPES as readonly string[]).includes(v);
/** Empreinte du jeton renvoyée par generateLink (properties.hashed_token) : hexadécimal, sans autre caractère. */
export const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{16,256}$/;

/**
 * Lien à envoyer pour un lien généré par `auth.admin.generateLink`. Sans empreinte exploitable (ne devrait pas arriver),
 * on garde le lien de Supabase, qui passe par /auth/callback puis /auth/finish comme avant.
 */
export function confirmLink(origin: string, props: { hashed_token?: string | null; action_link: string }, type: ConfirmType, next: unknown = "/"): string {
  const hash = props.hashed_token ?? "";
  if (!TOKEN_HASH_RE.test(hash)) return props.action_link;
  const q = new URLSearchParams({ token_hash: hash, type });
  const target = safeNext(next);
  if (target !== "/") q.set("next", target);
  return `${origin.replace(/\/+$/, "")}/auth/confirm?${q.toString()}`;
}

/** Où aller une fois le lien accepté : un invité ou une récupération choisit d'abord son mot de passe (/bienvenue). */
export function afterConfirm(type: ConfirmType, next: unknown): string {
  const target = safeNext(next);
  return type === "invite" || type === "recovery" ? `/bienvenue?next=${encodeURIComponent(target)}` : target;
}
