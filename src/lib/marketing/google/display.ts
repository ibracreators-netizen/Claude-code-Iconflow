/**
 * Affichage des appels Google à côté des rendez-vous de l'app (Calendrier, « Appels à venir » du Tableau de bord),
 * et résumé du dernier import pour l'administrateur. Fonctions pures, vérifiables hors ligne
 * (scripts/google-calls-selfcheck.ts).
 */

export interface GoogleRowLike { id: string; profile_id: string; google_event_id?: string | null; appointment_id: string | null }

/**
 * Lignes de l'agenda Google à montrer. Une ligne reliée à un rendez-vous de l'app n'est sautée que si CE rendez-vous
 * a été lu : sous les droits du membre, il peut lui être invisible (rendez-vous attribué à un collègue du même rôle),
 * et l'appel disparaîtrait alors de son propre agenda. Le même événement dans les agendas de deux membres ne
 * s'affiche qu'une fois, au nom des deux (`owners`).
 */
export function googleRowsToShow<R extends GoogleRowLike>(rows: R[], shownAppointments: Iterable<string>): Array<{ row: R; owners: string[] }> {
  const seen = new Set(shownAppointments), byEvent = new Map<string, { row: R; owners: string[] }>(), list: Array<{ row: R; owners: string[] }> = [];
  for (const row of rows) {
    if (row.appointment_id && seen.has(row.appointment_id)) continue;   // déjà affiché comme rendez-vous de l'app
    const key = row.google_event_id ?? row.id, twin = byEvent.get(key);
    if (twin) { if (!twin.owners.includes(row.profile_id)) twin.owners.push(row.profile_id); continue; }
    const item = { row, owners: [row.profile_id] };
    byEvent.set(key, item); list.push(item);
  }
  return list;
}

/**
 * Lien vers la fiche du prospect d'un rendez-vous : seulement si ce prospect a été lu sous les droits du membre.
 * Sinon (prospect attribué à un autre membre), la fiche lui répondrait « introuvable » : pas de lien.
 */
export function prospectHref(prospectId: string, readable: boolean): string | null {
  return readable ? `/marketing/crm/${prospectId}` : null;
}

export interface GoogleRunLike { ok: boolean; error: string | null; stats: { created?: number; prospects?: number; contacts?: number; updated?: number; cancelled?: number; errors?: unknown[]; errorCount?: number } | null }
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Résumé d'un import des appels Google : toujours les compteurs (ce qui a été créé l'a bien été), puis le nombre
 * d'erreurs en français. Le texte brut des erreurs (souvent en anglais) reste dans le journal, jamais à l'écran.
 */
export function googleRunSummary(run: GoogleRunLike): string {
  const st = run.stats ?? {};
  const parts = [
    plural(st.created ?? 0, "rendez-vous créé", "rendez-vous créés"), plural(st.prospects ?? 0, "prospect créé", "prospects créés"),
    plural(st.contacts ?? 0, "contact créé", "contacts créés"), plural(st.updated ?? 0, "mis à jour", "mis à jour"), plural(st.cancelled ?? 0, "annulé", "annulés"),
  ];
  const errors = st.errorCount ?? (Array.isArray(st.errors) ? st.errors.length : 0);
  const failed = errors || (!run.ok ? 1 : 0);
  if (failed) parts.push(plural(failed, "erreur", "erreurs"));
  return parts.join(" · ");
}
