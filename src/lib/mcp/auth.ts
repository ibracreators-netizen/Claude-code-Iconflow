import "server-only";
import crypto from "node:crypto";

/**
 * Jetons signés (HMAC-SHA256, sans état) pour le serveur MCP : codes d'autorisation courts et
 * jetons d'accès. Un `MCP_STATIC_TOKEN` optionnel sert aux tests / à Claude Desktop (sans OAuth).
 * Tout est côté serveur ; aucune clé n'atteint le navigateur ni le contexte de Claude.
 */
const secret = () => process.env.MCP_TOKEN_SECRET || "";
const ACCESS_TTL = 90 * 24 * 3600; // 90 jours
const CODE_TTL = 300; // 5 min
const now = () => Math.floor(Date.now() / 1000);

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function sign(payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${mac(body)}`;
}
function verify<T extends { exp?: number; typ?: string }>(token: string): T | null {
  if (!secret() || !token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof p.exp === "number" && p.exp < now()) return null;
    return p;
  } catch {
    return null;
  }
}

export interface AccessPayload { typ: "access"; sub: string; scope: string; exp: number }
export interface CodePayload { typ: "code"; sub: string; scope: string; redirect_uri: string; challenge: string; exp: number }

export const issueAccessToken = (sub: string, scope = "briefs") => sign({ typ: "access", sub, scope, exp: now() + ACCESS_TTL });
export const issueCode = (d: { sub: string; scope: string; redirect_uri: string; challenge: string }) =>
  sign({ typ: "code", ...d, exp: now() + CODE_TTL });
export const verifyAccess = (t: string): AccessPayload | null => { const p = verify<AccessPayload>(t); return p && p.typ === "access" ? p : null; };
export const verifyCode = (t: string): CodePayload | null => { const p = verify<CodePayload>(t); return p && p.typ === "code" ? p : null; };

/** PKCE S256 : SHA-256(verifier) en base64url === challenge. */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const h = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(h);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Bearer de la requête (ou null). */
export function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  return m ? m[1].trim() : null;
}

/** Autorise la requête MCP : jeton statique (tests/Desktop) ou jeton d'accès OAuth avec le scope « briefs ». */
export function authorizeRequest(req: Request): { ok: true; sub: string } | { ok: false } {
  const token = bearer(req);
  if (!token) return { ok: false };
  const stat = process.env.MCP_STATIC_TOKEN || "";
  if (stat && token.length === stat.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(stat))) return { ok: true, sub: "static" };
  const p = verifyAccess(token);
  if (p && p.scope.split(" ").includes("briefs")) return { ok: true, sub: p.sub };
  return { ok: false };
}
