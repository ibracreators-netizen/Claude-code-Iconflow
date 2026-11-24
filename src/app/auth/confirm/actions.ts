"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { afterConfirm, isConfirmType, TOKEN_HASH_RE } from "@/lib/auth/confirm-link";

/**
 * Clic sur « Accepter l'invitation » (ou « Me connecter ») : vérifie le jeton auprès de Supabase, ce qui ouvre la session
 * (cookies posés par le client serveur), puis envoie vers le choix du mot de passe (invitation) ou la page demandée.
 * Jeton absent, mal formé, expiré ou déjà utilisé : retour sur la page avec un message clair, sans détail technique.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? ""), type = formData.get("type"), next = formData.get("next");
  if (!isSupabaseConfigured() || !TOKEN_HASH_RE.test(tokenHash) || !isConfirmType(type)) redirect("/auth/confirm?erreur=lien");
  let ok = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } catch {
    ok = false;
  }
  // redirect() lève une exception de navigation : jamais à l'intérieur du try.
  if (!ok) redirect("/auth/confirm?erreur=lien");
  redirect(afterConfirm(type, next));
}
