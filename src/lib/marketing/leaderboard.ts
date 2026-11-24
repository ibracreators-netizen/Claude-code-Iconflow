/**
 * Classement des performances des setters et des closers. Fonctions pures, sur des faits sans coordonnées.
 * Chaque chiffre a sa règle de calcul (affichée sous le chiffre). Quand les données ne suffisent pas, on
 * le dit : pas de classement fabriqué à partir de trois lignes.
 */
import type { FactAppointment, FactProspect, FactTask } from "./funnel";

/** En dessous de ce volume, un taux n'a pas de sens : on affiche « pas assez de données ». */
export const MIN_SAMPLE = 5;
/** Un classement demande au moins deux membres ayant chacun ce volume. */
export const MIN_MEMBERS = 2;

export const LEADERBOARD_RULES = {
  handled: "Prospects différents pour lesquels le setter a terminé au moins une tâche (« À appeler » ou relance) pendant la période.",
  booked: "Rendez-vous créés pendant la période et attribués au setter (ou pris pour un prospect dont il est le setter).",
  showRate: `Présents ÷ (présents + absents), sur ses rendez-vous de la période dont le résultat est connu. Annulés et reportés ne comptent pas. Moins de ${MIN_SAMPLE} résultats : pas assez de données.`,
  held: "Rendez-vous de la période dont il est le closer et dont le résultat est « présent ».",
  closeRate: `Parmi les prospects de ces appels tenus, part de ceux dont l'issue est « signé ». Moins de ${MIN_SAMPLE} appels tenus : pas assez de données.`,
  amount: "Somme des montants signés HT des prospects signés parmi ces appels tenus.",
  setterRank: "Classés par rendez-vous pris, puis par taux de présence.",
  closerRank: "Classés par montant signé, puis par taux de signature.",
} as const;

export interface SetterRow { id: string; name: string; handled: number; booked: number; shown: number; noShow: number; showRate: number | null }
export interface CloserRow { id: string; name: string; held: number; signed: number; closeRate: number | null; amount: number }
export interface Board<T> { rows: T[]; ranked: boolean; reason: string | null }

const rate = (a: number, b: number) => (b >= MIN_SAMPLE ? Math.round((a / b) * 1000) / 10 : null);

export function buildLeaderboard(input: { prospects: FactProspect[]; appointments: FactAppointment[]; tasks: FactTask[]; members: Array<{ id: string; name: string; marketing_role: string | null }>; from: string; to: string; now?: string }): { setters: Board<SetterRow>; closers: Board<CloserRow> } {
  const within = (d: string | null | undefined) => !!d && d >= input.from && d < input.to;
  const prospect = new Map(input.prospects.map((p) => [p.id, p]));
  const name = new Map(input.members.map((m) => [m.id, m.name]));
  const setterOf = (a: FactAppointment) => a.setter_id ?? prospect.get(a.prospect_id)?.setter_id ?? null;
  const closerOf = (a: FactAppointment) => a.closer_id ?? prospect.get(a.prospect_id)?.closer_id ?? null;

  // ── Setters ──
  const setters = new Map<string, SetterRow & { handledSet: Set<string> }>();
  const setter = (id: string) => { let r = setters.get(id); if (!r) { r = { id, name: name.get(id) ?? "Membre", handled: 0, booked: 0, shown: 0, noShow: 0, showRate: null, handledSet: new Set() }; setters.set(id, r); } return r; };
  for (const m of input.members) if (m.marketing_role === "setter") setter(m.id);
  for (const t of input.tasks) if (t.status === "faite" && t.done_by && t.prospect_id && (t.kind === "a_appeler" || t.kind === "relance") && within(t.done_at)) setter(t.done_by).handledSet.add(t.prospect_id);
  for (const a of input.appointments) {
    const s = setterOf(a); if (!s) continue;
    if (within(a.created_at)) setter(s).booked++;
    if (within(a.starts_at)) { if (a.result === "present") setter(s).shown++; else if (a.result === "absent") setter(s).noShow++; }
  }
  const setterRows: SetterRow[] = [...setters.values()].map(({ handledSet, ...r }) => ({ ...r, handled: handledSet.size, showRate: rate(r.shown, r.shown + r.noShow) }))
    // Un membre qui n'est pas setter n'apparaît que s'il a réellement une activité de setter.
    .filter((r) => input.members.find((m) => m.id === r.id)?.marketing_role === "setter" || r.handled + r.booked > 0)
    .sort((a, b) => b.booked - a.booked || (b.showRate ?? -1) - (a.showRate ?? -1) || b.handled - a.handled || a.name.localeCompare(b.name, "fr"));

  // ── Closers ──
  const closers = new Map<string, CloserRow & { heldSet: Set<string> }>();
  const closer = (id: string) => { let r = closers.get(id); if (!r) { r = { id, name: name.get(id) ?? "Membre", held: 0, signed: 0, closeRate: null, amount: 0, heldSet: new Set() }; closers.set(id, r); } return r; };
  for (const m of input.members) if (m.marketing_role === "closer") closer(m.id);
  for (const a of input.appointments) {
    const c = closerOf(a); if (!c || a.result !== "present" || !within(a.starts_at)) continue;
    const row = closer(c); row.held++; row.heldSet.add(a.prospect_id);
  }
  const closerRows: CloserRow[] = [...closers.values()].map(({ heldSet, ...r }) => {
    const signed = [...heldSet].map((id) => prospect.get(id)).filter((p) => p?.outcome === "signe");
    return { ...r, signed: signed.length, closeRate: rate(signed.length, heldSet.size), amount: Math.round(signed.reduce((s, p) => s + (Number(p?.signed_amount) || 0), 0) * 100) / 100 };
  }).filter((r) => input.members.find((m) => m.id === r.id)?.marketing_role === "closer" || r.held > 0)
    .sort((a, b) => b.amount - a.amount || (b.closeRate ?? -1) - (a.closeRate ?? -1) || b.held - a.held || a.name.localeCompare(b.name, "fr"));

  const enough = (volumes: number[]) => volumes.filter((v) => v >= MIN_SAMPLE).length >= MIN_MEMBERS;
  const why = (label: string) => `Pas assez de données : un classement demande au moins ${MIN_MEMBERS} membres ayant chacun ${MIN_SAMPLE} ${label} sur la période.`;
  const sOk = enough(setterRows.map((r) => r.booked)), cOk = enough(closerRows.map((r) => r.held));
  return {
    setters: { rows: setterRows, ranked: sOk, reason: sOk ? null : why("rendez-vous pris") },
    closers: { rows: closerRows, ranked: cOk, reason: cOk ? null : why("appels tenus") },
  };
}
