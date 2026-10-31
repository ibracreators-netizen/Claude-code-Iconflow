import "server-only";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import dns from "node:dns";

/**
 * Requête HTTP(S) sûre contre le SSRF, pour tout contenu dont l'URL vient d'un utilisateur
 * (import Brain, vérification d'un tableau de bord externe).
 *
 * Deux gardes complémentaires :
 *  1. le nom d'hôte est refusé s'il est local/interne ou s'il résout vers une adresse privée ;
 *  2. surtout, la connexion est épinglée sur l'adresse validée (option `lookup` de node) : il n'y a pas de
 *     seconde résolution DNS indépendante entre la vérification et la connexion, ce qui ferme la fenêtre de
 *     rebinding DNS (TTL très court renvoyant une IP publique à la vérification puis une IP privée à la connexion).
 *
 * Une seule requête par appel (pas de suivi automatique des redirections) : l'appelant suit les redirections
 * lui-même et rappelle safeFetch pour chaque saut, donc chaque connexion est validée et épinglée à nouveau.
 */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // fc00::/7
  if (/^fe[89ab]/.test(s)) return true; // fe80::/10
  if (s.startsWith("::ffff:")) { const v4 = s.slice(7); return isIP(v4) === 4 ? isPrivateIPv4(v4) : true; }
  return false;
}
/** Vrai si l'adresse IP n'est pas routable publiquement (ou n'est pas une IP). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  return v === 4 ? isPrivateIPv4(ip) : v === 6 ? isPrivateIPv6(ip) : true;
}

/** Nom d'hôte manifestement local/interne (avant toute résolution DNS). */
export function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (isIP(h)) return isPrivateAddress(h);
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa") || !h.includes(".");
}

export class SafeFetchError extends Error {
  constructor(public code: "invalid_url" | "private_host" | "dns" | "timeout" | "unreachable" | "too_large") {
    super(code);
    this.name = "SafeFetchError";
  }
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string>;
  location: string | null;
  body: Buffer;
  truncated: boolean;
  contentType: string;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  allowLocal?: boolean; // tests uniquement
  signal?: AbortSignal;
}

/** Résout une seule fois, refuse toute adresse privée, et renvoie l'IP validée pour épingler la connexion. */
function pinnedLookup(allowLocal: boolean): http.ClientRequestArgs["lookup"] {
  // Signature node : (hostname, options, callback). callback(err, address, family) ou, si options.all, (err, [{address,family}]).
  return ((hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return cb(err, "", 4);
      const list = (Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: 4 }]) as dns.LookupAddress[];
      const ok = list.find((a) => allowLocal || !isPrivateAddress(a.address));
      if (!ok) return cb(Object.assign(new Error("private_host"), { code: "EPRIVATEHOST" }), "", 4);
      if (options && options.all) return cb(null, [ok]);
      return cb(null, ok.address, ok.family);
    });
  }) as http.ClientRequestArgs["lookup"];
}

export function safeFetch(rawUrl: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { method = "GET", headers = {}, timeoutMs = 10_000, maxBytes = 2_097_152, allowLocal = false, signal } = opts;
  let url: URL;
  try { url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl; } catch { return Promise.reject(new SafeFetchError("invalid_url")); }
  if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.reject(new SafeFetchError("invalid_url"));
  if (!allowLocal && isInternalHostname(url.hostname)) return Promise.reject(new SafeFetchError("private_host"));

  const lib = url.protocol === "https:" ? https : http;
  return new Promise<SafeResponse>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; fn(); };
    const req = lib.request(
      url,
      {
        method,
        lookup: pinnedLookup(allowLocal),
        headers: { host: url.host, ...headers },
        // On gère nous-mêmes le délai et la taille ; pas de redirection automatique (lib bas niveau n'en fait pas).
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        const finish = () => done(() => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) h[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
          resolve({ status: res.statusCode ?? 0, headers: h, location: res.headers.location ?? null, body: Buffer.concat(chunks), truncated, contentType: h["content-type"] ?? "" });
        });
        if (method === "HEAD" || maxBytes === 0) { res.resume(); res.on("end", finish); res.on("close", finish); res.on("error", finish); return; }
        res.on("data", (c: Buffer) => {
          if (settled || truncated) return;
          if (total + c.length > maxBytes) {
            chunks.push(c.subarray(0, Math.max(0, maxBytes - total))); total = maxBytes; truncated = true;
            res.destroy(); finish(); // assez lu : on arrête proprement et on renvoie ce qu'on a
            return;
          }
          chunks.push(c); total += c.length;
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish); // une coupure après un corps déjà (partiellement) lu ne doit pas faire échouer
      },
    );
    const onAbort = () => req.destroy(Object.assign(new Error("aborted"), { code: "ABORT_ERR" }));
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener("abort", onAbort, { once: true }); }
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (e: NodeJS.ErrnoException) => done(() => {
      const code = String(e.code ?? "");
      if (code === "EPRIVATEHOST") return reject(new SafeFetchError("private_host"));
      if (code === "ETIMEDOUT" || code === "ABORT_ERR") return reject(new SafeFetchError("timeout"));
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") return reject(new SafeFetchError("dns"));
      reject(new SafeFetchError("unreachable"));
    }));
    req.end();
  });
}
