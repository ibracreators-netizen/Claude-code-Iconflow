"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, isAdmin, type Crm } from "@/lib/marketing/crm-server";
import { canManageKpiLinks, submitPublicKpiEntry, type PublicKpiResult } from "@/lib/marketing/kpi-links-server";
import { createPerson, deletePerson, deletePersonEntry, renewToken, setPersonActive, updatePerson, type KpiPerson } from "@/lib/marketing/kpi-links";

/*
 * Liens de saisie des KPI (KPI › Saisie des KPI). La gestion est réservée à qui gère l'espace
 * (membre de l'agence avec « Réglages marketing ») ; la base applique la même règle (migration 0028).
 * L'envoi depuis le lien public est en bas : sans session, le jeton est revérifié à chaque appel.
 */

const rev = () => { revalidatePath("/marketing", "layout"); };
async function manager(): Promise<Crm> {
  const c = await crmAction("marketing_reglages");
  if (!canManageKpiLinks(c)) throw new Error("Les liens de saisie sont gérés par l'administrateur et les membres de l'agence.");
  return c;
}
const id = (v: unknown): string => { if (typeof v !== "string" || !v || v.length > 80) throw new Error("Personne introuvable. Recharge la page."); return v; };

export async function createKpiPersonAction(input: { name: string; role: string; email?: string | null; phone?: string | null }) {
  return run(async (): Promise<KpiPerson> => { const c = await manager(); const p = await createPerson(c.db, input, c.session.user.id); rev(); return p; });
}
export async function updateKpiPersonAction(personId: string, input: { name: string; role: string; email?: string | null; phone?: string | null }) {
  return run(async (): Promise<KpiPerson> => { const c = await manager(); const p = await updatePerson(c.db, id(personId), input); rev(); return p; });
}
/** Nouveau lien : l'ancien cesse aussitôt de marcher. */
export async function renewKpiLinkAction(personId: string) {
  return run(async (): Promise<KpiPerson> => { const c = await manager(); const p = await renewToken(c.db, id(personId)); rev(); return p; });
}
export async function setKpiPersonActiveAction(personId: string, active: boolean) {
  return run(async (): Promise<KpiPerson> => { const c = await manager(); const p = await setPersonActive(c.db, id(personId), active === true); rev(); return p; });
}
/** Supprime la personne, son lien et ses saisies. */
export async function deleteKpiPersonAction(personId: string) {
  return run(async () => { const c = await manager(); await deletePerson(c.db, id(personId)); rev(); });
}

/** Envoi depuis la page publique /kpi/<jeton> (sans compte). */
export async function submitKpiLinkEntryAction(token: string, input: { day: string; metrics: Record<string, number>; note?: string | null }): Promise<PublicKpiResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "anon";
  return submitPublicKpiEntry(token, input, ip);
}

/**
 * Supprimer une saisie de KPI (suivi du jour d'un membre, ou saisie faite par lien). Réservé à l'administrateur :
 * un setter ou un closer corrige sa propre saisie, il ne la supprime pas. La base l'autorise aussi à l'administrateur
 * seulement (politiques de marketing_kpi_entries et marketing_kpi_person_entries).
 */
export async function deleteKpiEntryAction(kind: "membre" | "lien", entryId: string) {
  return run(async () => {
    const c = await crmAction("marketing_classement");
    if (!isAdmin(c.session)) throw new Error("Seul l'administrateur peut supprimer une saisie.");
    if (typeof entryId !== "string" || !entryId || entryId.length > 80) throw new Error("Saisie introuvable. Recharge la page.");
    if (kind === "membre") {
      const row = await c.db.get("marketing_kpi_entries", entryId);
      if (!row) throw new Error("Saisie introuvable : elle a peut-être déjà été supprimée. Recharge la page.");
      await c.db.remove("marketing_kpi_entries", entryId);
    } else if (kind === "lien") {
      if (!(await deletePersonEntry(c.db, entryId))) throw new Error("Saisie introuvable : elle a peut-être déjà été supprimée. Recharge la page.");
    } else throw new Error("Saisie inconnue.");
    rev();
  });
}
