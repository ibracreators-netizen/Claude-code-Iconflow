"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, salesRole, type Crm } from "@/lib/marketing/crm-server";
import * as res from "@/lib/marketing/resources";
import type { MarketingRole } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing/ressources", "layout"); };
/** Écrire les ressources et les étapes : réservé aux membres de l'agence. Un commercial lit et coche sa progression. */
async function editor(): Promise<Crm> {
  const c = await crmAction("marketing_ressources");
  if (salesRole(c.session)) throw new Error("Seul un administrateur peut modifier les ressources.");
  return c;
}

export async function createResourceAction(input: { title: string; kind: res.ResourceKind; folder_id: string }) {
  return run(async () => { const c = await editor(); const d = await res.createDocument(c.db, input); rev(); return { id: d.id }; });
}
export async function updateResourceAction(id: string, patch: { title?: string; content?: string; kind?: res.ResourceKind }) {
  return run(async () => { const c = await editor(); await res.updateDocument(c.db, id, patch); rev(); });
}
export async function archiveResourceAction(id: string) {
  return run(async () => { const c = await editor(); await res.archiveDocument(c.db, id); rev(); });
}
export async function createStepAction(input: { role: MarketingRole; title: string; description?: string; document_id?: string | null }) {
  return run(async () => { const c = await editor(); const s = await res.createStep(c.db, input); rev(); return s; });
}
export async function updateStepAction(id: string, patch: { title?: string; description?: string | null; document_id?: string | null }) {
  return run(async () => { const c = await editor(); await res.updateStep(c.db, id, patch); rev(); });
}
export async function removeStepAction(id: string) {
  return run(async () => { const c = await editor(); await res.removeStep(c.db, id); rev(); });
}
export async function moveStepAction(id: string, dir: -1 | 1) {
  return run(async () => { const c = await editor(); await res.moveStep(c.db, id, dir); rev(); });
}
/** Chaque membre coche ses propres étapes (la base refuse de cocher pour un autre). */
export async function toggleStepAction(stepId: string, done: boolean) {
  return run(async () => { const c = await crmAction("marketing_ressources"); await res.setStepDone(c.db, stepId, c.session.user.id, done); rev(); });
}
