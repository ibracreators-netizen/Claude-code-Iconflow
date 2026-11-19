"use server";
import { getStore } from "@/lib/auth/session";
import { updateAvatar, updateProfile } from "@/lib/actions/profile";
import type { ActionResult } from "@/lib/actions/result";

/**
 * « Mon profil » de l'espace Marketing : nom affiché, fonction et photo, pour tout membre (agence ou commercial).
 * On s'appuie sur les actions de profil communes (le membre ne modifie que sa propre ligne : la base le garantit aussi).
 */
const MAX = 80;

/** Les comptes d'essai setter / closer de la démonstration n'ont pas de fiche à enregistrer. */
async function trialAccount(): Promise<boolean> {
  const store = await getStore();
  return store.session.demo && !(await store.profile(store.session.user.id));
}
const TRIAL = "Compte d'essai : en démonstration, ce profil ne s'enregistre pas.";

export async function saveMarketingProfile(input: { display_name: string; title: string }): Promise<ActionResult<{ display_name: string; title: string | null }>> {
  const name = String(input?.display_name ?? "").trim(), title = String(input?.title ?? "").trim();
  if (!name) return { ok: false, error: "Indique ton nom affiché." };
  if (name.length > MAX || title.length > MAX) return { ok: false, error: `${MAX} caractères au maximum par champ.` };
  if (await trialAccount()) return { ok: false, error: TRIAL };
  const res = await updateProfile({ display_name: name, title: title || null });
  return res.ok ? { ok: true, data: { display_name: res.data.display_name ?? name, title: res.data.title ?? null } } : res;
}

/** Photo de profil (URL publique du stockage, ou image intégrée en démonstration). null = retirer la photo. */
export async function saveMarketingAvatar(url: string | null): Promise<ActionResult<{ avatar_url: string | null }>> {
  if (await trialAccount()) return { ok: false, error: TRIAL };
  const res = await updateAvatar(url);
  return res.ok ? { ok: true, data: { avatar_url: res.data.avatar_url ?? null } } : res;
}
