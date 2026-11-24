"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, isAdmin } from "@/lib/marketing/crm-server";
import { GOOGLE_CALLS_SETTING } from "@/lib/marketing/google/calls-to-prospects";

/**
 * Réglages › Intégrations › Google Agenda : « Créer un prospect pour chaque appel de l'agenda Google ».
 * Réservé à l'administrateur. Éteint, plus rien n'est créé ; ce qui existe déjà n'est pas supprimé.
 */
export async function saveGoogleCallsSettingAction(enabled: boolean) {
  return run(async () => {
    const c = await crmAction("marketing_reglages");
    if (!isAdmin(c.session)) throw new Error("Seul l'administrateur peut changer ce réglage.");
    const on = enabled === true;
    await c.db.saveSetting(GOOGLE_CALLS_SETTING, { enabled: on, updated_at: new Date().toISOString(), updated_by: c.session.user.id });
    revalidatePath("/marketing", "layout");
    return on;
  });
}
