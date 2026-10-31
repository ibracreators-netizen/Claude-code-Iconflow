import type { BrandDossierData } from "@/lib/data/types";

/*
 * Données annexes rangées dans le dossier de marque (jsonb libre) par l'import de site :
 *  - `images`          : galerie de visuels trouvés sur le site ;
 *  - `import_proposal` : proposition de dossier (promesse, ton, personas, concurrents) en attente d'un clic « Appliquer ».
 * Lecture défensive : la base peut contenir n'importe quoi, l'interface ne doit jamais planter.
 */

export interface DossierImage { url: string; alt: string | null; source: string | null }
export interface ImportProposal {
  import_id: string; url: string; mode: "ia" | "simple"; created_at: string;
  promesse: string; ton: string; personas: Array<{ nom: string; resume: string }>; concurrents: string[];
}

const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");

export function dossierImages(data: BrandDossierData | null | undefined): DossierImage[] {
  const raw = data?.images;
  if (!Array.isArray(raw)) return [];
  const out: DossierImage[] = []; const seen = new Set<string>();
  for (const item of raw) {
    const url = isHttp(item) ? item : item && typeof item === "object" ? (item as { url?: unknown }).url : null;
    if (!isHttp(url) || seen.has(url)) continue;
    seen.add(url);
    const o = (item && typeof item === "object" ? item : {}) as { alt?: unknown; source?: unknown };
    out.push({ url, alt: typeof o.alt === "string" ? o.alt : null, source: isHttp(o.source) ? o.source : null });
  }
  return out;
}

export function dossierProposal(data: BrandDossierData | null | undefined): ImportProposal | null {
  const p = data?.import_proposal;
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const personas = Array.isArray(o.personas) ? o.personas.flatMap((x) => (x && typeof x === "object" && text((x as { nom?: unknown }).nom) ? [{ nom: text((x as { nom?: unknown }).nom), resume: text((x as { resume?: unknown }).resume) }] : [])) : [];
  const concurrents = Array.isArray(o.concurrents) ? o.concurrents.filter((c): c is string => typeof c === "string" && !!c.trim()) : [];
  const proposal: ImportProposal = {
    import_id: text(o.import_id), url: text(o.url), mode: o.mode === "ia" ? "ia" : "simple", created_at: text(o.created_at),
    promesse: text(o.promesse), ton: text(o.ton), personas, concurrents,
  };
  return proposal.promesse || proposal.ton || personas.length || concurrents.length ? proposal : null;
}

/** Fusionne deux galeries sans doublon (même image avec ou sans paramètres d'URL), 48 visuels au plus. */
export function mergeImages(current: DossierImage[], added: DossierImage[], max = 48): DossierImage[] {
  const out: DossierImage[] = []; const seen = new Set<string>();
  for (const i of [...current, ...added]) {
    const key = i.url.replace(/\?.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key); out.push(i);
    if (out.length >= max) break;
  }
  return out;
}

export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
