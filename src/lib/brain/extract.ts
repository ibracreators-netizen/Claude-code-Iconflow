import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import type { BrainEntryKind } from "@/lib/data/types";

/*
 * Import Brain depuis un site de marque — tout tourne côté serveur, sans dépendance externe.
 *
 *  1. On va chercher la page d'accueil (10 s, 2 Mo max, 3 redirections, agent explicite, adresses privées refusées),
 *     puis jusqu'à quatre pages utiles trouvées dans ses liens (à propos, produits, collections, FAQ ; catalogue Shopify).
 *  2. Un extracteur HTML léger (expressions régulières, pas de DOM) lit titres, description, en-têtes, paragraphes,
 *     produits (JSON-LD schema.org, catalogue Shopify, cartes produit heuristiques), images, réseaux sociaux.
 *  3. On en fait des fiches Brain et une proposition de dossier de marque : par heuristiques, ou structurées par Claude
 *     quand ANTHROPIC_API_KEY est défini (API Messages, réponse JSON stricte). Sans clé, l'interface le dit.
 */

export const MAX_PAGES = 5;
const TIMEOUT_MS = 10_000;
const AI_TIMEOUT_MS = 55_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; IconflowBrain/1.0; +https://icon-flow.fr)";
/** Base de l'API Anthropic (surchargeable comme avec le SDK officiel : mandataire d'entreprise, tests). */
const anthropicUrl = () => `${(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
const DEFAULT_MODEL = "claude-sonnet-5-5";
/** Tarif public du modèle par défaut (USD par million de jetons) : sert au journal des imports. */
const PRICE_IN_PER_M = 2;
const PRICE_OUT_PER_M = 10;

export const SECTION_IDENTITE = "Identité";
export const SECTION_CONNAISSANCES = "Connaissances";
export const SECTION_PRODUITS = "Produits & prix";
export const SECTION_REFERENCES = "Références";
const SECTIONS = [SECTION_IDENTITE, SECTION_CONNAISSANCES, SECTION_PRODUITS, SECTION_REFERENCES] as const;
const KINDS: BrainEntryKind[] = ["fait", "allegation", "manque", "note"];

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type PageLabel = "accueil" | "a_propos" | "produits" | "collections" | "faq" | "avis" | "catalogue";
export const PAGE_LABEL: Record<PageLabel, string> = {
  accueil: "Accueil", a_propos: "À propos", produits: "Produits", collections: "Collections", faq: "FAQ", avis: "Avis", catalogue: "Catalogue",
};

export interface ProductExtract { name: string; description: string | null; price: string | null; image: string | null; url: string | null; rating: string | null; brand: string | null }
export interface ImageExtract { url: string; alt: string | null; source: string }
export interface SocialLink { platform: string; url: string }
interface Paragraph { heading: string | null; text: string }
interface DiscoveredLink { url: URL; label: PageLabel; score: number }

export interface PageExtract {
  url: string; label: PageLabel; title: string; description: string; siteName: string | null; lang: string | null; ogImage: string | null;
  headings: { level: number; text: string }[]; paragraphs: Paragraph[]; products: ProductExtract[]; faqs: { q: string; a: string }[];
  images: ImageExtract[]; socials: SocialLink[]; links: DiscoveredLink[]; shopify: boolean; truncated: boolean;
}

export interface SiteExtract {
  url: string; host: string; name: string; description: string; lang: string | null; pages: PageExtract[];
  headings: { level: number; text: string; page: PageLabel }[]; paragraphs: (Paragraph & { page: PageLabel; url: string })[];
  products: ProductExtract[]; faqs: { q: string; a: string; url: string }[]; images: ImageExtract[]; socials: SocialLink[]; ogImage: string | null;
}

export interface ProposedEntry { section: string; kind: BrainEntryKind; title: string; content: string; source_url: string | null }
export interface ProposedDossier { promesse: string; ton: string; personas: { nom: string; resume: string }[]; concurrents: string[] }
export interface ImportOutcome {
  mode: "ia" | "simple";
  /** Raison (courte, française) pour laquelle l'IA n'a pas été utilisée alors qu'une clé est configurée. */
  ai_error: string | null;
  entries: ProposedEntry[];
  dossier: ProposedDossier;
  images: ImageExtract[];
  pages: { url: string; title: string; label: PageLabel }[];
  usage: { tokens_in: number; tokens_out: number; cost_usd: number } | null;
}

export class ExtractError extends Error {
  constructor(public code: string, public status?: number, detail?: string) { super(detail ?? code); }
}

/** Message français pour l'utilisateur, quel que soit l'incident. */
export function describeExtractError(err: unknown): string {
  if (err instanceof ExtractError) {
    switch (err.code) {
      case "invalid_url": return "Adresse invalide. Colle l'URL complète du site (ex. https://www.marque.fr).";
      case "private_host": return "Cette adresse pointe vers un réseau privé : seuls les sites publics peuvent être importés.";
      case "dns": return "Site introuvable : vérifie l'adresse.";
      case "timeout": return "Le site n'a pas répondu en 10 secondes. Réessaie dans un instant.";
      case "redirects": return "Trop de redirections depuis cette adresse.";
      case "not_html": return "Cette adresse ne renvoie pas une page web lisible.";
      case "empty": return "Rien d'exploitable sur ces pages (site vide, en construction ou protégé).";
      case "http": return err.status === 403 || err.status === 429 ? `Le site a refusé l'accès (code ${err.status}) : il bloque sans doute les robots.` : `Le site a répondu avec une erreur (code ${err.status ?? "?"}).`;
      case "unreachable": return "Impossible de joindre ce site.";
    }
  }
  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") return "Le site n'a pas répondu en 10 secondes. Réessaie dans un instant.";
  return "L'import a échoué. Réessaie, ou ajoute les fiches à la main.";
}

/* ─── Réseau ────────────────────────────────────────────────────────────── */

/** Dév./test uniquement : autorise les adresses locales (serveur de test). Jamais en production. */
const allowLocal = () => process.env.BRAIN_IMPORT_ALLOW_LOCAL === "1";

export function normalizeUrl(raw: string): URL {
  let s = raw.trim();
  if (!s) throw new ExtractError("invalid_url");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try { url = new URL(s); } catch { throw new ExtractError("invalid_url"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ExtractError("invalid_url");
  if (!url.hostname || (!url.hostname.includes(".") && !allowLocal())) throw new ExtractError("invalid_url");
  url.hash = "";
  return url;
}

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function isPrivateIPv6(ip: string) {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true;                         // fc00::/7
  if (/^fe[89ab]/.test(s)) return true;                                               // fe80::/10
  if (s.startsWith("::ffff:")) { const v4 = s.slice(7); return isIP(v4) === 4 ? isPrivateIPv4(v4) : true; }
  return false;
}
function isPrivateAddress(ip: string) { const v = isIP(ip); return v === 4 ? isPrivateIPv4(ip) : v === 6 ? isPrivateIPv6(ip) : true; }

/** Refuse localhost, les noms internes et toute adresse résolue vers un réseau privé. */
async function assertPublicHost(hostname: string) {
  if (allowLocal()) return;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const bare = h.replace(/^\[|\]$/g, "");
  if (isIP(bare)) { if (isPrivateAddress(bare)) throw new ExtractError("private_host"); return; }
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa") || !h.includes(".")) throw new ExtractError("private_host");
  let addrs: { address: string }[];
  try { addrs = await lookup(bare, { all: true }); } catch { throw new ExtractError("dns"); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new ExtractError("private_host");
}

function decodeBody(buf: Uint8Array, contentType: string) {
  let cs = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  if (!cs) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(buf.subarray(0, 4096)))?.[1]?.toLowerCase();
  try { return new TextDecoder(cs || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

interface Fetched { url: URL; body: string; contentType: string; truncated: boolean }

/**
 * Récupère une URL publique : délai 10 s, 2 Mo max (tronqué au-delà), 3 redirections suivies à la main.
 * Le réseau passe par safeFetch, qui épingle la connexion sur l'IP validée : aucune seconde résolution DNS entre
 * la vérification et la connexion, donc pas de rebinding possible. assertPublicHost reste pour un message clair.
 */
export async function fetchPublic(url: URL, depth = 0): Promise<Fetched> {
  await assertPublicHost(url.hostname);
  let res;
  try {
    res = await safeFetch(url, {
      allowLocal: allowLocal(), timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5", "accept-language": "fr-FR,fr;q=0.9,en;q=0.6" },
    });
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.code : "";
    if (code === "timeout") throw new ExtractError("timeout");
    if (code === "private_host") throw new ExtractError("private_host");
    if (code === "dns") throw new ExtractError("dns");
    throw new ExtractError("unreachable");
  }
  if (res.status >= 300 && res.status < 400) {
    if (!res.location || depth >= MAX_REDIRECTS) throw new ExtractError("redirects");
    let next: URL;
    try { next = new URL(res.location, url); } catch { throw new ExtractError("redirects"); }
    if (next.protocol !== "http:" && next.protocol !== "https:") throw new ExtractError("redirects");
    return fetchPublic(next, depth + 1); // chaque saut est revalidé et ré-épinglé par safeFetch
  }
  if (res.status < 200 || res.status >= 300) throw new ExtractError("http", res.status);
  const contentType = res.contentType;
  if (contentType && !/text\/html|application\/xhtml|application\/json|text\/plain/i.test(contentType)) throw new ExtractError("not_html");
  return { url, body: decodeBody(res.body, contentType), contentType, truncated: res.truncated };
}

/* ─── HTML léger ────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", euro: "€", copy: "©", reg: "®", trade: "™", deg: "°", times: "×", middot: "·", bull: "•", eacute: "é", egrave: "è", ecirc: "ê",
  euml: "ë", agrave: "à", acirc: "â", ccedil: "ç", ugrave: "ù", ucirc: "û", uuml: "ü", ocirc: "ô", ouml: "ö", icirc: "î", iuml: "ï", oelig: "œ", aelig: "æ",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç", shy: "", zwj: "", zwnj: "",
};
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") { const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return cp > 0 ? String.fromCodePoint(cp) : ""; } catch { return ""; } }
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
export function stripTags(html: string) {
  return collapse(decodeEntities(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")));
}
function removeBlocks(html: string, tags: string[]) {
  return tags.reduce((h, t) => h.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}>`, "gi"), " "), html);
}
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:@.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const abs = (href: string, base: URL): string | null => { try { const u = new URL(href.trim(), base); return u.protocol === "http:" || u.protocol === "https:" ? u.href : null; } catch { return null; } };

const BOILERPLATE = /cookie|consentement|rgpd|gdpr|politique de confidentialit|mentions l[ée]gales|tous droits|all rights|javascript|newsletter|inscri(?:s|vez)-(?:toi|vous)|©|conditions g[ée]n[ée]rales|mot de passe|password|se connecter|log ?in|mon compte|my account|votre panier|your cart|aucun produit/i;
const JUNK_HEADING = /^(menu|panier|cart|recherche|search|newsletter|footer|navigation|compte|account|filtres?|filters?|trier|sort by|langue|language|devise|currency|suivez[- ]nous|follow us|nous contacter|contact|liens? utiles?|informations?|aide|help|service client|customer service|infos? pratiques?)$/i;
/** Promesses marketing (vs données factuelles). */
const MARKETING = /\b(meilleur|révolutionnaire|unique|incroyable|miracle|parfait|exceptionnel|ultime|n[°o]\s?1|numéro 1|leader|préféré|adoré|magique|garanti|sans effort|instantan|en (?:\d+|quelques) (?:jours|minutes|secondes)|résultats? (?:visibles?|garantis?)|prouvé|cliniquement|testé|100 ?%|satisfait|rembours|transform|changez|découvrez|imaginez|offrez|profitez|le secret|enfin|jamais vu|comme jamais|le plus|la plus|les plus)\b/i;
export const classifyKind = (text: string): BrainEntryKind => (MARKETING.test(text) ? "allegation" : "fait");

const SOCIAL: Array<[RegExp, string]> = [
  [/(?:^|\.)instagram\.com$/, "Instagram"], [/(?:^|\.)tiktok\.com$/, "TikTok"], [/(?:^|\.)facebook\.com$/, "Facebook"], [/(?:^|\.)(?:youtube\.com|youtu\.be)$/, "YouTube"],
  [/(?:^|\.)linkedin\.com$/, "LinkedIn"], [/(?:^|\.)(?:x\.com|twitter\.com)$/, "X"], [/(?:^|\.)pinterest\.(?:com|fr)$/, "Pinterest"], [/(?:^|\.)snapchat\.com$/, "Snapchat"], [/(?:^|\.)threads\.net$/, "Threads"],
];

const LINK_RULES: Array<{ label: PageLabel; href: RegExp; text: RegExp; score: number }> = [
  { label: "a_propos", href: /(a-?propos|about|notre-?histoire|qui-?sommes|la-?marque|our-?story|notre-?mission|manifeste|histoire)/, text: /^(a propos|à propos|notre histoire|qui sommes[- ]nous|la marque|about|our story|notre mission|manifeste|l'histoire|histoire)/, score: 4 },
  { label: "faq", href: /(\/faq|questions|aide|help)/, text: /^(faq|questions? fr[ée]quentes|aide|help)/, score: 3 },
  { label: "produits", href: /(\/products?\b|\/produits?\b|\/shop\b|\/boutique\b|\/catalogue\b|\/nos-produits|best-?sellers?)/, text: /^(produits|nos produits|boutique|shop|catalogue|best[- ]?sellers?|tous les produits|all products)/, score: 2 },
  { label: "collections", href: /(\/collections?\b|\/categor)/, text: /^(collections?|nos gammes?|cat[ée]gories?)/, score: 2 },
  { label: "avis", href: /(avis|reviews|temoignages|témoignages)/, text: /^(avis|reviews|t[ée]moignages)/, score: 1 },
];

function stringOf(v: unknown): string | null {
  if (typeof v === "string") return collapse(decodeEntities(v.replace(/<[^>]+>/g, " "))) || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return stringOf(v[0]);
  if (v && typeof v === "object") { const o = v as Record<string, unknown>; return stringOf(o.name ?? o["@value"] ?? o.text ?? o.url); }
  return null;
}
function imagesOf(v: unknown, base: URL): string[] {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x as { url?: unknown; contentUrl?: unknown }).url ?? (x as { contentUrl?: unknown }).contentUrl : null)).filter((x): x is string => typeof x === "string").map((x) => abs(x, base)).filter((x): x is string => !!x);
}
const CURRENCY: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$ CA" };
function money(v: unknown, cur: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const c = typeof cur === "string" ? CURRENCY[cur.toUpperCase()] ?? cur.toUpperCase() : "€";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return c === "$" || c === "£" ? `${c}${s}` : `${s} ${c}`;
}
function priceOf(offers: unknown): string | null {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    if (r.lowPrice !== undefined || r.highPrice !== undefined) {
      const lo = money(r.lowPrice, r.priceCurrency), hi = money(r.highPrice, r.priceCurrency);
      if (lo && hi && lo !== hi) return `de ${lo} à ${hi}`;
      return lo ?? hi;
    }
    const p = money(r.price ?? (r.priceSpecification as { price?: unknown } | undefined)?.price, r.priceCurrency ?? (r.priceSpecification as { priceCurrency?: unknown } | undefined)?.priceCurrency);
    if (p) return p;
    if (Array.isArray(r.offers)) { const nested = priceOf(r.offers); if (nested) return nested; }
  }
  return null;
}

function walkJson(node: unknown, visit: (o: Record<string, unknown>) => void, depth = 0) {
  if (depth > 12) return;
  if (Array.isArray(node)) { node.forEach((n) => walkJson(n, visit, depth + 1)); return; }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    visit(o);
    for (const v of Object.values(o)) if (v && typeof v === "object") walkJson(v, visit, depth + 1);
  }
}
const typesOf = (o: Record<string, unknown>) => { const t = o["@type"]; return (Array.isArray(t) ? t : t ? [t] : []).map((x) => String(x).toLowerCase().replace(/^https?:\/\/schema\.org\//, "")); };

/** Analyse une page HTML : métadonnées, textes, produits, images, réseaux, liens internes utiles. */
export function parseHtml(html: string, url: URL, label: PageLabel, truncated = false): PageExtract {
  const headTag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const lang = attrs(headTag).lang?.slice(0, 5) ?? null;
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) { const a = attrs(m[0]); const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase(); if (key && a.content && !(key in meta)) meta[key] = collapse(a.content); }
  const titleTag = stripTags(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const title = meta["og:title"] || titleTag;
  const description = meta.description || meta["og:description"] || meta["twitter:description"] || "";
  const siteName = meta["og:site_name"] || null;
  const ogImage = meta["og:image"] ? abs(meta["og:image"], url) : meta["twitter:image"] ? abs(meta["twitter:image"], url) : null;
  const shopify = /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html);

  // Textes : sans scripts, menus, pieds de page et formulaires ; chaque paragraphe garde le titre qui le précède.
  const content = removeBlocks(html, ["script", "style", "noscript", "svg", "template", "iframe", "nav", "footer", "header", "form", "aside"]);
  const headings: { level: number; text: string }[] = [];
  const paragraphs: Paragraph[] = [];
  const seen = new Set<string>();
  let current: string | null = null;
  for (const m of content.matchAll(/<(h[1-3]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (m[1].toLowerCase() !== "p") {
      if (text.length >= 3 && text.length <= 140 && !JUNK_HEADING.test(text)) { headings.push({ level: Number(m[1][1]), text }); current = text; }
      continue;
    }
    if (text.length < 50 || BOILERPLATE.test(text)) continue;
    const key = norm(text).slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    paragraphs.push({ heading: current, text: trunc(text, 700) });
    if (paragraphs.length >= 24) break;
  }

  // JSON-LD schema.org : produits, organisation, FAQ.
  const products: ProductExtract[] = [];
  const faqs: { q: string; a: string }[] = [];
  let orgName: string | null = null; let orgDescription: string | null = null; const orgSocials: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { try { data = JSON.parse(m[1].replace(/,\s*([}\]])/g, "$1").trim()); } catch { continue; } }
    walkJson(data, (o) => {
      const types = typesOf(o);
      if (types.includes("product") || types.includes("productgroup")) {
        const name = stringOf(o.name); if (!name) return;
        const rating = o.aggregateRating && typeof o.aggregateRating === "object" ? (o.aggregateRating as Record<string, unknown>) : null;
        const rv = rating ? stringOf(rating.ratingValue) : null; const rc = rating ? stringOf(rating.reviewCount ?? rating.ratingCount) : null;
        products.push({
          name: trunc(name, 120), description: stringOf(o.description) ? trunc(stringOf(o.description)!, 400) : null,
          price: priceOf(o.offers ?? o.hasVariant), image: imagesOf(o.image, url)[0] ?? null,
          url: typeof o.url === "string" ? abs(o.url, url) : typeof o["@id"] === "string" && /^https?:/.test(o["@id"]) ? abs(o["@id"], url) : null,
          rating: rv ? `${rv.replace(".", ",")}/5${rc ? ` (${rc} avis)` : ""}` : null, brand: stringOf(o.brand),
        });
      } else if (types.some((t) => ["organization", "brand", "corporation", "localbusiness", "onlinestore", "store", "website"].includes(t))) {
        orgName = orgName ?? stringOf(o.name); orgDescription = orgDescription ?? stringOf(o.description);
        const same = Array.isArray(o.sameAs) ? o.sameAs : typeof o.sameAs === "string" ? [o.sameAs] : [];
        same.forEach((s) => { if (typeof s === "string") orgSocials.push(s); });
      } else if (types.includes("question")) {
        const q = stringOf(o.name); const ans = o.acceptedAnswer && typeof o.acceptedAnswer === "object" ? stringOf((o.acceptedAnswer as Record<string, unknown>).text) : null;
        if (q && ans) faqs.push({ q: trunc(q, 160), a: trunc(ans, 600) });
      }
    });
  }

  // FAQ heuristique : une question en titre, suivie d'un paragraphe.
  if (!faqs.length && (label === "faq" || /faq|questions/i.test(url.pathname))) {
    for (const p of paragraphs) if (p.heading && /\?\s*$/.test(p.heading)) faqs.push({ q: trunc(p.heading, 160), a: trunc(p.text, 600) });
  }

  // Cartes produit heuristiques (si rien de structuré) : un bloc « product », un nom, un prix.
  if (!products.length && label !== "a_propos" && label !== "faq") {
    const re = /<(?:li|div|article|a)\b[^>]*class\s*=\s*["'][^"']*\b(?:product|produit|grid__item|card)[^"']*["'][^>]*>/gi;
    const names = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) && products.length < 12) {
      const block = content.slice(m.index, m.index + 3000);
      const price = /(?:€\s?\d{1,5}(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?\s?€|\$\s?\d{1,5}(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?\s?(?:EUR|USD|CHF))/.exec(stripTags(block))?.[0];
      if (!price) continue;
      let name: string | null = null; let href: string | null = null;
      for (const a of block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) { const t = stripTags(a[2]); if (t.length >= 3 && t.length <= 90 && !/€|\$|ajouter|add to|acheter|voir/i.test(t)) { name = t; href = attrs(a[1]).href ?? null; break; } }
      if (!name) { const h = /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(block); if (h) name = stripTags(h[1]); }
      const img = /<img\b[^>]*>/i.exec(block); const ia = img ? attrs(img[0]) : {};
      if (!name && ia.alt) name = collapse(ia.alt);
      if (!name || names.has(norm(name))) continue;
      names.add(norm(name));
      products.push({ name: trunc(name, 120), description: null, price: price.replace(/\s+/g, " "), image: ia.src ? abs(ia.src, url) : ia["data-src"] ? abs(ia["data-src"], url) : null, url: href ? abs(href, url) : null, rating: null, brand: null });
    }
  }

  // Images : visuel social, visuels produit, puis images de contenu assez grandes.
  const images: ImageExtract[] = [];
  const imgSeen = new Set<string>();
  const pushImg = (u: string | null, alt: string | null) => {
    if (!u || /\.svg(\?|$)|\.gif(\?|$)|^data:/i.test(u)) return;
    const key = u.replace(/\?.*$/, "");
    if (imgSeen.has(key) || /pixel|tracking|sprite|favicon|icon|badge|flag|payment|paiement|loader|spinner|avatar|logo|placeholder|1x1|blank/i.test(key)) return;
    imgSeen.add(key); images.push({ url: u, alt: alt ? trunc(collapse(alt), 120) : null, source: url.href });
  };
  pushImg(ogImage, title || null);
  products.forEach((p) => pushImg(p.image, p.name));
  for (const m of content.matchAll(/<img\b[^>]*>/gi)) {
    if (images.length >= 30) break;
    const a = attrs(m[0]);
    const w = Number(a.width), h = Number(a.height);
    if ((w && w < 160) || (h && h < 160)) continue;
    const src = a.src && !/^data:/.test(a.src) ? a.src : a["data-src"] ?? a["data-original"] ?? (a.srcset ?? a["data-srcset"] ?? "").split(",").pop()?.trim().split(/\s+/)[0] ?? "";
    if (!src) continue;
    pushImg(abs(src, url), a.alt ?? null);
  }

  // Réseaux sociaux (toute la page, pied de page compris).
  const socials: SocialLink[] = [];
  const platforms = new Set<string>();
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).concat(orgSocials);
  for (const h of hrefs) {
    const u = abs(h, url); if (!u) continue;
    let host: string; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { continue; }
    if (/share|sharer|intent\/|\/plugins\//.test(u)) continue;
    const hit = SOCIAL.find(([re]) => re.test(host));
    if (!hit || platforms.has(hit[1])) continue;
    try { if (new URL(u).pathname.replace(/\/$/, "").length < 2) continue; } catch { continue; }
    platforms.add(hit[1]); socials.push({ platform: hit[1], url: u });
  }

  // Liens internes utiles pour les pages suivantes.
  const links: DiscoveredLink[] = [];
  const linkSeen = new Set<string>();
  const siteHost = url.hostname.replace(/^www\./, "");
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]); if (!a.href || /^(mailto:|tel:|javascript:|#)/i.test(a.href)) continue;
    const u = abs(a.href, url); if (!u) continue;
    let target: URL; try { target = new URL(u); } catch { continue; }
    if (target.hostname.replace(/^www\./, "") !== siteHost || /\.(pdf|jpe?g|png|webp|gif|zip|mp4|xml)$/i.test(target.pathname)) continue;
    target.hash = ""; target.search = "";
    const key = target.href.replace(/\/$/, ""); if (linkSeen.has(key) || key === url.href.replace(/\/$/, "")) continue;
    const text = norm(stripTags(m[2])).slice(0, 60); const path = norm(target.pathname);
    for (const rule of LINK_RULES) {
      if (rule.href.test(path) || rule.text.test(text)) { linkSeen.add(key); links.push({ url: target, label: rule.label, score: rule.score + (rule.text.test(text) ? 1 : 0) + (path.split("/").filter(Boolean).length <= 2 ? 1 : 0) }); break; }
    }
  }

  return { url: url.href, label, title: trunc(title || url.hostname, 200), description: trunc(description, 500), siteName: siteName ?? orgName, lang, ogImage, headings, paragraphs, products, faqs, images, socials, links, shopify, truncated };
}

/** Catalogue Shopify public (/products.json) : produits, prix, images. */
export function parseShopifyCatalog(json: string, url: URL): PageExtract {
  const products: ProductExtract[] = []; const images: ImageExtract[] = [];
  try {
    const data = JSON.parse(json) as { products?: Array<Record<string, unknown>> };
    for (const p of data.products ?? []) {
      const name = stringOf(p.title); if (!name) continue;
      const variants = Array.isArray(p.variants) ? (p.variants as Array<Record<string, unknown>>) : [];
      const prices = variants.map((v) => Number(String(v.price ?? "").replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0);
      const lo = prices.length ? Math.min(...prices) : null, hi = prices.length ? Math.max(...prices) : null;
      const fmtP = (n: number) => (Number.isInteger(n) ? `${n} €` : `${n.toFixed(2).replace(".", ",")} €`);
      const price = lo === null ? null : lo === hi ? fmtP(lo) : `de ${fmtP(lo)} à ${fmtP(hi!)}`;
      const imgs = Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>) : [];
      const img = typeof imgs[0]?.src === "string" ? abs(imgs[0].src as string, url) : null;
      const handle = typeof p.handle === "string" ? p.handle : null;
      const desc = typeof p.body_html === "string" ? stripTags(p.body_html) : "";
      products.push({ name: trunc(name, 120), description: desc ? trunc(desc, 400) : null, price, image: img, url: handle ? `${url.origin}/products/${handle}` : null, rating: null, brand: stringOf(p.vendor) });
      imgs.slice(0, 2).forEach((i) => { const u = typeof i.src === "string" ? abs(i.src, url) : null; if (u && !images.some((x) => x.url === u)) images.push({ url: u, alt: typeof i.alt === "string" ? trunc(i.alt, 120) : name, source: url.href }); });
      if (products.length >= 24) break;
    }
  } catch { /* catalogue illisible : page sans contenu */ }
  return { url: url.href, label: "catalogue", title: "Catalogue", description: "", siteName: null, lang: null, ogImage: null, headings: [], paragraphs: [], products, faqs: [], images, socials: [], links: [], shopify: true, truncated: false };
}

async function fetchPage(url: URL, label: PageLabel): Promise<PageExtract> {
  const f = await fetchPublic(url);
  if (label === "catalogue" || /application\/json/i.test(f.contentType)) {
    if (!/^\s*[{[]/.test(f.body)) throw new ExtractError("not_html");
    return parseShopifyCatalog(f.body, f.url);
  }
  if (!/<\/?(html|body|div|p|h1|head)\b/i.test(f.body.slice(0, 200_000))) throw new ExtractError("not_html");
  return parseHtml(f.body, f.url, label, f.truncated);
}

/** Choisit les pages suivantes : à propos, FAQ, produits/collections (ou le catalogue Shopify), avis. */
export function pickNextPages(home: PageExtract): Array<{ url: URL; label: PageLabel }> {
  const picks: Array<{ url: URL; label: PageLabel }> = [];
  const budget = MAX_PAGES - 1;
  const base = new URL(home.url);
  if (home.shopify) picks.push({ url: new URL("/products.json?limit=24", base), label: "catalogue" });
  const byLabel = (l: PageLabel) => home.links.filter((x) => x.label === l).sort((a, b) => b.score - a.score);
  const order: PageLabel[] = home.shopify ? ["a_propos", "faq", "collections", "produits", "avis"] : ["a_propos", "produits", "faq", "collections", "avis"];
  for (const l of order) {
    if (picks.length >= budget) break;
    const best = byLabel(l)[0];
    if (best && !picks.some((p) => p.url.href === best.url.href)) picks.push({ url: best.url, label: l });
  }
  // Encore de la place : une seconde page produits/collections.
  for (const l of ["produits", "collections"] as PageLabel[]) {
    if (picks.length >= budget) break;
    const second = byLabel(l).find((x) => !picks.some((p) => p.url.href === x.url.href));
    if (second) picks.push({ url: second.url, label: l });
  }
  return picks.slice(0, budget);
}

export function aggregate(pages: PageExtract[]): SiteExtract {
  const home = pages[0];
  const url = new URL(home.url);
  const products: ProductExtract[] = []; const pn = new Set<string>();
  for (const p of pages.flatMap((x) => x.products)) { const k = norm(p.name); if (pn.has(k)) continue; pn.add(k); products.push(p); }
  const images: ImageExtract[] = []; const im = new Set<string>();
  for (const i of pages.flatMap((x) => x.images)) { const k = i.url.replace(/\?.*$/, ""); if (im.has(k)) continue; im.add(k); images.push(i); if (images.length >= 40) break; }
  const socials: SocialLink[] = []; const sp = new Set<string>();
  for (const s of pages.flatMap((x) => x.socials)) { if (sp.has(s.platform)) continue; sp.add(s.platform); socials.push(s); }
  const faqs: SiteExtract["faqs"] = []; const fq = new Set<string>();
  for (const p of pages) for (const f of p.faqs) { const k = norm(f.q); if (fq.has(k)) continue; fq.add(k); faqs.push({ ...f, url: p.url }); }
  const paragraphs = pages.flatMap((p) => p.paragraphs.map((x) => ({ ...x, page: p.label, url: p.url })));
  const headings = pages.flatMap((p) => p.headings.map((h) => ({ ...h, page: p.label })));
  const brand = home.siteName ?? pages.find((p) => p.siteName)?.siteName ?? products.find((p) => p.brand)?.brand ?? null;
  const name = brand ?? home.title.split(/\s[|–—-]\s/)[0] ?? url.hostname.replace(/^www\./, "");
  return { url: home.url, host: url.hostname.replace(/^www\./, ""), name: trunc(name, 80), description: home.description, lang: home.lang, pages, headings, paragraphs, products: products.slice(0, 24), faqs, images, socials, ogImage: home.ogImage };
}

/* ─── Heuristiques : fiches + dossier ───────────────────────────────────── */

export function detectTone(text: string) {
  const t = text.toLowerCase();
  const tu = (t.match(/\b(tu|toi|ton|ta|tes|t'|te)\b/g) ?? []).length;
  const vous = (t.match(/\b(vous|votre|vos)\b/g) ?? []).length;
  const words = Math.max(1, t.split(/\s+/).length);
  const excl = (text.match(/!/g) ?? []).length / words;
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
  const parts: string[] = [];
  parts.push(tu > vous * 1.2 && tu >= 3 ? "Tutoiement, ton complice" : vous >= 3 ? "Vouvoiement, registre soigné" : "Registre neutre");
  parts.push(excl > 0.004 || emoji ? `énergique (ponctuation expressive${emoji ? ", émojis" : ""})` : "posé, phrases informatives");
  if (/\b(clinique|dermatolog|étude|laboratoire|formul|scientifi|prouvé|ingrédient|actif|brevet)/i.test(text)) parts.push("preuve avant émotion (vocabulaire scientifique)");
  if (/\b(luxe|exclusi|raffin|élégan|prestige|premium|haute couture|savoir-faire|artisan)/i.test(text)) parts.push("codes premium et savoir-faire");
  if (/\b(naturel|bio|vegan|écologique|durable|responsable|éthique|recyclé)/i.test(text)) parts.push("naturel et engagé");
  if (/\b(résultat|efficace|rapide|en \d+ (?:jours|minutes)|gagnez|gain de temps)/i.test(text)) parts.push("promesse de résultat et de rapidité");
  return `${parts.join(" · ")}. À confirmer avec l'équipe.`;
}

function detectPersonas(text: string): ProposedDossier["personas"] {
  const groups: Array<[RegExp, string]> = [
    [/\b(femmes?|féminin)\b/i, "Femmes"], [/\bhommes?\b/i, "Hommes"], [/\b(mamans?|mères?|parents?)\b/i, "Parents"], [/\b(bébés?|enfants?|kids)\b/i, "Parents de jeunes enfants"],
    [/\b(sportifs?|sportives?|athl[èe]tes?|running|musculation)\b/i, "Sportifs"], [/\b(entrepreneurs?|ind[ée]pendants?|freelances?|dirigeants?)\b/i, "Entrepreneurs et indépendants"],
    [/\bpeaux? (?:sensibles?|mixtes?|grasses?|sèches?|matures?)\b/i, "Personnes à la peau exigeante"], [/\b(seniors?|50 ans et plus|\+ ?50)\b/i, "Seniors"], [/\b(étudiants?|ados?|adolescents?)\b/i, "Jeunes adultes et étudiants"],
    [/\b(professionnels? (?:de|du|des) |pour les pros?\b|r[ée]serv[ée]e? aux professionnels|compte pro\b|tarifs? pro\b|coiffeurs?|esth[ée]ticiennes?)/i, "Professionnels du secteur"],
  ];
  const hits = groups.filter(([re]) => (text.match(new RegExp(re.source, "gi")) ?? []).length >= 2).slice(0, 3);
  return hits.map(([, nom]) => ({ nom, resume: "Cible évoquée sur le site. À préciser : âge, situation, besoin principal, freins à l'achat." }));
}

function detectCompetitors(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:alternative à|contrairement à|comparé à|face à|plutôt que|versus|\bvs\.?)\s+([A-Z][\w'&-]{2,}(?:\s[A-Z][\w'&-]{2,})?)/g)) { if (!/^(La|Le|Les|Nos|Vos|Des|Une|Un|Ce|Cette|Notre|Votre)$/.test(m[1])) out.add(m[1]); if (out.size >= 3) break; }
  return [...out];
}

export function heuristicProposal(site: SiteExtract): Pick<ImportOutcome, "entries" | "dossier" | "images"> {
  const entries: ProposedEntry[] = [];
  const home = site.pages[0];
  const about = site.pages.find((p) => p.label === "a_propos");
  const corpus = site.paragraphs.map((p) => p.text).join("\n");
  const fullText = `${home.title}\n${site.description}\n${site.headings.map((h) => h.text).join("\n")}\n${corpus}`;
  const h1 = site.headings.find((h) => h.level === 1 && h.page === "accueil")?.text ?? null;

  // Identité
  entries.push({ section: SECTION_IDENTITE, kind: "fait", title: `Marque : ${site.name}`, content: [site.description || home.title, `Site : ${site.host}${site.lang ? ` · langue ${site.lang}` : ""}`].filter(Boolean).join("\n"), source_url: site.url });
  if (h1 && norm(h1) !== norm(site.name)) entries.push({ section: SECTION_IDENTITE, kind: classifyKind(h1), title: "Message d'accueil", content: h1, source_url: site.url });
  if (about && about.paragraphs.length) {
    const txt = about.paragraphs.slice(0, 3).map((p) => p.text).join("\n\n");
    entries.push({ section: SECTION_IDENTITE, kind: classifyKind(txt), title: "Histoire et mission (page À propos)", content: trunc(txt, 900), source_url: about.url });
  }
  for (const h of site.headings.filter((x) => x.page === "accueil" && x.level === 2).slice(0, 6)) {
    if (MARKETING.test(h.text) && !entries.some((e) => e.content === h.text)) entries.push({ section: SECTION_IDENTITE, kind: "allegation", title: "Promesse mise en avant", content: h.text, source_url: site.url });
  }

  // Produits & prix
  for (const p of site.products.slice(0, 14)) {
    const lines = [p.price ? `Prix : ${p.price}` : "Prix non affiché", p.description, p.rating ? `Note ${p.rating}` : null, p.brand && norm(p.brand) !== norm(site.name) ? `Marque : ${p.brand}` : null].filter(Boolean);
    entries.push({ section: SECTION_PRODUITS, kind: "fait", title: p.name, content: lines.join("\n"), source_url: p.url ?? site.pages.find((x) => x.products.includes(p))?.url ?? site.url });
  }
  if (!site.products.length) entries.push({ section: SECTION_PRODUITS, kind: "manque", title: "Catalogue et prix non détectés", content: "Aucune fiche produit lisible sur les pages parcourues. Demander au client la liste des produits, les prix et les bénéfices clés.", source_url: null });

  // Connaissances : FAQ puis textes clés (titre = rubrique de la page)
  for (const f of site.faqs.slice(0, 8)) entries.push({ section: SECTION_CONNAISSANCES, kind: "fait", title: trunc(f.q, 140), content: f.a, source_url: f.url });
  const used = new Set<string>();
  const productTexts = site.products.map((p) => (p.description ? norm(p.description).slice(0, 60) : "")).filter(Boolean);
  for (const p of site.paragraphs.filter((x) => x.page !== "a_propos").slice(0, 40)) {
    if (entries.filter((e) => e.section === SECTION_CONNAISSANCES).length >= 14) break;
    const key = norm(p.text).slice(0, 80); if (used.has(key) || site.faqs.some((f) => norm(f.a).startsWith(key))) continue; used.add(key);
    if (productTexts.includes(key.slice(0, 60))) continue; // déjà porté par la fiche produit
    const kind = classifyKind(p.text);
    if (kind === "fait" && !/\d/.test(p.text) && p.text.length < 90) continue; // trop court et sans donnée : peu utile
    entries.push({ section: SECTION_CONNAISSANCES, kind, title: p.heading ? trunc(p.heading, 90) : `Texte de la page ${PAGE_LABEL[p.page].toLowerCase()}`, content: p.text, source_url: p.url });
  }

  // Références
  if (site.socials.length) entries.push({ section: SECTION_REFERENCES, kind: "fait", title: "Réseaux sociaux", content: site.socials.map((s) => `${s.platform} : ${s.url}`).join("\n"), source_url: site.url });
  if (site.ogImage) entries.push({ section: SECTION_REFERENCES, kind: "fait", title: "Visuel principal du site", content: "Image mise en avant par le site (partages sociaux). Voir la galerie du dossier de marque.", source_url: site.ogImage });
  entries.push({ section: SECTION_REFERENCES, kind: "note", title: "Pages analysées", content: site.pages.map((p) => `${PAGE_LABEL[p.label]} : ${p.url}`).join("\n"), source_url: site.url });

  const dossier: ProposedDossier = {
    promesse: trunc(site.description || h1 || home.title, 240),
    ton: detectTone(fullText),
    personas: detectPersonas(fullText),
    concurrents: detectCompetitors(fullText),
  };
  return { entries: entries.slice(0, 36), dossier, images: site.images };
}

/* ─── Structuration par Claude (optionnelle) ────────────────────────────── */

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

function digest(site: SiteExtract) {
  const lines: string[] = [`SITE : ${site.url}`, `NOM : ${site.name}`, site.description ? `DESCRIPTION : ${site.description}` : "", site.lang ? `LANGUE : ${site.lang}` : ""];
  site.pages.forEach((p, i) => {
    lines.push("", `PAGE ${i + 1} (${PAGE_LABEL[p.label]}) : ${p.url}`, `Titre : ${p.title}`);
    if (p.description) lines.push(`Description : ${p.description}`);
    const hs = p.headings.slice(0, 14).map((h) => `H${h.level} ${h.text}`); if (hs.length) lines.push(`Titres : ${hs.join(" | ")}`);
    p.paragraphs.slice(0, 12).forEach((x) => lines.push(`- ${x.heading ? `[${x.heading}] ` : ""}${x.text}`));
  });
  if (site.products.length) { lines.push("", `PRODUITS (${site.products.length}) :`); site.products.forEach((p) => lines.push(`- ${p.name}${p.price ? ` — ${p.price}` : ""}${p.rating ? ` — note ${p.rating}` : ""}${p.url ? ` — ${p.url}` : ""}${p.description ? ` — ${trunc(p.description, 220)}` : ""}`)); }
  if (site.faqs.length) { lines.push("", "FAQ :"); site.faqs.slice(0, 12).forEach((f) => lines.push(`- Q : ${f.q} — R : ${f.a}`)); }
  if (site.socials.length) lines.push("", `RÉSEAUX : ${site.socials.map((s) => `${s.platform} ${s.url}`).join(" ; ")}`);
  let text = lines.filter((l) => l !== undefined).join("\n");
  if (text.length > 28_000) text = `${text.slice(0, 28_000)}\n[…extrait tronqué]`;
  return text;
}

const SYSTEM_PROMPT = `Tu es l'assistant « Brain » d'icon-flow, une agence de publicité vidéo. À partir d'extraits du site d'une marque, tu produis la mémoire de marque qui servira à écrire des scripts publicitaires.
Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, aucune balise de code), de la forme :
{"dossier":{"promesse":string,"ton":string,"personas":[{"nom":string,"resume":string}],"concurrents":[string]},"entries":[{"section":string,"kind":string,"title":string,"content":string,"source_url":string|null}]}
Règles :
- Français, précis, sans jargon. Titres ≤ 90 caractères, contenus ≤ 400 caractères, une information par fiche.
- "section" ∈ ["Identité","Connaissances","Produits & prix","Références"]. "kind" ∈ ["fait","allegation","manque"].
  "fait" = donnée factuelle vérifiable sur le site (prix, composition, délais, chiffres, dates, lieux, process, garanties chiffrées).
  "allegation" = promesse marketing ou affirmation non prouvée (superlatifs, résultats annoncés sans preuve).
  "manque" = information importante pour écrire des publicités et absente du site (3 fiches au maximum).
- Entre 10 et 30 fiches. Une fiche par produit trouvé (section "Produits & prix", avec le prix s'il est connu). Les textes « à propos » vont dans "Identité". Les FAQ et arguments vont dans "Connaissances". Réseaux sociaux et visuels vont dans "Références".
- N'invente rien : chaque fiche s'appuie sur les extraits. "source_url" est l'URL de la page ou du produit d'où vient l'information, sinon null.
- "dossier.promesse" : une phrase, le bénéfice principal et concret. "dossier.ton" : une à deux phrases (registre, tutoiement/vouvoiement, champ lexical, énergie).
- "personas" : uniquement les cibles que le site laisse voir (0 à 3), "nom" court et "resume" en une phrase. "concurrents" : uniquement s'ils sont cités, sinon [].`;

async function callClaude(key: string, user: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(anthropicUrl(), {
      method: "POST", signal: ctrl.signal, cache: "no-store",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      // max_tokens couvre aussi la réflexion adaptative du modèle ; effort « medium » : une extraction structurée n'a pas besoin du maximum et doit tenir dans le délai.
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, max_tokens: 16000, output_config: { effort: "medium" }, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) { const body = await res.text().catch(() => ""); throw new ExtractError("ai_http", res.status, body.slice(0, 400)); }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    if (json.stop_reason === "refusal") throw new ExtractError("ai_refusal");
    const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    return { text, tokens_in: json.usage?.input_tokens ?? 0, tokens_out: json.usage?.output_tokens ?? 0 };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw new ExtractError("ai_timeout");
    throw e;
  } finally { clearTimeout(timer); }
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ExtractError("ai_json");
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new ExtractError("ai_json"); }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? trunc(collapse(v), max) : "");
function sectionOf(v: unknown) {
  const n = norm(String(v ?? ""));
  if (n.startsWith("ident")) return SECTION_IDENTITE;
  if (n.startsWith("produit") || n.includes("prix")) return SECTION_PRODUITS;
  if (n.startsWith("refer")) return SECTION_REFERENCES;
  return SECTION_CONNAISSANCES;
}

/** Valide et nettoie la réponse du modèle : sections et types connus, longueurs bornées, sources plausibles. */
export function sanitizeAi(raw: unknown, site: SiteExtract): Pick<ImportOutcome, "entries" | "dossier"> {
  if (!raw || typeof raw !== "object") throw new ExtractError("ai_json");
  const o = raw as { dossier?: Record<string, unknown>; entries?: unknown };
  const okUrl = (v: unknown) => {
    if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return null;
    try { const u = new URL(v); const host = u.hostname.replace(/^www\./, ""); return host === site.host || host.endsWith(`.${site.host}`) || site.images.some((i) => i.url === v) || site.socials.some((s) => s.url === v) ? u.href : null; } catch { return null; }
  };
  const entries: ProposedEntry[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(o.entries) ? o.entries.slice(0, 40) : []) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const title = str(r.title, 140), content = str(r.content, 1200);
    if (!title || !content) continue;
    const key = norm(`${title}|${content}`).slice(0, 160); if (seen.has(key)) continue; seen.add(key);
    const kind = KINDS.includes(r.kind as BrainEntryKind) ? (r.kind as BrainEntryKind) : "fait";
    entries.push({ section: sectionOf(r.section), kind, title, content, source_url: okUrl(r.source_url) });
  }
  if (!entries.length) throw new ExtractError("ai_json");
  const d = o.dossier ?? {};
  const personas = (Array.isArray(d.personas) ? d.personas.slice(0, 4) : []).map((p) => (p && typeof p === "object" ? { nom: str((p as Record<string, unknown>).nom, 120), resume: str((p as Record<string, unknown>).resume, 400) } : null)).filter((p): p is { nom: string; resume: string } => !!p && !!p.nom);
  const concurrents = (Array.isArray(d.concurrents) ? d.concurrents.slice(0, 8) : []).map((c) => str(c, 60)).filter(Boolean);
  return { entries, dossier: { promesse: str(d.promesse, 400), ton: str(d.ton, 600), personas, concurrents } };
}

function describeAiError(err: unknown) {
  if (err instanceof ExtractError) {
    if (err.code === "ai_http") return err.status === 401 || err.status === 403 ? "clé API refusée" : err.status === 429 ? "quota de l'API atteint" : err.status === 404 ? "modèle inconnu" : `réponse ${err.status} de l'API`;
    if (err.code === "ai_refusal") return "le modèle a refusé la demande";
    if (err.code === "ai_timeout") return "le modèle n'a pas répondu à temps";
    if (err.code === "ai_json") return "réponse du modèle illisible";
  }
  return "le modèle n'a pas pu être joint";
}

/* ─── Orchestration ─────────────────────────────────────────────────────── */

/** Lit le site (jusqu'à 5 pages) et prépare fiches, dossier et images. Ne touche pas à la base. */
export async function importSite(start: URL): Promise<ImportOutcome> {
  const home = await fetchPage(start, "accueil");
  const next = pickNextPages(home);
  const settled = await Promise.allSettled(next.map((n) => fetchPage(n.url, n.label)));
  const pages = [home, ...settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))];
  const site = aggregate(pages);
  const hasContent = site.paragraphs.length + site.products.length + site.faqs.length + site.headings.length > 0 || Boolean(site.description);
  if (!hasContent) throw new ExtractError("empty");

  const heuristic = heuristicProposal(site);
  const summary = { images: heuristic.images, pages: site.pages.map((p) => ({ url: p.url, title: p.title, label: p.label })) };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { mode: "simple", ai_error: null, ...heuristic, ...summary, usage: null };

  try {
    const res = await callClaude(key, digest(site));
    const ai = sanitizeAi(parseJsonObject(res.text), site);
    // Les produits lus (prix) et les références déterministes complètent ce que le modèle a pu omettre.
    const entries = [...ai.entries];
    if (!entries.some((e) => e.section === SECTION_PRODUITS)) entries.push(...heuristic.entries.filter((e) => e.section === SECTION_PRODUITS));
    if (!entries.some((e) => e.section === SECTION_REFERENCES)) entries.push(...heuristic.entries.filter((e) => e.section === SECTION_REFERENCES));
    const dossier: ProposedDossier = {
      promesse: ai.dossier.promesse || heuristic.dossier.promesse, ton: ai.dossier.ton || heuristic.dossier.ton,
      personas: ai.dossier.personas.length ? ai.dossier.personas : heuristic.dossier.personas, concurrents: ai.dossier.concurrents.length ? ai.dossier.concurrents : heuristic.dossier.concurrents,
    };
    const cost_usd = (res.tokens_in * PRICE_IN_PER_M + res.tokens_out * PRICE_OUT_PER_M) / 1_000_000;
    return { mode: "ia", ai_error: null, entries: entries.slice(0, 40), dossier, ...summary, usage: { tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: Math.round(cost_usd * 10_000) / 10_000 } };
  } catch (e) {
    console.warn("[iconflow] brain import : IA indisponible, extraction simple —", e instanceof Error ? e.message : e);
    return { mode: "simple", ai_error: describeAiError(e), ...heuristic, ...summary, usage: null };
  }
}

/** Vrai quand les sections viennent de notre liste (utile aux tests). */
export const isKnownSection = (s: string): s is (typeof SECTIONS)[number] => (SECTIONS as readonly string[]).includes(s);
