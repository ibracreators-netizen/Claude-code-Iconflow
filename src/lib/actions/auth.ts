"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { APP_URL, DEMO_COOKIE, isSupabaseConfigured } from "@/lib/supabase/env";

export type AuthState = { error?: string; sent?: boolean } | null;

const credentials = z.object({ email: z.string().trim().email("Adresse email invalide."), password: z.string().min(6, "Mot de passe trop court.") });

function authMessage(code?: string, status?: number) {
  if (code === "email_not_confirmed") return "Confirme ton adresse email avant de te connecter.";
  if (status === 429) return "Trop de tentatives. Patiente quelques instants.";
  if (code === "invalid_credentials" || status === 400) return "Email ou mot de passe incorrect.";
  return "Connexion impossible pour le moment. Réessaie dans un instant.";
}

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
  if (error) return { error: authMessage(error.code, error.status) };
  redirect(String(formData.get("next") || "/"));
}

export async function signInWithMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Supabase n'est pas configuré. Utilise le mode démo ci-dessous." };
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Adresse email invalide." };
  const supabase = await createClient();
  const next = String(formData.get("next") || "/");
  const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false } });
  if (error) return { error: authMessage(error.code, error.status) };
  return { sent: true };
}

export async function enterDemo(role: "agency" | "client", next?: string) {
  if (isSupabaseConfigured()) redirect("/login");
  const store = await cookies();
  store.set(DEMO_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect(next && next.startsWith("/") ? next : role === "client" ? "/app" : "/studio");
}

/** Démo uniquement : voir le studio avec les droits d'un membre (pour vérifier ce qu'il verra). */
export async function previewAsMember(memberId: string) {
  if (isSupabaseConfigured()) redirect("/studio/equipe");
  const store = await cookies();
  store.set(DEMO_COOKIE, `member:${memberId}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  redirect("/studio");
}

export async function signOut() {
  const store = await cookies();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  store.delete(DEMO_COOKIE);
  redirect("/login");
}
