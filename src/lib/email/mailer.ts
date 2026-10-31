import "server-only";

/**
 * Envoi d'emails par le studio lui-même, via l'API HTTP de Resend, quand RESEND_API_KEY et EMAIL_FROM sont définies.
 * Sans ces variables, les emails d'authentification restent envoyés par Supabase : son service par défaut
 * n'accepte qu'environ deux emails par heure, uniquement vers les membres du projet Supabase (sauf SMTP personnalisé).
 * Aucun SDK : un simple fetch, un délai de 10 secondes, des erreurs lisibles en français.
 */

export interface EmailMessage { to: string; subject: string; html: string; text: string }
export type MailerVariable = "RESEND_API_KEY" | "EMAIL_FROM";
export interface MailerStatus { configured: boolean; sender: string | null; missing: MailerVariable[] }

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;
const DEFAULT_SENDER_NAME = "Iconflow Studio";
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const read = (name: MailerVariable) => (process.env[name] ?? "").trim();

/** Adresse d'expédition envoyée à Resend : « Iconflow Studio <studio@icon-flow.fr> » (le nom est ajouté si EMAIL_FROM n'en a pas). */
export function mailerSender(): string | null {
  const from = read("EMAIL_FROM");
  if (!from) return null;
  const named = from.match(/^(.*)<([^<>]+)>$/);
  if (named) { const name = named[1].trim().replace(/^"|"$/g, ""); return ADDRESS.test(named[2].trim()) ? `${name || DEFAULT_SENDER_NAME} <${named[2].trim()}>` : null; }
  return ADDRESS.test(from) ? `${DEFAULT_SENDER_NAME} <${from}>` : null;
}

/** État du mailer : configuré, expéditeur affichable, variables manquantes ou invalides. */
export function mailerStatus(): MailerStatus {
  const sender = mailerSender();
  const missing: MailerVariable[] = [];
  if (!read("RESEND_API_KEY")) missing.push("RESEND_API_KEY");
  if (!sender) missing.push("EMAIL_FROM");
  return { configured: missing.length === 0, sender, missing };
}

/** Vrai quand le studio envoie lui-même ses emails (clé Resend et expéditeur valides). */
export function isMailerConfigured(): boolean {
  return mailerStatus().configured;
}

/** Erreur d'envoi : message français prêt à afficher (humanError le transmet tel quel). */
export class MailerError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "MailerError"; }
}

/** Envoie un email via Resend. Lève une MailerError lisible si l'envoi échoue. */
export async function sendEmail(message: EmailMessage): Promise<{ id: string | null }> {
  const key = read("RESEND_API_KEY");
  const from = mailerSender();
  if (!key || !from) throw new MailerError("L'envoi d'emails n'est pas configuré : renseigne RESEND_API_KEY et EMAIL_FROM sur l'hébergeur.");
  const to = message.to.trim();
  if (!ADDRESS.test(to)) throw new MailerError("Adresse du destinataire invalide.");

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    throw new MailerError(timedOut ? "Le service d'email n'a pas répondu en 10 secondes. Réessaie dans un instant." : "Le service d'email est injoignable depuis le serveur. Réessaie dans un instant.");
  }

  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (res.ok) return { id: body?.id ?? null };
  throw new MailerError(explain(res.status, body?.message ?? null), res.status);
}

/** Traduit une réponse d'erreur Resend en consigne actionnable. */
function explain(status: number, detail: string | null): string {
  const reason = detail ? detail.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (status === 401) return "Clé Resend refusée : vérifie RESEND_API_KEY sur l'hébergeur.";
  if (status === 429) return "Resend limite le débit : trop d'emails en peu de temps. Réessaie dans une minute.";
  if (status === 403 || status === 422 || status === 400) {
    if (/domain|verif|sender|from\b/i.test(reason)) return `Expéditeur refusé par Resend : EMAIL_FROM doit utiliser un domaine vérifié dans Resend. (${reason})`;
    if (/testing|own email|recipient/i.test(reason)) return `Resend n'autorise cet envoi qu'à ta propre adresse tant que le domaine n'est pas vérifié. (${reason})`;
    return `Resend a refusé l'envoi${reason ? ` : ${reason}` : "."}`;
  }
  if (status >= 500) return "Le service d'email (Resend) est indisponible pour le moment. Réessaie dans un instant.";
  return `L'email n'a pas pu être envoyé (Resend ${status}${reason ? ` : ${reason}` : ""}).`;
}
