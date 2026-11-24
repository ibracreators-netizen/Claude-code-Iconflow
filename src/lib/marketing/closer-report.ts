/**
 * Rapport des closers : calculs purs sur les chiffres DÉCLARÉS chaque jour (saisie des membres et liens personnels).
 * Aucune dépendance serveur : sert aux pages, aux formulaires (avertissements) et au script de vérification hors ligne.
 * Un taux sans base reste vide (`null`), jamais un 0 % inventé.
 */
import { KPI_FIELDS, type KpiField } from "./types";

/** Clés des champs closer, dans l'ordre du formulaire. Les anciennes (relances, propositions) restent en dernier. */
export const CLOSER_KEYS = ["rdv_prevus", "show_up", "no_show", "annules", "non_qualifies", "pitchs", "closes", "en_reflexion", "cash", "ca_signe", "relances", "propositions"] as const;
export type CloserKey = (typeof CLOSER_KEYS)[number];
export type CloserTotals = Record<CloserKey, number>;
export const CLOSER_FIELD = Object.fromEntries(KPI_FIELDS.closer.map((f) => [f.key, f])) as Record<CloserKey, KpiField>;
const SETTER_KEYS = KPI_FIELDS.setter.map((f) => f.key);

export interface CloserRates {
  /** Show-up ÷ (show-up + no-show). */
  showRate: number | null;
  /** Pitchs ÷ show-up. */
  pitchRate: number | null;
  /** Closes ÷ show-up. */
  closeRate: number | null;
  /** Closes ÷ pitchs. */
  pitchClose: number | null;
  /** Non qualifiés ÷ show-up. */
  unqualified: number | null;
  /** CA signé ÷ closes, en euros (au centime). */
  average: number | null;
}
export interface CloserReport { totals: CloserTotals; rates: CloserRates; days: number }

/** Taux en pourcentage, au dixième ; `null` si la base est 0. */
export const closerPct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

/** Règles de calcul, lues au survol des intitulés (cartes, entonnoir, tableaux). */
export const CLOSER_RULES = {
  days: "Jours où la personne a saisi ses chiffres, sur la période.",
  showRate: "Taux de show-up : show-up ÷ (show-up + no-show). Les annulés ne comptent pas.",
  pitchRate: "Taux de pitch : pitchs ÷ show-up.",
  closeRate: "Taux de closing : closes ÷ show-up.",
  pitchClose: "Closing sur pitch : closes ÷ pitchs.",
  unqualified: "Part de non qualifiés : non qualifiés ÷ show-up.",
  average: "Panier moyen : CA signé ÷ closes. Vide sans close.",
  declared: "Chiffres saisis chaque jour par les closers, avec leur compte ou leur lien personnel. Déclaratifs : l'app ne les vérifie pas.",
} as const;

/** Règle d'un champ saisi : « Show-up : le prospect s'est présenté à l'appel ». */
export const fieldRule = (f: KpiField) => `${f.label} : ${f.hint.charAt(0).toLowerCase()}${f.hint.slice(1)}`;

/** Totaux des champs closer sur des saisies (valeurs négatives, illisibles ou inconnues ignorées). */
export function closerTotals(entries: Array<{ metrics: Record<string, unknown> | null | undefined }>): CloserTotals {
  const out = Object.fromEntries(CLOSER_KEYS.map((k) => [k, 0])) as CloserTotals;
  for (const e of entries) for (const k of CLOSER_KEYS) out[k] += num(e.metrics?.[k]);
  return out;
}
/** Les six taux du rapport. */
export function closerRates(t: CloserTotals): CloserRates {
  return {
    showRate: closerPct(t.show_up, t.show_up + t.no_show),
    pitchRate: closerPct(t.pitchs, t.show_up),
    closeRate: closerPct(t.closes, t.show_up),
    pitchClose: closerPct(t.closes, t.pitchs),
    unqualified: closerPct(t.non_qualifies, t.show_up),
    average: t.closes > 0 ? Math.round((t.ca_signe / t.closes) * 100) / 100 : null,
  };
}
/** Totaux, taux et jours saisis (jours différents ayant une saisie) d'un ensemble de saisies. */
export function closerReport(entries: Array<{ day: string; metrics: Record<string, unknown> | null | undefined }>): CloserReport {
  const totals = closerTotals(entries);
  return { totals, rates: closerRates(totals), days: new Set(entries.map((e) => e.day)).size };
}
/** La saisie contient-elle au moins un chiffre de closer (anciennes clés comprises) ? */
export const hasCloserFigures = (metrics: Record<string, unknown> | null | undefined) => CLOSER_KEYS.some((k) => num(metrics?.[k]) > 0);
/** La saisie contient-elle au moins un chiffre de setter ? */
export const hasSetterFigures = (metrics: Record<string, unknown> | null | undefined) => SETTER_KEYS.some((k) => num(metrics?.[k]) > 0);
/** Des totaux non nuls (au moins un champ) ? */
export const anyCloserFigure = (t: CloserTotals) => CLOSER_KEYS.some((k) => t[k] > 0);
/** De quoi tracer l'entonnoir (rendez-vous et leurs résultats) ; les anciennes clés seules ne suffisent pas. */
export const hasFunnelFigures = (t: CloserTotals) => t.rdv_prevus + t.show_up + t.no_show + t.annules + t.non_qualifies + t.pitchs + t.closes + t.en_reflexion > 0;

/**
 * Avertissements doux d'une saisie, non bloquants : l'enregistrement reste possible (un jour peut mêler des rendez-vous
 * d'autres jours). Les valeurs vides comptent pour 0.
 */
export function closerWarnings(metrics: Record<string, unknown>): string[] {
  const v = (k: CloserKey) => num(metrics[k]);
  const out: string[] = [];
  if (v("rdv_prevus") > 0 && v("show_up") + v("no_show") + v("annules") > v("rdv_prevus")) out.push("Show-up, no-show et annulés dépassent les appels prévus.");
  if (v("non_qualifies") + v("pitchs") > v("show_up")) out.push("Non qualifiés et pitchs dépassent les show-up.");
  if (v("closes") + v("en_reflexion") > v("pitchs")) out.push("Closes et en réflexion dépassent les pitchs.");
  if (v("closes") > 0 && v("ca_signe") === 0) out.push("Tu as des closes : pense au CA signé.");
  return out;
}

/* ─────────────────────────── Entonnoir et pertes ─────────────────────────── */

export interface FunnelStep { key: CloserKey; label: string; count: number; /** Part de l'étape précédente (null pour la première, ou base nulle). */ ofPrevious: number | null; previous: string | null }
/** Appels prévus → Show-up → Pitchs → Closes, avec la part de l'étape précédente. */
export function closerFunnel(t: CloserTotals): FunnelStep[] {
  const steps: Array<[CloserKey, string, string | null]> = [["rdv_prevus", "Appels prévus", null], ["show_up", "Show-up", "des prévus"], ["pitchs", "Pitchs", "des show-up"], ["closes", "Closes", "des pitchs"]];
  return steps.map(([key, label, previous], i) => ({ key, label, count: t[key], previous, ofPrevious: i === 0 ? null : closerPct(t[key], t[steps[i - 1][0]]) }));
}
export interface LossRow { key: CloserKey; label: string; count: number; share: number | null; base: string; rule: string }
/** Ce qui n'a pas abouti : no-show et annulés (part des prévus), non qualifiés (des show-up), en réflexion (des pitchs). */
export function closerLosses(t: CloserTotals): LossRow[] {
  return [
    { key: "no_show", label: "No-show", count: t.no_show, share: closerPct(t.no_show, t.rdv_prevus), base: "des prévus", rule: "No-show ÷ appels prévus." },
    { key: "annules", label: "Annulés ou reportés", count: t.annules, share: closerPct(t.annules, t.rdv_prevus), base: "des prévus", rule: "Annulés ou reportés ÷ appels prévus." },
    { key: "non_qualifies", label: "Non qualifiés", count: t.non_qualifies, share: closerPct(t.non_qualifies, t.show_up), base: "des show-up", rule: CLOSER_RULES.unqualified },
    { key: "en_reflexion", label: "En réflexion", count: t.en_reflexion, share: closerPct(t.en_reflexion, t.pitchs), base: "des pitchs", rule: "En réflexion ÷ pitchs : à relancer." },
  ];
}

/* ─────────────────────────── Résumés et colonnes ─────────────────────────── */

const euroFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat("fr-FR");
/** Valeur d'un champ, prête à afficher : « 1 500 € » pour un montant, « 12 » sinon. */
export const formatField = (f: Pick<KpiField, "unit">, n: number) => (f.unit === "euro" ? euroFmt.format(n) : intFmt.format(n));
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
/**
 * Résumé d'un jour de closer, chiffres clés non nuls : « 3 show-up · 2 pitchs · 1 close · 1 500 € cash ».
 * Une ancienne saisie (relances, propositions seulement) est résumée avec ses propres champs.
 */
export function closerSummary(metrics: Record<string, unknown>): string {
  const v = (k: CloserKey) => num(metrics[k]);
  const key = [
    v("show_up") ? `${intFmt.format(v("show_up"))} show-up` : null,
    v("pitchs") ? `${intFmt.format(v("pitchs"))} ${plural(v("pitchs"), "pitch", "pitchs")}` : null,
    v("closes") ? `${intFmt.format(v("closes"))} ${plural(v("closes"), "close", "closes")}` : null,
    v("cash") ? `${euroFmt.format(v("cash"))} cash` : null,
  ].filter(Boolean);
  if (key.length) return key.join(" · ");
  return KPI_FIELDS.closer.filter((f) => num(metrics[f.key]) > 0).map((f) => `${formatField(f, num(metrics[f.key]))} ${(f.short ?? f.label).toLowerCase()}`).join(" · ");
}
/**
 * Résumé des chiffres de setter d'un jour : « 40 appels passés · 12 appels décrochés ». Vide sans chiffre.
 */
export function setterSummary(metrics: Record<string, unknown>): string {
  return KPI_FIELDS.setter.filter((f) => num(metrics[f.key]) > 0).map((f) => `${intFmt.format(num(metrics[f.key]))} ${f.label.toLowerCase()}`).join(" · ");
}
/**
 * Résumé d'un jour pour « Derniers jours » : les chiffres du rôle affiché, puis ceux de l'autre rôle (gardés après un
 * changement de rôle d'appel), annoncés par « Setter : » ou « Closer : ». Vide si rien n'est saisi.
 */
export function daySummary(metrics: Record<string, unknown>, role: "setter" | "closer"): string {
  const setter = setterSummary(metrics), closer = closerSummary(metrics);
  const [own, other, otherLabel] = role === "closer" ? [closer, setter, "Setter"] : [setter, closer, "Closer"];
  return [own, other ? `${otherLabel} : ${other}` : ""].filter(Boolean).join(" · ");
}
/**
 * Colonnes clés d'un closer dans le tableau des derniers jours (ordinateur) : pas les douze. L'essentiel d'abord
 * (closes, cash, CA signé), visible sans faire défiler, puis les rendez-vous.
 */
export const CLOSER_KEY_COLUMNS: CloserKey[] = ["closes", "cash", "ca_signe", "rdv_prevus", "show_up", "no_show", "pitchs"];

/* ─────────────────────────── Personnes retenues ─────────────────────────── */

type PersonLike = { who: string; role: string };
type RowLike = { who: string; day: string; metrics: Record<string, unknown> | null | undefined };
/**
 * Closers retenus, les mêmes pour KPI › Closers et pour le Tableau de bord (filtre Closers) : rôle closer (membre,
 * compte de l'agence qui a choisi Closer, lien), ou chiffres de closer saisis. `counted` : sur la période OU sur la
 * période d'avant, pour comparer les deux périodes sur les mêmes personnes (un administrateur repassé à « Aucun »,
 * un ancien membre restent comptés). `listed` : ceux à afficher ligne par ligne, rôle closer ou chiffres de closer
 * sur la période.
 */
export function closerPeople<P extends PersonLike>(people: P[], rows: RowLike[], range: { from: string; to: string; prevFrom: string }): { counted: P[]; listed: P[] } {
  const figures = (from: string) => new Set(rows.filter((r) => r.day >= from && r.day <= range.to && hasCloserFigures(r.metrics)).map((r) => r.who));
  const any = figures(range.prevFrom), cur = figures(range.from);
  return {
    counted: people.filter((p) => p.role === "closer" || any.has(p.who)),
    listed: people.filter((p) => p.role === "closer" || cur.has(p.who)),
  };
}
/** Champs regroupés pour le formulaire : [intitulé du groupe ou null, champs]. */
export function groupFields(fields: KpiField[]): Array<[string | null, KpiField[]]> {
  const out: Array<[string | null, KpiField[]]> = [];
  for (const f of fields) {
    const g = f.group ?? null, last = out[out.length - 1];
    if (last && last[0] === g) last[1].push(f); else out.push([g, [f]]);
  }
  return out;
}
