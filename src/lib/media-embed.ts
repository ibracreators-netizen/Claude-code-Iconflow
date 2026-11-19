/*
 * Vidéo de référence d'un brief : reconnaît le lien collé et dit comment le lire dans la page.
 * Fonction pure, sans dépendance (Studio, espace client, liens publics, plan IA).
 *
 *  - fichier vidéo direct (.mp4, .mov, .webm, .m4v, lien de stockage signé compris) → <video>
 *  - YouTube, Vimeo, TikTok, Instagram, Google Drive, Loom → lecteur officiel du service dans un cadre
 *  - Dropbox (?dl=0) vers un fichier vidéo → même lien en ?raw=1, lu comme un fichier direct
 *  - tout le reste (Frame.io, lien court vm.tiktok.com, autre site) → simple lien à ouvrir
 *
 * Garde-fous : HTTPS seulement (un http:// n'est accepté que pour un service reconnu, et passe en https),
 * identifiants vérifiés par expression régulière stricte, et le cadre ne pointe JAMAIS vers une adresse
 * non reconnue : son adresse est reconstruite ici, jamais recopiée depuis la saisie.
 */

export type MediaProvider = "youtube" | "vimeo" | "tiktok" | "instagram" | "drive" | "loom";

export type MediaEmbed =
  /** Fichier vidéo lisible directement par le navigateur. */
  | { kind: "file"; src: string; href: string; service: string | null }
  /** Lecteur officiel d'un service reconnu. `vertical` : format 9:16 (TikTok, Reels, Shorts). */
  | { kind: "iframe"; provider: MediaProvider; src: string; href: string; service: string; vertical: boolean }
  /** Lien valide mais non lisible ici : on propose de l'ouvrir dans un nouvel onglet. */
  | { kind: "link"; href: string; host: string };

const VIDEO_FILE = /\.(mp4|mov|webm|m4v)$/i;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;
const TIKTOK_ID = /^\d{15,22}$/;
const INSTA_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{20,80}$/;
const LOOM_ID = /^[0-9a-f]{32}$/i;

const hostIs = (host: string, ...names: string[]) => names.some((n) => host === n || host.endsWith(`.${n}`));

/** Services dont on accepte aussi un lien http:// (repassé en https). */
const KNOWN = ["youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com", "tiktok.com", "instagram.com", "drive.google.com", "loom.com", "dropbox.com", "dropboxusercontent.com"];

/** Lien saisi → URL HTTPS sans identifiants, ou null. Un domaine collé sans « https:// » est accepté. */
function toUrl(input: string): URL | null {
  let raw = input.trim();
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (!/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?)/i.test(raw)) return null;
    raw = `https://${raw}`;
  }
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (u.protocol === "http:" && hostIs(host, ...KNOWN)) u.protocol = "https:";
  if (u.protocol !== "https:" || u.port) return null;
  return u;
}

/** « 90 », « 90s », « 1m30s », « 1h2m3s » → secondes (début de lecture YouTube), sinon 0. */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d{1,6}$/.test(t)) return Number(t);
  const m = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s)?$/.exec(t);
  return m && (m[1] || m[2] || m[3]) ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function youtube(u: URL, host: string): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let vertical = false;
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (parts[0] === "watch") id = u.searchParams.get("v");
  else if (parts[0] === "shorts") { id = parts[1] ?? null; vertical = true; }
  else if (["embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  if (!id || !YT_ID.test(id)) return null;
  const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${start ? `&start=${start}` : ""}`;
  const href = vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;
  return { kind: "iframe", provider: "youtube", src, href, service: "YouTube", vertical };
}

function vimeo(u: URL, host: string): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let hash: string | null = u.searchParams.get("h");
  if (host === "player.vimeo.com") { if (parts[0] === "video") id = parts[1] ?? null; }
  else {
    // vimeo.com/123, vimeo.com/123/abcdef (non répertoriée), vimeo.com/channels/x/123, vimeo.com/groups/x/videos/123
    const i = parts.findIndex((p) => VIMEO_ID.test(p));
    if (i >= 0) { id = parts[i]; if (!hash && parts[i + 1] && VIMEO_HASH.test(parts[i + 1])) hash = parts[i + 1]; }
  }
  if (!id || !VIMEO_ID.test(id)) return null;
  const h = hash && VIMEO_HASH.test(hash) ? hash : null;
  return { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ""}`, href: `https://vimeo.com/${id}${h ? `/${h}` : ""}`, service: "Vimeo", vertical: false };
}

function tiktok(u: URL): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (parts[0]?.startsWith("@") && parts[1] === "video") id = parts[2] ?? null;
  else if (parts[0] === "embed" && parts[1] === "v2") id = parts[2] ?? null;
  else if (parts[0] === "player" && parts[1] === "v1") id = parts[2] ?? null;
  if (!id || !TIKTOK_ID.test(id)) return null;
  const user = parts[0]?.startsWith("@") && /^@[A-Za-z0-9._]{1,40}$/.test(parts[0]) ? parts[0] : "@tiktok";
  return { kind: "iframe", provider: "tiktok", src: `https://www.tiktok.com/player/v1/${id}`, href: `https://www.tiktok.com/${user}/video/${id}`, service: "TikTok", vertical: true };
}

function instagram(u: URL): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  const type = parts[0] === "reels" ? "reel" : parts[0];
  const code = parts[1] ?? null;
  if (!type || !["reel", "p", "tv"].includes(type) || !code || !INSTA_CODE.test(code)) return null;
  const path = type === "p" ? "p" : "reel";
  return { kind: "iframe", provider: "instagram", src: `https://www.instagram.com/${path}/${code}/embed`, href: `https://www.instagram.com/${path}/${code}/`, service: "Instagram", vertical: true };
}

function drive(u: URL): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  const d = parts.indexOf("d");
  if (parts[0] === "file" && d === 1) id = parts[2] ?? null;
  else if (parts[0] === "open" || parts[0] === "uc") id = u.searchParams.get("id");
  if (!id || !DRIVE_ID.test(id)) return null;
  return { kind: "iframe", provider: "drive", src: `https://drive.google.com/file/d/${id}/preview`, href: `https://drive.google.com/file/d/${id}/view`, service: "Google Drive", vertical: false };
}

function loom(u: URL): MediaEmbed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  const id = parts[0] === "share" || parts[0] === "embed" ? parts[1] : null;
  if (!id || !LOOM_ID.test(id)) return null;
  return { kind: "iframe", provider: "loom", src: `https://www.loom.com/embed/${id}`, href: `https://www.loom.com/share/${id}`, service: "Loom", vertical: false };
}

/** Dropbox : un fichier vidéo partagé (?dl=0) se lit en ?raw=1 ; un dossier ou autre chose reste un lien. */
function dropbox(u: URL, host: string): MediaEmbed | null {
  if (!VIDEO_FILE.test(u.pathname)) return null;
  if (hostIs(host, "dropboxusercontent.com")) return { kind: "file", src: u.href, href: u.href, service: "Dropbox" };
  const raw = new URL(u.href);
  raw.searchParams.delete("dl");
  raw.searchParams.set("raw", "1");
  return { kind: "file", src: raw.href, href: u.href, service: "Dropbox" };
}

/**
 * Décrit la vidéo de référence : lecteur intégré, fichier direct, ou lien à ouvrir.
 * null si la saisie n'est pas un lien HTTPS utilisable (rien de cliquable n'est alors proposé).
 */
export function mediaEmbed(input: string | null | undefined): MediaEmbed | null {
  if (typeof input !== "string") return null;
  const u = toUrl(input);
  if (!u) return null;
  const host = u.hostname.toLowerCase();

  let found: MediaEmbed | null = null;
  if (hostIs(host, "youtube.com", "youtube-nocookie.com") || host === "youtu.be") found = youtube(u, host === "youtu.be" ? host : "youtube.com");
  else if (hostIs(host, "vimeo.com")) found = vimeo(u, host);
  else if (host === "tiktok.com" || host === "www.tiktok.com" || host === "m.tiktok.com") found = tiktok(u);
  else if (host === "instagram.com" || host === "www.instagram.com") found = instagram(u);
  else if (host === "drive.google.com") found = drive(u);
  else if (host === "loom.com" || host === "www.loom.com") found = loom(u);
  else if (hostIs(host, "dropbox.com", "dropboxusercontent.com")) found = dropbox(u, host);
  else if (VIDEO_FILE.test(u.pathname)) found = { kind: "file", src: u.href, href: u.href, service: null };

  return found ?? { kind: "link", href: u.href, host: host.replace(/^www\./, "") };
}

/** Lien de photo affichable (HTTPS, sans identifiants), sinon null. */
export function imageSrc(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!/^https:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/** Adresse du lecteur pour l'aperçu en grand : lecture lancée d'emblée (le clic sur « Agrandir » l'autorise). */
export function autoplaySrc(e: Extract<MediaEmbed, { kind: "iframe" }>): string {
  const u = new URL(e.src);
  if (e.provider === "youtube" || e.provider === "vimeo" || e.provider === "tiktok") u.searchParams.set("autoplay", "1");
  if (e.provider === "loom") u.searchParams.set("autoplay", "1");
  return u.href;
}
