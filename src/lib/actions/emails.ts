"use server";
import { run } from "@/lib/actions/result";
import { authMessage } from "@/lib/auth/messages";
import { getStoreFor } from "@/lib/auth/session";
import { StoreError } from "@/lib/data/store";
import { isMailerConfigured, mailerSender, sendEmail } from "@/lib/email/mailer";
import { testEmail } from "@/lib/email/templates";
import { hasFullAccess } from "@/lib/permissions";
import { APP_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type TestEmailResult = { provider: "resend" | "supabase"; to: string };

/**
 * Paramètres → Emails : l'administrateur s'envoie un email de test à sa propre adresse.
 * Resend configuré : notre gabarit de test. Sinon : lien de connexion envoyé par Supabase,
 * le seul email que son service sait envoyer (et qui subit ses limites).
 */
export async function sendTestEmail() {
  return run<TestEmailResult>(async () => {
    const store = await getStoreFor("parametres");
    if (!hasFullAccess(store.session.profile)) throw new StoreError("admin_only");
    if (store.session.demo) throw new StoreError("En mode démo, aucun email n'est envoyé.");
    const to = store.session.user.email;
    if (!to) throw new StoreError("Ton compte n'a pas d'adresse email.");
    if (isMailerConfigured()) {
      await sendEmail({ to, ...testEmail({ name: store.session.profile.display_name, sender: mailerSender() ?? "" }) });
      return { provider: "resend", to };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: to, options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/auth/callback` } });
    if (error) {
      if (error.status === 429) throw new StoreError("Le service d'email par défaut de Supabase a atteint sa limite (environ 2 emails par heure). Réessaie plus tard, ou configure Resend ou un SMTP.");
      throw new StoreError(authMessage(error.code, error.status, error.message, "magic"));
    }
    return { provider: "supabase", to };
  });
}
