"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, DEMO_COOKIE, DEMO_RETURN_COOKIE, isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth/redirects";
import { authMessage, RECENT_LINK_MESSAGE } from "@/lib/auth/messages";
import { getSession, getStore } from "@/lib/auth/session";
import { humanError, StoreError } from "@/lib/data/store";
import { isMailerConfigured, MailerError, sendEmail } from "@/lib/email/mailer";
import { magicLinkEmail } from "@/lib/email/templates";
import { canAccess } from "@/lib/permissions";

export type AuthState = { error?: string; sent?: boolean; email?: string } | null;

const credentials = z.object({ email: z.string().trim().email("Adresse email invalide."), password: z.string().min(6, "Mot de passe trop court.") });
const demoCookie = { httpOnly: true, sameSite: "lax" as const, path: "/" };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : APP_URL;
}

export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Supabase n'est pas configuré. Utilise le mode démo ci-dessous." };
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authMessage(error.code, error.status, error.message) };
  redirect(safeNext(formData.get("next")));
}

/** Compte connu du studio pour cet email, lu avec la clé service (la personne n'est pas connectée). */
type KnownAccount = { id: string; role: "agency" | "client"; display_name: string | null; disabled_at: string | null; email: string | null };
async function findAccount(admin: SupabaseClient, email: string): Promise<KnownAccount | null> {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`); // ilike : insensible à la casse, jokers neutralisés
  const { data, error } = await admin.from("profiles").select("id, role, display_name, disabled_at, email").ilike("email", pattern).limit(5);
  if (error) throw new StoreError(error.message, error.code);
  const rows = (data ?? []) as KnownAccount[];
  return rows.find((r) => !r.disabled_at) ?? rows[0] ?? null;
}
/** Délai minimal entre deux liens pour la même adresse : la règle de Supabase pour ses propres envois (60 s). */
const LINK_COOLDOWN_MS = 60_000;

/**
 * Lien magique. Quand le studio envoie lui-même ses emails (Resend) et dispose de la clé service, Supabase ne fait que
 * générer le lien et c'est notre email qui part : plus de limite du service par défaut. Le lien arrive en flux implicite
 * (#access_token), pris en charge par /auth/callback → /auth/finish. Sinon, Supabase envoie son propre email (flux PKCE).
 */
export async function signInWithMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Supabase n'est pas configuré. Utilise le mode démo ci-dessous." };
  const parsed = z.string().trim().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Adresse email invalide." };
  const email = parsed.data.toLowerCase();
  const next = safeNext(formData.get("next"));
  const callback = `${await origin()}/auth/callback${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`;

  // On ne génère jamais de lien pour un email inconnu : avec les inscriptions ouvertes, generateLink créerait un compte.
  const admin = isMailerConfigured() ? createAdminClient() : null;
  if (admin) {
    try {
      const account = await findAccount(admin, email);
      if (account?.disabled_at) return { error: authMessage("user_banned", 403, null, "magic") };
      const user = account ? (await admin.auth.admin.getUserById(account.id)).data.user : null;
      if (account && user) {
        if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return { error: authMessage("user_banned", 403, null, "magic") };
        // L'API admin n'applique aucune limite : on garde celle de Supabase pour ses propres envois, un lien par minute et par adresse.
        if (user.recovery_sent_at && Date.now() - Date.parse(user.recovery_sent_at) < LINK_COOLDOWN_MS) return { error: RECENT_LINK_MESSAGE };
        const to = user.email ?? account.email ?? email;
        const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: to, options: { redirectTo: callback } });
        if (error) return { error: authMessage(error.code, error.status, error.message, "magic") };
        await sendEmail({ to, ...magicLinkEmail({ name: account.display_name, link: data.properties.action_link, tone: account.role === "agency" ? "tu" : "vous" }) });
        return { sent: true, email: to };
      }
      // Aucun profil avec cet email (ou compte Auth introuvable) : Supabase tranche ci-dessous, sans jamais créer de compte.
    } catch (err) {
      // L'email du studio n'est pas parti : on le dit (message français du mailer), sans second envoi par Supabase.
      if (err instanceof MailerError) return { error: err.message };
      // Recherche du compte impossible (base pas à jour, clé service refusée…) : pas d'erreur technique à l'écran, Supabase envoie comme avant.
      console.error("[iconflow] lien magique : recherche du compte impossible, envoi confié à Supabase :", humanError(err));
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: false } });
  if (error) return { error: authMessage(error.code, error.status, error.message, "magic") };
  return { sent: true, email };
}

export async function enterDemo(role: "agency" | "client", next?: string) {
  if (isSupabaseConfigured()) redirect("/login");
  const store = await cookies();
  store.delete(DEMO_RETURN_COOKIE);
  store.set(DEMO_COOKIE, role, { ...demoCookie, maxAge: 60 * 60 * 24 * 7 });
  const home = role === "client" ? "/app" : "/studio";
  redirect(next ? safeNext(next, home) : home);
}

/**
 * Démo uniquement : voir le studio avec les droits d'un membre (pour vérifier ce qu'il verra).
 * Réservé aux membres ayant « Équipe & accès » ; le persona d'origine est conservé pour « Revenir à mon compte ».
 */
export async function previewAsMember(memberId: string) {
  if (isSupabaseConfigured()) redirect("/studio/equipe");
  const session = await getSession();
  if (!session || !canAccess(session.profile, "equipe")) redirect("/studio?refuse=equipe");
  const target = await (await getStore()).profile(memberId);
  if (!target || target.role !== "agency" || target.disabled_at) redirect("/studio/equipe");
  const store = await cookies();
  const current = store.get(DEMO_COOKIE)?.value ?? "agency";
  if (!store.get(DEMO_RETURN_COOKIE)) store.set(DEMO_RETURN_COOKIE, current, { ...demoCookie, maxAge: 60 * 60 * 24 });
  store.set(DEMO_COOKIE, `member:${memberId}`, { ...demoCookie, maxAge: 60 * 60 * 24 });
  redirect("/studio");
}

/** Fin de l'aperçu : retour au compte d'origine. */
export async function endPreview() {
  const store = await cookies();
  const back = store.get(DEMO_RETURN_COOKIE)?.value;
  store.delete(DEMO_RETURN_COOKIE);
  if (back) store.set(DEMO_COOKIE, back, { ...demoCookie, maxAge: 60 * 60 * 24 * 7 });
  redirect(back ? "/studio/equipe" : "/login");
}

export async function signOut() {
  const store = await cookies();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  store.delete(DEMO_COOKIE);
  store.delete(DEMO_RETURN_COOKIE);
  redirect("/login");
}
