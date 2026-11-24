"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, type Crm } from "@/lib/marketing/crm-server";
import {
  canManageOnboardingLink, changeOnboardingLink, forgetOnboarding, openOnboarding, setOnboardingLinkEnabled, toggleWelcomeStep,
  type AdminLink, type OpenResult, type StepResult,
} from "@/lib/marketing/onboarding-link-server";

/*
 * Lien d'onboarding (page Ressources). La gestion est réservée à l'administrateur et aux membres de l'agence qui
 * peuvent écrire les ressources ; les actions de la page publique /bienvenue/<jeton> sont en bas : sans compte,
 * le jeton, le cookie d'accès et la version du lien sont revérifiés à chaque appel.
 */

async function manager(): Promise<Crm> {
  const c = await crmAction("marketing_ressources");
  if (!canManageOnboardingLink(c)) throw new Error("Le lien d'onboarding est géré par l'administrateur et les membres de l'agence.");
  return c;
}
const rev = () => { revalidatePath("/marketing/ressources"); };

/** « Changer le lien » : un nouveau lien remplace l'ancien, qui ne marche plus (ni les accès déjà ouverts). */
export async function changeOnboardingLinkAction() {
  return run(async (): Promise<AdminLink> => { await manager(); const r = await changeOnboardingLink(); rev(); return r; });
}
/** « Lien actif » : couper ou rallumer le lien. */
export async function setOnboardingLinkActiveAction(enabled: boolean) {
  return run(async (): Promise<AdminLink> => { await manager(); const r = await setOnboardingLinkEnabled(enabled === true); rev(); return r; });
}

/* ─────────────────────────── Page publique (sans compte) ─────────────────────────── */

async function ip(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "anon";
}
/** La recrue tape son e-mail pour ouvrir son onboarding. */
export async function openOnboardingAction(token: string, email: string): Promise<OpenResult> {
  return openOnboarding(token, email, await ip());
}
/** « Ce n'est pas moi » : efface l'accès ouvert sur cet appareil. */
export async function forgetOnboardingAction(): Promise<{ ok: true }> {
  await forgetOnboarding();
  return { ok: true };
}
/** Un membre coche ou décoche une étape de son onboarding. */
export async function toggleWelcomeStepAction(token: string, stepId: string, done: boolean): Promise<StepResult> {
  return toggleWelcomeStep(token, stepId, done, await ip());
}
