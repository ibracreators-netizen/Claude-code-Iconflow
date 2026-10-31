/**
 * Tableau de bord externe d'un client (Looker Studio, Meta…) — fonctions pures : validation et normalisation de l'URL,
 * lecture des en-têtes qui refusent l'intégration dans un cadre (X-Frame-Options, CSP frame-ancestors).
 * Aucune dépendance d'exécution (testé avec Node, voir meta-mapping.test.mjs).
 */

export type EmbedStatus = "ok" | "refused" | "unknown";

/**
 * URL saisie par l'agence → URL enregistrée, ou null si elle est invalide.
 * - http(s) uniquement ;
 * - un rapport Looker Studio « /reporting/… » devient sa version intégrable « /embed/reporting/… » (seule forme acceptée dans un iframe).
 */
/** Hôte manifestement interne (littéral IP privée, localhost, nom sans point) — refusé à l'enregistrement. La résolution DNS est vérifiée au moment du fetch par safeFetch. */
function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) { const a = +m[1], b = +m[2]; return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  if (h.includes(":")) return true; // littéral IPv6 : prudence
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa") || !h.includes(".");
}

export function normalizeDashboardUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (isInternalHost(u.hostname)) return null; // jamais de tableau de bord sur une cible interne (anti-SSRF)
  if (/^(lookerstudio\.google\.com|datastudio\.google\.com)$/i.test(u.hostname)) {
    u.hostname = "lookerstudio.google.com";
    if (/^\/(?:u\/\d+\/)?reporting\//.test(u.pathname)) u.pathname = `/embed${u.pathname.replace(/^\/u\/\d+/, "")}`;
  }
  return u.toString();
}

/** Nom lisible de l'outil derrière l'URL (pour les libellés), ou « Tableau de bord ». */
export function dashboardProvider(url: string | null | undefined): string {
  if (!url) return "Tableau de bord";
  try {
    const h = new URL(url).hostname;
    if (/lookerstudio|datastudio/.test(h)) return "Looker Studio";
    if (/facebook\.com|business\.facebook|adsmanager/.test(h)) return "Meta Ads";
    if (/metabase/.test(h)) return "Metabase";
    if (/notion/.test(h)) return "Notion";
    if (/docs\.google|sheets\.google/.test(h)) return "Google Sheets";
    if (/airtable/.test(h)) return "Airtable";
    return h.replace(/^www\./, "");
  } catch { return "Tableau de bord"; }
}

/**
 * Suivi manuel d'une redirection pendant la vérification de cadre.
 * - réponse finale (pas une 3xx) : ses en-têtes font foi ;
 * - redirection vers le même hôte (http → https, barre finale…) : on la suit ;
 * - redirection vers un autre hôte (page de connexion Google, SSO…) : elle ne dit rien du tableau de bord lui-même,
 *   dont l'accès dépend de la session du visiteur → « foreign » (le cadre est affiché, avec une aide).
 */
export function nextHop(from: string, status: number, location: string | null | undefined): { kind: "final" } | { kind: "follow"; url: string } | { kind: "foreign" } {
  if (status < 300 || status >= 400) return { kind: "final" };
  if (!location) return { kind: "foreign" };
  try {
    const next = new URL(location, from);
    if (next.protocol !== "https:" && next.protocol !== "http:") return { kind: "foreign" };
    return next.hostname.toLowerCase() === new URL(from).hostname.toLowerCase() ? { kind: "follow", url: next.toString() } : { kind: "foreign" };
  } catch {
    return { kind: "foreign" };
  }
}

/**
 * Les en-têtes de la page cible autorisent-ils son affichage dans un cadre servi par `appOrigin` ?
 * CSP `frame-ancestors` l'emporte sur X-Frame-Options (comportement des navigateurs).
 */
export function frameAllowed(headers: { xFrameOptions?: string | null; csp?: string | null }, appOrigin: string): EmbedStatus {
  const csp = headers.csp ?? "";
  const directive = csp.split(";").map((d) => d.trim()).find((d) => /^frame-ancestors(\s|$)/i.test(d));
  if (directive) {
    const sources = directive.split(/\s+/).slice(1).map((s) => s.replace(/^'|'$/g, "").toLowerCase());
    if (!sources.length || sources.includes("none")) return "refused";
    if (sources.includes("*")) return "ok";
    let origin: URL;
    try { origin = new URL(appOrigin); } catch { return "unknown"; }
    const host = origin.hostname.toLowerCase();
    const ok = sources.some((s) => {
      if (s === "https:" || s === "http:") return origin.protocol === s;
      if (s === "self") return false; // l'origine de la cible, jamais la nôtre
      const m = /^(?:[a-z]+:\/\/)?(\*\.)?([^/:]+)(?::\d+)?/.exec(s);
      if (!m) return false;
      const base = m[2];
      return m[1] ? host.endsWith(`.${base}`) || host === base : host === base;
    });
    return ok ? "ok" : "refused";
  }
  const xfo = (headers.xFrameOptions ?? "").trim().toLowerCase();
  if (xfo.startsWith("deny") || xfo.startsWith("sameorigin")) return "refused";
  return "ok";
}
