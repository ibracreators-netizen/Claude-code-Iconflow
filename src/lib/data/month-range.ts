/**
 * Intervalle d'un mois pour filtrer une colonne date `month` : début du mois inclus, premier jour du mois
 * suivant exclu. Évite les bornes invalides (« 2026-11-31 ») et gère le passage décembre → janvier.
 * Utiliser avec .gte("month", start).lt("month", nextStart).
 */
export function monthRange(month: string): { start: string; nextStart: string } {
  const ym = month.slice(0, 7); // "YYYY-MM"
  const [y, m] = ym.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { start: `${ym}-01`, nextStart: `${nextY}-${String(nextM).padStart(2, "0")}-01` };
}
