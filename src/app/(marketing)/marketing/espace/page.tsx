import { redirect } from "next/navigation";

/**
 * « Mon espace » n'existe plus : ce qu'il montrait (leads à appeler, relances, rendez-vous du jour, résultats à saisir)
 * est dans Tâches, onglet « Éléments à faire ». Les anciens liens y mènent, avec le membre choisi s'il y en avait un.
 */
export default async function EspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const membre = Array.isArray(sp.membre) ? sp.membre[0] : sp.membre;
  redirect(membre ? `/marketing/taches?membre=${encodeURIComponent(membre)}` : "/marketing/taches");
}
