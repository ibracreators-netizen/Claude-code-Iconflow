/**
 * Chiffrement des jetons Google et signature de l'état OAuth. Côté serveur uniquement (node:crypto).
 * La clé vient de MARKETING_ENCRYPTION_KEY : sans elle, rien n'est chiffré ni déchiffré, et la connexion
 * Google est refusée (on ne stocke jamais un jeton en clair).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const keyOf = (secret: string) => createHash("sha256").update(secret, "utf8").digest();
export const encryptionSecret = () => (process.env.MARKETING_ENCRYPTION_KEY ?? "").trim();
export const hasEncryptionKey = () => encryptionSecret().length >= 32;

/** AES-256-GCM. Format : v1.<iv>.<étiquette>.<texte chiffré>, en base64url. */
export function encrypt(plain: string, secret = encryptionSecret()): string {
  if (secret.length < 32) throw new Error("MARKETING_ENCRYPTION_KEY manquante ou trop courte (32 caractères au moins).");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decrypt(token: string, secret = encryptionSecret()): string {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("jeton illisible");
  const d = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** État OAuth signé : qui a lancé la connexion, et quand. Valable dix minutes. */
export function signState(payload: { u: string; n: string; t: number }, secret = encryptionSecret()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", keyOf(secret)).update(body).digest("base64url")}`;
}
export function readState(state: string, secret = encryptionSecret(), now = Date.now()): { u: string; n: string; t: number } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", keyOf(secret)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; n?: unknown; t?: unknown };
    if (typeof p.u !== "string" || typeof p.n !== "string" || typeof p.t !== "number") return null;
    if (now - p.t > 10 * 60_000 || p.t - now > 60_000) return null;
    return { u: p.u, n: p.n, t: p.t };
  } catch { return null; }
}
