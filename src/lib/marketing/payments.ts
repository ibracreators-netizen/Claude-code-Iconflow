/**
 * Liens de paiement et documents de vente (contrats, devis…) de l'espace Marketing, comme l'écran
 * « Paiements » de LeadConnector. Aucune table : deux réglages JSON de marketing_settings
 * (« payment_links » et « sales_documents »). Le paiement et le fichier restent dans leur outil
 * (Stripe, LeadConnector, Whop, Google Drive, Yousign…) : ici, on garde le lien pour l'envoyer vite.
 *
 * Lecture : dans l'application, seulement avec « Prospects et paiements » (page Paiements). La base laisse encore
 * lire marketing_settings à tout compte qui a un module Marketing : un lien rangé ici doit donc rester protégé
 * dans son outil (accès sur invitation), pas ouvert à quiconque a le lien.
 *
 * Ce module ne dépend de rien côté serveur : il sert aux écrans, aux server actions et aux scripts.
 */
import { z } from "zod";
import { canAccess } from "@/lib/permissions";
import type { Profile } from "@/lib/data/types";

export const PAYMENT_LINKS_KEY = "payment_links";
export const SALES_DOCUMENTS_KEY = "sales_documents";
/** Éléments au plus, par liste. */
export const MAX_ITEMS = 200;
const MAX_PRICE = 10_000_000;

export interface PaymentLink { id: string; name: string; url: string; price: number | null; currency: "EUR"; active: boolean; note: string | null; created_at: string; created_by: string | null; updated_at: string }
export type DocKind = "contrat" | "document" | "devis" | "autre";
export const DOC_KINDS: Array<{ value: DocKind; label: string }> = [
  { value: "contrat", label: "Contrat" }, { value: "devis", label: "Devis" }, { value: "document", label: "Document" }, { value: "autre", label: "Autre" },
];
export const docKindLabel = (k: DocKind) => DOC_KINDS.find((d) => d.value === k)?.label ?? "Autre";
export interface SalesDocument { id: string; name: string; kind: DocKind; url: string; note: string | null; created_at: string; created_by: string | null; updated_at: string }

/**
 * Qui peut créer, modifier ou supprimer : un membre de l'agence qui a « Réglages marketing »
 * (c'est aussi ce que la base exige pour écrire dans marketing_settings). Les commerciaux voient et copient.
 */
export const canEditPayments = (profile: Pick<Profile, "role" | "permissions">) => profile.role === "agency" && canAccess(profile, "marketing_reglages");

/* ─────────────────────────── Nettoyage et validation ─────────────────────────── */

/** Caractères de contrôle et d'inversion de sens retirés (les retours à la ligne sont gardés si `lines`). */
export function cleanText(v: unknown, lines = false): string {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  const out = s.replace(lines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, " ").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  return (lines ? out : out.replace(/\s{2,}/g, " ")).trim();
}

/** Lien sûr : https uniquement, avec un vrai nom de domaine, sans identifiants. Renvoie le lien normalisé, ou null. */
export function safeHttpsUrl(v: unknown): string | null {
  const raw = cleanText(v);
  if (!raw || raw.length > 2000 || !/^https:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    // Un vrai nom de domaine (pas d'adresse IP, pas de « localhost ») : au moins un point et une extension avec une lettre.
    if (!/^(?:[a-z0-9-]+\.)+(?=[a-z0-9-]*[a-z])[a-z0-9-]{2,}$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

/** « 1 500,50 », « 1500.5 », « 1 500 € » → 1500.5 ; vide → null. Lève une erreur si la valeur n'est pas un prix. */
export function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = cleanText(v).replace(/[\s  €]/g, "");
    if (!s) return null;
    n = /^\d+(?:[.,]\d{1,2})?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
  }
  if (!Number.isFinite(n) || n < 0) throw new Error("Le prix doit être un nombre positif (ex. 1500 ou 1 500,50).");
  if (n > MAX_PRICE) throw new Error("Le prix dépasse 10 000 000 €.");
  return Math.round(n * 100) / 100;
}

const name = z.string({ error: "Donne un nom." }).transform((s) => cleanText(s))
  .refine((s) => s.length >= 1, "Donne un nom.").refine((s) => s.length <= 120, "Le nom fait 120 caractères au plus.");
const url = z.string({ error: "Colle le lien (il commence par « https:// »)." }).transform((s, ctx) => {
  const ok = safeHttpsUrl(s);
  if (!ok) { ctx.addIssue({ code: "custom", message: /^\s*https:\/\//i.test(s) ? "Ce lien n'est pas valide." : "Le lien doit commencer par « https:// »." }); return z.NEVER; }
  return ok;
});
const note = z.string().nullish().transform((s) => cleanText(s ?? "", true).slice(0, 500) || null);
const price = z.union([z.number(), z.string()]).nullish().transform((v, ctx) => {
  try { return parsePrice(v); } catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; }
});
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Élément introuvable.").nullish().transform((v) => v ?? null);

export const paymentLinkInput = z.object({ id, name, url, price, note, active: z.boolean().default(true) });
export const salesDocumentInput = z.object({ id, name, url, note, kind: z.enum(["contrat", "document", "devis", "autre"], { error: "Choisis un type de document." }) });
export type PaymentLinkInput = z.input<typeof paymentLinkInput>;
export type SalesDocumentInput = z.input<typeof salesDocumentInput>;

/** Valide une saisie ; lève la première erreur, en français. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Saisie invalide.");
  return r.data;
}

/* ─────────────────────────── Lecture des réglages ─────────────────────────── */

const iso = (v: unknown, fallback: string) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Liste lue en base → liens sûrs, du plus récent au plus ancien. Une ligne abîmée ou un lien non https est écarté. */
export function parseLinks(raw: unknown): PaymentLink[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentLink[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>, u = safeHttpsUrl(x.url), n = cleanText(x.name).slice(0, 120);
    if (typeof x.id !== "string" || !u || !n) continue;
    let p: number | null = null; try { p = parsePrice(x.price); } catch { p = null; }
    const created = iso(x.created_at, new Date(0).toISOString());
    out.push({ id: x.id, name: n, url: u, price: p, currency: "EUR", active: x.active !== false, note: cleanText(x.note, true).slice(0, 500) || null, created_at: created, created_by: str(x.created_by), updated_at: iso(x.updated_at, created) });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function parseDocuments(raw: unknown): SalesDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: SalesDocument[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>, u = safeHttpsUrl(x.url), n = cleanText(x.name).slice(0, 120);
    if (typeof x.id !== "string" || !u || !n) continue;
    const kind: DocKind = DOC_KINDS.some((d) => d.value === x.kind) ? (x.kind as DocKind) : "autre";
    const created = iso(x.created_at, new Date(0).toISOString());
    out.push({ id: x.id, name: n, kind, url: u, note: cleanText(x.note, true).slice(0, 500) || null, created_at: created, created_by: str(x.created_by), updated_at: iso(x.updated_at, created) });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/* ─────────────────────────── Affichage ─────────────────────────── */

const priceFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1500 → « 1 500,00 € ». */
export const formatPrice = (n: number | null) => (n === null ? "—" : priceFmt.format(n));
/** Lien affiché sans « https:// » ni barre finale. */
export const displayUrl = (u: string) => u.replace(/^https:\/\//i, "").replace(/\/$/, "");
/** « 19 nov. à 19:00 » (l'année seulement si ce n'est pas l'année en cours), dans le fuseau de l'espace. */
export function formatCreated(isoDate: string, timeZone: string, now = new Date()): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "—";
  const year = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone });
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", ...(year.format(d) !== year.format(now) ? { year: "numeric" } : {}), timeZone }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  return `${day} à ${time}`;
}
/** Jour (AAAA-MM-JJ) d'une date, dans le fuseau de l'espace : sert au filtre par dates. */
export const dayIn = (isoDate: string, timeZone: string) => new Intl.DateTimeFormat("fr-CA", { timeZone }).format(new Date(isoDate));
